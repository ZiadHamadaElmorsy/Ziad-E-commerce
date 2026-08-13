import 'reflect-metadata';
import { UpdateThemeDto } from '../dto/update-theme.dto';
import { ThemeService } from '../services/theme.service';
import { ThemeController } from './theme.controller';

describe('ThemeController', () => {
  let theme: { getTheme: jest.Mock; updateTheme: jest.Mock };
  let controller: ThemeController;

  beforeEach(() => {
    theme = { getTheme: jest.fn(), updateTheme: jest.fn() };
    controller = new ThemeController(theme as unknown as ThemeService);
  });

  it('GET /theme delegates to the service', async () => {
    theme.getTheme.mockResolvedValue({ id: 'theme-1', logoMediaId: null, config: {} });

    expect(await controller.get()).toEqual({
      data: { id: 'theme-1', logoMediaId: null, config: {} },
    });
  });

  it('PUT /theme delegates to the service', async () => {
    theme.updateTheme.mockResolvedValue({
      id: 'theme-1',
      logoMediaId: null,
      config: { primaryColor: '#000000' },
    });

    const dto = new UpdateThemeDto();
    dto.primaryColor = '#000000';

    expect(await controller.update(dto)).toEqual({
      data: { id: 'theme-1', logoMediaId: null, config: { primaryColor: '#000000' } },
    });
    expect(theme.updateTheme).toHaveBeenCalledWith(dto);
  });
});
