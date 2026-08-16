import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CreateMediaQueryDto } from '../dto/create-media-query.dto';
import { readRawBody } from '../domain/read-raw-body';
import { mapUploadTooLargeError, MediaService } from '../services/media.service';

/**
 * Media API (docs/API-SPEC.md §29).
 *
 *   POST   /api/v1/media            create a media upload (direct server upload)
 *   GET    /api/v1/media/:mediaId   read the media metadata + storage reference
 *   GET    /api/v1/media/:mediaId/content   stream the binary (merchant dashboard)
 *   DELETE /api/v1/media/:mediaId   delete the media (metadata + storage object)
 *
 * Thin controller; every route is authenticated + tenant-scoped via the global
 * guard chain (AuthGuard -> TenantContextGuard -> RolesGuard). The request
 * body is the raw media binary; the Content-Type header and the optional
 * `altText` query parameter carry the metadata (OPEN DECISION — the upload
 * request format is not defined by the API-SPEC, see the phase report).
 */
@Controller('media')
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Query() query: CreateMediaQueryDto) {
    try {
      const data = await readRawBody(req, this.maxUploadBytes());
      const media = await this.media.createUpload({
        data,
        contentType: req.headers['content-type'],
        altText: query.altText,
      });
      return { data: media };
    } catch (error) {
      throw mapUploadTooLargeError(error);
    }
  }

  /** Configured maximum upload size (MEDIA_MAX_UPLOAD_BYTES). */
  private maxUploadBytes(): number {
    const value = this.config.get<number>('media.maxUploadBytes');
    return Number.isInteger(value) && (value as number) > 0
      ? (value as number)
      : 10 * 1024 * 1024;
  }

  @Get(':mediaId')
  async get(@Param('mediaId') mediaId: string) {
    const media = await this.media.getMedia(mediaId);
    return { data: media };
  }

  @Get(':mediaId/content')
  async getContent(@Param('mediaId') mediaId: string, @Res() response: Response): Promise<void> {
    const { buffer, mimeType } = await this.media.getMediaContent(mediaId);
    if (mimeType) {
      response.type(mimeType);
    }
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.send(buffer);
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('mediaId') mediaId: string) {
    await this.media.deleteMedia(mediaId);
  }
}
