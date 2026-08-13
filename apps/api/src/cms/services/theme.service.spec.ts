import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError, TenantContextRequiredError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { UpdateThemeDto } from '../dto/update-theme.dto';
import { ThemeRepository } from '../repositories/theme.repository';
import { CmsAuditService } from './cms-audit.service';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let themes: {
    findByStoreId: jest.Mock;
    findByStoreIdTx: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    findMediaInStore: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let audit: { write: jest.Mock };
  let service: ThemeService;

  const themeRow = {
    id: 'theme-1',
    storeId: 'store-1',
    logoMediaId: null,
    config: {},
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    themes = {
      findByStoreId: jest.fn(),
      findByStoreIdTx: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMediaInStore: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };
    audit = { write: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new ThemeService(
      requestContext as unknown as RequestContextService,
      themes as unknown as ThemeRepository,
      transaction as unknown as TransactionService,
      audit as unknown as CmsAuditService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  describe('getTheme', () => {
    it('requires a store tenant context', async () => {
      await expect(service.getTheme()).rejects.toBeInstanceOf(TenantContextRequiredError);
    });

    it('returns the existing theme configuration', async () => {
      withTenant();
      themes.findByStoreId.mockResolvedValue({ ...themeRow, config: { primaryColor: '#000000' } });

      const result = await service.getTheme();

      expect(themes.findByStoreId).toHaveBeenCalledWith('store-1');
      expect(result).toMatchObject({ id: 'theme-1', logoMediaId: null });
      expect(result.config).toEqual({ primaryColor: '#000000' });
    });

    describe('updateTheme', () => {
      it('replaces the config and audits the change', async () => {
        withTenant();
        themes.findByStoreIdTx.mockResolvedValue(themeRow);
        themes.update.mockResolvedValue({ count: 1 });

        const dto = new UpdateThemeDto();
        dto.primaryColor = '#000000';
        dto.fontFamily = 'Inter';

        const result = await service.updateTheme(dto);

        expect(themes.update).toHaveBeenCalledWith(
          expect.anything(),
          'store-1',
          'theme-1',
          expect.objectContaining({ config: { primaryColor: '#000000', fontFamily: 'Inter' } }),
        );
        expect(audit.write).toHaveBeenCalledWith(
          expect.anything(),
          'store-1',
          'theme.updated',
          'theme_configuration',
          'theme-1',
          expect.objectContaining({ config: { primaryColor: '#000000', fontFamily: 'Inter' } }),
        );
        expect(result.config).toEqual({ primaryColor: '#000000', fontFamily: 'Inter' });
      });

      it('rejects an invalid hex primaryColor', async () => {
        withTenant();

        const dto = new UpdateThemeDto();
        dto.primaryColor = 'red';

        await expect(service.updateTheme(dto)).rejects.toBeInstanceOf(Error);
        expect(themes.update).not.toHaveBeenCalled();
      });

      it('validates the logo reference store-scoped (fails closed)', async () => {
        withTenant();
        themes.findByStoreIdTx.mockResolvedValue(themeRow);
        themes.findMediaInStore.mockResolvedValue(null);

        const dto = new UpdateThemeDto();
        dto.logoMediaId = 'media-999';

        await expect(service.updateTheme(dto)).rejects.toBeInstanceOf(NotFoundError);
        expect(themes.update).not.toHaveBeenCalled();
      });

      it('sets the logo reference when the media row exists in the store', async () => {
        withTenant();
        themes.findByStoreIdTx.mockResolvedValue(themeRow);
        themes.findMediaInStore.mockResolvedValue({ id: 'media-1', storeId: 'store-1' });
        themes.update.mockResolvedValue({ count: 1 });

        const dto = new UpdateThemeDto();
        dto.logoMediaId = 'media-1';

        const result = await service.updateTheme(dto);

        expect(themes.update).toHaveBeenCalledWith(
          expect.anything(),
          'store-1',
          'theme-1',
          expect.objectContaining({ logoMediaId: 'media-1' }),
        );
        expect(result.logoMediaId).toBe('media-1');
      });

      it('creates the theme row when none exists (get-or-create)', async () => {
        withTenant();
        themes.findByStoreIdTx.mockResolvedValue(null);
        themes.create.mockResolvedValue({ ...themeRow, id: 'theme-new', config: {} });

        const dto = new UpdateThemeDto();
        dto.fontFamily = 'Inter';

        const result = await service.updateTheme(dto);

        expect(themes.create).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ storeId: 'store-1', config: { fontFamily: 'Inter' } }),
        );
        expect(result.id).toBe('theme-new');
      });
    });
  });

  it('materializes the default theme when none exists (DATABASE §7.24)', async () => {
    withTenant();
    themes.findByStoreId.mockResolvedValue(null);
    themes.create.mockResolvedValue({ ...themeRow, id: 'theme-new', config: {} });

    const result = await service.getTheme();

    expect(themes.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ storeId: 'store-1', config: {} }),
    );
    expect(result.config).toEqual({});
  });
});
