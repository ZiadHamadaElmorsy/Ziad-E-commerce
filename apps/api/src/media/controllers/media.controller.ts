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
} from '@nestjs/common';
import type { Request } from 'express';
import { CreateMediaQueryDto } from '../dto/create-media-query.dto';
import { readRawBody } from '../domain/read-raw-body';
import { MediaService } from '../services/media.service';

/**
 * Media API (docs/API-SPEC.md §29).
 *
 *   POST   /api/v1/media            create a media upload (direct server upload)
 *   GET    /api/v1/media/:mediaId   read the media metadata + storage reference
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
  constructor(private readonly media: MediaService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Req() req: Request, @Query() query: CreateMediaQueryDto) {
    const data = await readRawBody(req);
    const media = await this.media.createUpload({
      data,
      contentType: req.headers['content-type'],
      altText: query.altText,
    });
    return { data: media };
  }

  @Get(':mediaId')
  async get(@Param('mediaId') mediaId: string) {
    const media = await this.media.getMedia(mediaId);
    return { data: media };
  }

  @Delete(':mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('mediaId') mediaId: string) {
    await this.media.deleteMedia(mediaId);
  }
}
