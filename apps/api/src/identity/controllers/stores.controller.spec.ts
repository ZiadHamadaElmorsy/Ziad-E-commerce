import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { StoreService } from '../services/store.service';
import { StoresController } from './stores.controller';

describe('StoresController', () => {
  let storeService: {
    createStore: jest.Mock;
    getCurrentStore: jest.Mock;
    updateCurrentStore: jest.Mock;
  };
  let controller: StoresController;

  beforeEach(() => {
    storeService = {
      createStore: jest.fn(),
      getCurrentStore: jest.fn(),
      updateCurrentStore: jest.fn(),
    };
    controller = new StoresController(storeService as unknown as StoreService);
  });

  it('POST /stores delegates to the service and wraps the result in the data envelope', async () => {
    storeService.createStore.mockResolvedValue({ id: 'store-1', name: 'My Store' });

    const dto = new CreateStoreDto();
    dto.name = 'My Store';
    dto.slug = 'my-store';

    const result = await controller.create(dto);

    expect(storeService.createStore).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ data: { id: 'store-1', name: 'My Store' } });
  });

  it('GET /stores/current delegates to the service', async () => {
    storeService.getCurrentStore.mockResolvedValue({ id: 'store-1' });

    const result = await controller.getCurrent();

    expect(result).toEqual({ data: { id: 'store-1' } });
  });

  it('PATCH /stores/current delegates to the service', async () => {
    storeService.updateCurrentStore.mockResolvedValue({ id: 'store-1', name: 'Updated' });

    const dto = new UpdateStoreDto();
    dto.name = 'Updated';

    const result = await controller.updateCurrent(dto);

    expect(storeService.updateCurrentStore).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ data: { id: 'store-1', name: 'Updated' } });
  });
});
