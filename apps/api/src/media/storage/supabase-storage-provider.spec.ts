import { ConfigService } from '@nestjs/config';
import { StorageError } from '../../common/errors/domain-exceptions';
import { SupabaseStorageProvider } from './supabase-storage-provider';

describe('SupabaseStorageProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function configService(config: Record<string, unknown>): ConfigService {
    return {
      get: jest.fn().mockImplementation((key: string) => config[key]),
    } as unknown as ConfigService;
  }

  function configuredProvider(): SupabaseStorageProvider {
    return new SupabaseStorageProvider(
      configService({
        supabase: {
          url: 'https://example.supabase.co/',
          serviceRoleKey: 'service-role-secret',
          storageBucket: 'media',
        },
      }),
    );
  }

  describe('uploadObject', () => {
    it('stores the object through the Supabase Storage REST API', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as unknown as typeof fetch;

      await configuredProvider().uploadObject('store-1/media-1', Buffer.from('abc'), 'image/png');

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/storage/v1/object/media/store-1/media-1');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer service-role-secret');
      expect(init.headers['Content-Type']).toBe('image/png');
      expect(Buffer.from(init.body)).toEqual(Buffer.from('abc'));
    });

    it('throws StorageError when the storage API rejects the upload', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch;

      await expect(
        configuredProvider().uploadObject('store-1/media-1', Buffer.from('abc'), 'image/png'),
      ).rejects.toBeInstanceOf(StorageError);
    });

    it('throws StorageError on a transport failure and never leaks the token', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('connection refused')) as unknown as typeof fetch;

      await expect(
        configuredProvider().uploadObject('store-1/media-1', Buffer.from('abc'), 'image/png'),
      ).rejects.toBeInstanceOf(StorageError);
    });

    it('fails closed with StorageError when credentials/bucket are missing', async () => {
      const fetchMock = jest.fn();
      global.fetch = fetchMock as unknown as typeof fetch;

      const unconfigured = new SupabaseStorageProvider(configService({ supabase: {} }));

      await expect(
        unconfigured.uploadObject('store-1/media-1', Buffer.from('abc'), 'image/png'),
      ).rejects.toBeInstanceOf(StorageError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('deleteObject', () => {
    it('deletes the object through the Supabase Storage REST API', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as unknown as typeof fetch;

      await configuredProvider().deleteObject('store-1/media-1');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://example.supabase.co/storage/v1/object/media/store-1/media-1');
      expect(init.method).toBe('DELETE');
      expect(init.headers.Authorization).toBe('Bearer service-role-secret');
    });

    it('treats HTTP 404 as success (object already absent — idempotent-safe)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
      global.fetch = fetchMock as unknown as typeof fetch;

      await expect(configuredProvider().deleteObject('store-1/media-1')).resolves.toBeUndefined();
    });

    it('throws StorageError on other non-2xx responses', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch;

      await expect(configuredProvider().deleteObject('store-1/media-1')).rejects.toBeInstanceOf(
        StorageError,
      );
    });

    it('throws StorageError on a transport failure', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('socket hang up')) as unknown as typeof fetch;

      await expect(configuredProvider().deleteObject('store-1/media-1')).rejects.toBeInstanceOf(
        StorageError,
      );
    });
  });

  it('URL-encodes each storage path segment', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as unknown as typeof fetch;

    await configuredProvider().uploadObject(
      'store 1/media 1/naïve.png',
      Buffer.from('x'),
      'image/png',
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://example.supabase.co/storage/v1/object/media/store%201/media%201/na%C3%AFve.png',
    );
  });
});
