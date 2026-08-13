import 'reflect-metadata';
import { AdjustInventoryDto } from '../dto/adjust-inventory.dto';
import { ListMovementsQueryDto } from '../dto/list-movements-query.dto';
import { InventoryService } from '../services/inventory.service';
import { InventoryController } from './inventory.controller';

describe('InventoryController', () => {
  let inventory: {
    getInventory: jest.Mock;
    adjust: jest.Mock;
    listMovements: jest.Mock;
  };
  let controller: InventoryController;

  beforeEach(() => {
    inventory = { getInventory: jest.fn(), adjust: jest.fn(), listMovements: jest.fn() };
    controller = new InventoryController(inventory as unknown as InventoryService);
  });

  it('GET /variants/:variantId/inventory delegates to the service and wraps in the data envelope', async () => {
    inventory.getInventory.mockResolvedValue({
      variantId: 'variant-1',
      onHand: 10,
      reserved: 3,
      available: 7,
    });

    const result = await controller.getInventory('variant-1');

    expect(inventory.getInventory).toHaveBeenCalledWith('variant-1');
    expect(result).toEqual({
      data: { variantId: 'variant-1', onHand: 10, reserved: 3, available: 7 },
    });
  });

  it('POST /variants/:variantId/inventory/adjust delegates to the service', async () => {
    inventory.adjust.mockResolvedValue({
      variantId: 'variant-1',
      onHand: 10,
      reserved: 0,
      available: 10,
    });

    const dto = new AdjustInventoryDto();
    dto.quantity = 10;
    dto.reason = 'INITIAL_STOCK';

    const result = await controller.adjust('variant-1', dto);

    expect(inventory.adjust).toHaveBeenCalledWith('variant-1', dto);
    expect(result).toEqual({
      data: { variantId: 'variant-1', onHand: 10, reserved: 0, available: 10 },
    });
  });

  it('GET /variants/:variantId/inventory/movements delegates and returns the collection envelope', async () => {
    inventory.listMovements.mockResolvedValue({
      items: [{ id: 'mov-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    const query = new ListMovementsQueryDto();
    const result = await controller.listMovements('variant-1', query);

    expect(inventory.listMovements).toHaveBeenCalledWith('variant-1', query);
    expect(result).toEqual({
      data: [{ id: 'mov-1' }],
      meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });
});
