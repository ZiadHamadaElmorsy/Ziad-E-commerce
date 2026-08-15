import { Readable } from 'node:stream';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { CreateMediaQueryDto } from '../dto/create-media-query.dto';
import { MediaController } from './media.controller';
import { MediaService } from '../services/media.service';
import { ValidationError } from '../../common/errors/domain-exceptions';

describe('MediaController', () => {
  let media: { createUpload: jest.Mock; getMedia: jest.Mock; deleteMedia: jest.Mock };
  let controller: MediaController;

  beforeEach(() => {
    media = {
      createUpload: jest.fn().mockResolvedValue({ id: 'media-1' }),
      getMedia: jest.fn().mockResolvedValue({ id: 'media-1' }),
      deleteMedia: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue(10 * 1024 * 1024) };
    controller = new MediaController(
      media as unknown as MediaService,
      config as unknown as ConfigService,
    );
  });

  function binaryRequest(contentType?: string): Request {
    const stream = Readable.from([Buffer.from('PNGDATA')]);
    const request = stream as unknown as { headers: Record<string, string | undefined> } & Request;
    request.headers = { 'content-type': contentType };
    return request as Request;
  }

  describe('POST /media', () => {
    it('forwards the raw body, Content-Type and altText to the service', async () => {
      const query = new CreateMediaQueryDto();
      query.altText = 'My logo';

      const result = await controller.create(binaryRequest('image/png'), query);

      expect(media.createUpload).toHaveBeenCalledWith({
        data: Buffer.from('PNGDATA'),
        contentType: 'image/png',
        altText: 'My logo',
      });
      expect(result).toEqual({ data: { id: 'media-1' } });
    });

    it('passes an undefined Content-Type through (service rejects it)', async () => {
      const query = new CreateMediaQueryDto();
      await controller.create(binaryRequest(undefined), query);
      expect(media.createUpload).toHaveBeenCalledWith({
        data: Buffer.from('PNGDATA'),
        contentType: undefined,
        altText: undefined,
      });
    });

    it('maps an oversized raw body to the API validation error (Phase 21)', async () => {
      const controllerTight = new MediaController(
        media as unknown as MediaService,
        { get: jest.fn().mockReturnValue(4) } as unknown as ConfigService,
      );
      const query = new CreateMediaQueryDto();

      await expect(controllerTight.create(binaryRequest('image/png'), query)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(media.createUpload).not.toHaveBeenCalled();
    });
  });

  describe('GET /media/:mediaId', () => {
    it('delegates to the service and wraps the result in the data envelope', async () => {
      const result = await controller.get('media-1');
      expect(media.getMedia).toHaveBeenCalledWith('media-1');
      expect(result).toEqual({ data: { id: 'media-1' } });
    });
  });

  describe('DELETE /media/:mediaId', () => {
    it('delegates to the service (204 is set via @HttpCode decorator)', async () => {
      const result = await controller.remove('media-1');
      expect(media.deleteMedia).toHaveBeenCalledWith('media-1');
      expect(result).toBeUndefined();
    });
  });
});
