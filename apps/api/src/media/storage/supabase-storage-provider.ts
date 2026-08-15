import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageError } from '../../common/errors/domain-exceptions';
import type { SupabaseConfig } from '../../config/configuration';
import { StorageProvider } from './storage-provider';

/** Required Supabase Storage configuration, resolved and validated at call time. */
interface StorageEndpointConfig {
  baseUrl: string;
  bucket: string;
  serviceRoleKey: string;
}

/**
 * Supabase Storage provider (docs/DATABASE.md §7.25/§22.2).
 *
 * Server-side object upload/delete through the Supabase Storage REST API
 * (`POST/DELETE /storage/v1/object/{bucket}/{path}`) using the project's
 * SERVICE-ROLE key. Credentials are only ever read from the environment and
 * are never logged. When any required value is missing the provider FAILS
 * CLOSED with a StorageError — mirroring the Supabase Auth provider's
 * behavior (no "trust anything" fallback).
 *
 * - Object keys are URL-encoded per path segment for the HTTP request; the
 *   raw key (storage_path) is what the database stores.
 * - `deleteObject` treats HTTP 404 as success: the object is already absent,
 *   which is consistent with the DELETE media contract (metadata removal).
 *   Other non-2xx responses fail with StorageError.
 *
 * STATUS: Supabase credentials are not present in the current environment, so
 * live Supabase Storage integration is NOT operational yet. The boundary is
 * fully implemented and unit-tested with mocked `fetch`.
 */
@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  private readonly logger = new Logger(SupabaseStorageProvider.name);

  constructor(private readonly configService: ConfigService) {}

  async uploadObject(key: string, data: Buffer, contentType: string): Promise<void> {
    const config = this.resolveConfig();

    let response: Response;
    try {
      response = await fetch(this.objectUrl(config, key), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': contentType,
        },
        // Buffer is a Uint8Array but its ArrayBufferLike generic does not
        // satisfy @types/node's BodyInit directly; the cast is type-only.
        body: data as unknown as BodyInit,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Do NOT echo credentials or the token; log only the transport-level reason.
      this.logger.warn(`Supabase Storage upload request failed: ${message}`);
      throw new StorageError('The media file could not be stored.');
    }

    if (!response.ok) {
      this.logger.warn(`Supabase Storage upload failed with status ${response.status}.`);
      throw new StorageError('The media file could not be stored.');
    }
  }

  async downloadObject(key: string): Promise<Buffer> {
    const config = this.resolveConfig();

    let response: Response;
    try {
      response = await fetch(this.objectUrl(config, key), {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.serviceRoleKey}` },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Supabase Storage download request failed: ${message}`);
      throw new StorageError('The media file could not be retrieved.');
    }

    if (!response.ok) {
      this.logger.warn(`Supabase Storage download failed with status ${response.status}.`);
      throw new StorageError('The media file could not be retrieved.');
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async deleteObject(key: string): Promise<void> {
    const config = this.resolveConfig();

    let response: Response;
    try {
      response = await fetch(this.objectUrl(config, key), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.serviceRoleKey}` },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Supabase Storage delete request failed: ${message}`);
      throw new StorageError('The media object could not be removed from storage.');
    }

    if (response.status === 404) {
      // Already absent: consistent with the DELETE media contract (metadata
      // removal). Treat as success (idempotent-safe).
      this.logger.warn(`Supabase Storage object not found during delete: ${key}`);
      return;
    }
    if (!response.ok) {
      this.logger.warn(`Supabase Storage delete failed with status ${response.status}.`);
      throw new StorageError('The media object could not be removed from storage.');
    }
  }

  private resolveConfig(): StorageEndpointConfig {
    const supabase = this.configService.get<SupabaseConfig>('supabase') ?? {};
    const { url, serviceRoleKey } = supabase;
    const bucket = supabase.storageBucket;

    if (!url || !serviceRoleKey || !bucket) {
      this.logger.warn(
        'Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET missing); failing closed.',
      );
      throw new StorageError('Media storage is not configured.');
    }

    return {
      baseUrl: url.replace(/\/+$/, ''),
      bucket,
      serviceRoleKey,
    };
  }

  private objectUrl(config: StorageEndpointConfig, key: string): string {
    const encodedPath = key
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${config.baseUrl}/storage/v1/object/${encodeURIComponent(config.bucket)}/${encodedPath}`;
  }
}
