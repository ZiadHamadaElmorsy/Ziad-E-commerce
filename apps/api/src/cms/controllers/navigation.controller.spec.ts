import 'reflect-metadata';
import { UpdateNavigationDto } from '../dto/update-navigation.dto';
import { NavigationService } from '../services/navigation.service';
import { NavigationController } from './navigation.controller';

describe('NavigationController', () => {
  let navigation: { getNavigation: jest.Mock; updateNavigation: jest.Mock };
  let controller: NavigationController;

  beforeEach(() => {
    navigation = { getNavigation: jest.fn(), updateNavigation: jest.fn() };
    controller = new NavigationController(navigation as unknown as NavigationService);
  });

  it('GET /navigation delegates to the service', async () => {
    navigation.getNavigation.mockResolvedValue({ id: 'nav-1', name: 'Main', items: [] });

    expect(await controller.get()).toEqual({ data: { id: 'nav-1', name: 'Main', items: [] } });
  });

  it('PUT /navigation delegates to the service', async () => {
    navigation.updateNavigation.mockResolvedValue({ id: 'nav-1', name: 'Footer', items: [] });

    const dto = new UpdateNavigationDto();
    dto.name = 'Footer';
    dto.items = [];

    expect(await controller.update(dto)).toEqual({
      data: { id: 'nav-1', name: 'Footer', items: [] },
    });
    expect(navigation.updateNavigation).toHaveBeenCalledWith(dto);
  });
});
