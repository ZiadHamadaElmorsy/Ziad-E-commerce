import 'reflect-metadata';
import { UpdateVariantDto } from '../dto/update-variant.dto';
import { VariantsService } from '../services/variants.service';
import { VariantsController } from './variants.controller';

describe('VariantsController', () => {
  let variants: { update: jest.Mock; archive: jest.Mock };
  let controller: VariantsController;

  beforeEach(() => {
    variants = { update: jest.fn(), archive: jest.fn() };
    controller = new VariantsController(variants as unknown as VariantsService);
  });

  it('PATCH /variants/:variantId delegates to the service', async () => {
    variants.update.mockResolvedValue({ id: 'variant-1', price: 550 });

    const dto = new UpdateVariantDto();
    dto.price = 550;

    expect(await controller.update('variant-1', dto)).toEqual({
      data: { id: 'variant-1', price: 550 },
    });
    expect(variants.update).toHaveBeenCalledWith('variant-1', dto);
  });

  it('POST /variants/:variantId/archive delegates to the service', async () => {
    variants.archive.mockResolvedValue({ id: 'variant-1', status: 'ARCHIVED' });

    expect(await controller.archive('variant-1')).toEqual({
      data: { id: 'variant-1', status: 'ARCHIVED' },
    });
    expect(variants.archive).toHaveBeenCalledWith('variant-1');
  });
});
