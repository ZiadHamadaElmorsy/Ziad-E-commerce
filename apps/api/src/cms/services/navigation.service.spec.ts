import { RequestContextService } from '../../common/context/request-context.service';
import {
  NotFoundError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { UpdateNavigationDto } from '../dto/update-navigation.dto';
import { NavigationRepository } from '../repositories/navigation.repository';
import { CmsAuditService } from './cms-audit.service';
import { DEFAULT_NAVIGATION_NAME, NavigationService } from './navigation.service';

describe('NavigationService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let navigations: {
    findForStore: jest.Mock;
    findForStoreTx: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let transaction: { run: jest.Mock; runWithTenant: jest.Mock };
  let audit: { write: jest.Mock };
  let service: NavigationService;

  const navigationRow = {
    id: 'nav-1',
    storeId: 'store-1',
    name: 'Main',
    items: [
      { label: 'About', type: 'PAGE', value: 'page-1' },
      { label: 'Contact', type: 'DESTINATION', value: 'contact' },
    ],
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    navigations = {
      findForStore: jest.fn(),
      findForStoreTx: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };
    transaction = { run: jest.fn(), runWithTenant: jest.fn() };
    audit = { write: jest.fn() };

    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new NavigationService(
      requestContext as unknown as RequestContextService,
      navigations as unknown as NavigationRepository,
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

  describe('getNavigation', () => {
    it('requires a store tenant context', async () => {
      await expect(service.getNavigation()).rejects.toBeInstanceOf(TenantContextRequiredError);
    });

    it('returns the existing navigation of the store', async () => {
      withTenant();
      navigations.findForStore.mockResolvedValue(navigationRow);

      const result = await service.getNavigation();

      expect(navigations.findForStore).toHaveBeenCalledWith('store-1');
      expect(result).toMatchObject({ id: 'nav-1', name: 'Main' });
      expect(result.items).toHaveLength(2);
    });

    it('materializes a default navigation when none exists (get-or-create)', async () => {
      withTenant();
      navigations.findForStore.mockResolvedValue(null);
      navigations.create.mockResolvedValue({
        ...navigationRow,
        id: 'nav-new',
        name: DEFAULT_NAVIGATION_NAME,
        items: [],
      });

      const result = await service.getNavigation();

      expect(navigations.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storeId: 'store-1', name: 'Main', items: [] }),
      );
      expect(result.items).toEqual([]);
    });
  });

  describe('updateNavigation', () => {
    it('replaces the existing navigation and audits the change', async () => {
      withTenant();
      navigations.findForStoreTx.mockResolvedValue(navigationRow);
      navigations.update.mockResolvedValue({ count: 1 });

      const dto = new UpdateNavigationDto();
      dto.name = 'Footer';
      dto.items = [{ label: 'About', type: 'PAGE', value: 'page-1' }];

      const result = await service.updateNavigation(dto);

      expect(navigations.update).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'nav-1',
        expect.objectContaining({ name: 'Footer' }),
      );
      expect(audit.write).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'navigation.updated',
        'navigation',
        'nav-1',
        expect.objectContaining({ name: 'Footer', itemCount: 1 }),
      );
      expect(result).toMatchObject({ id: 'nav-1', name: 'Footer' });
    });

    it('creates the navigation row when none exists yet', async () => {
      withTenant();
      navigations.findForStoreTx.mockResolvedValue(null);
      navigations.create.mockResolvedValue({ ...navigationRow, id: 'nav-new', name: 'Main' });

      const dto = new UpdateNavigationDto();
      dto.name = 'Main';
      dto.items = [];

      const result = await service.updateNavigation(dto);

      expect(navigations.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ storeId: 'store-1', name: 'Main', items: [] }),
      );
      expect(result.id).toBe('nav-new');
    });

    it('rejects malformed items at the domain layer', async () => {
      withTenant();

      const dto = new UpdateNavigationDto();
      dto.name = 'Main';
      dto.items = [
        { label: 'X', type: 'PRODUCT', value: 'p' },
      ] as unknown as UpdateNavigationDto['items'];

      await expect(service.updateNavigation(dto)).rejects.toBeInstanceOf(ValidationError);
      expect(navigations.create).not.toHaveBeenCalled();
      expect(navigations.update).not.toHaveBeenCalled();
    });

    it('fails closed when the existing row vanishes mid-transaction', async () => {
      withTenant();
      navigations.findForStoreTx.mockResolvedValue(navigationRow);
      navigations.update.mockResolvedValue({ count: 0 });

      const dto = new UpdateNavigationDto();
      dto.name = 'Main';
      dto.items = [];

      await expect(service.updateNavigation(dto)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});
