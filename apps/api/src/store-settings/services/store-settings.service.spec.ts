import { RequestContextService } from '../../common/context/request-context.service';
import { TenantContextRequiredError, ValidationError } from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { UpdateWhatsAppSettingsDto } from '../dto/update-whatsapp-settings.dto';
import { StoreSettingsRepository } from '../repositories/store-settings.repository';
import { StoreSettingsService } from './store-settings.service';

describe('StoreSettingsService (WhatsApp config)', () => {
  let requestContext: { getCurrent: jest.Mock };
  let settings: { findByStoreId: jest.Mock; findByStoreIdTx: jest.Mock; upsert: jest.Mock };
  let transaction: { runWithTenant: jest.Mock };
  let service: StoreSettingsService;

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    settings = {
      findByStoreId: jest.fn(),
      findByStoreIdTx: jest.fn(),
      upsert: jest.fn(),
    };
    transaction = { runWithTenant: jest.fn() };
    service = new StoreSettingsService(
      requestContext as unknown as RequestContextService,
      settings as unknown as StoreSettingsRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withContext(storeId = 'store-1') {
    requestContext.getCurrent.mockReturnValue({ store: { id: storeId } });
  }

  describe('getWhatsAppSettingsForCurrentStore', () => {
    it('fails closed without a tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({});
      await expect(service.getWhatsAppSettingsForCurrentStore()).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('returns the persisted configuration', async () => {
      withContext();
      settings.findByStoreId.mockResolvedValue({
        storeId: 'store-1',
        settings: { whatsapp: { enabled: true, phoneNumber: '201012345678' } },
      });

      const result = await service.getWhatsAppSettingsForCurrentStore();
      expect(result.whatsapp).toEqual({ enabled: true, phoneNumber: '201012345678', label: null });
      expect(settings.findByStoreId).toHaveBeenCalledWith('store-1');
    });

    it('returns disabled defaults when no row exists (fail closed)', async () => {
      withContext();
      settings.findByStoreId.mockResolvedValue(null);

      const result = await service.getWhatsAppSettingsForCurrentStore();
      expect(result.whatsapp).toEqual({ enabled: false, phoneNumber: '', label: null });
    });
  });

  describe('updateWhatsAppSettingsForCurrentStore', () => {
    const dto: UpdateWhatsAppSettingsDto = {
      whatsapp: { enabled: true, phoneNumber: '+20 10 1234 5678', label: 'Chat with us' },
    };

    it('fails closed without a tenant context', async () => {
      requestContext.getCurrent.mockReturnValue({});
      await expect(service.updateWhatsAppSettingsForCurrentStore(dto)).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });

    it('normalizes and persists the configuration inside a tenant-bound transaction', async () => {
      withContext();
      transaction.runWithTenant.mockImplementation(async (_storeId: string, fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {};
        await fn(tx);
        return { storeId: 'store-1', settings: { whatsapp: { enabled: true, phoneNumber: '201012345678', label: 'Chat with us' } } };
      });
      settings.findByStoreIdTx.mockResolvedValue({
        storeId: 'store-1',
        settings: { whatsapp: { enabled: true, phoneNumber: '201012345678', label: 'Chat with us' } },
      });

      const result = await service.updateWhatsAppSettingsForCurrentStore(dto);

      expect(settings.upsert).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        expect.objectContaining({
          whatsapp: expect.objectContaining({ enabled: true, phoneNumber: '201012345678' }),
        }),
      );
      expect(result.whatsapp).toEqual({
        enabled: true,
        phoneNumber: '201012345678',
        label: 'Chat with us',
      });
    });

    it('rejects enabling with an invalid phone number', async () => {
      withContext();
      const invalid: UpdateWhatsAppSettingsDto = {
        whatsapp: { enabled: true, phoneNumber: 'abc', label: undefined },
      };

      await expect(service.updateWhatsAppSettingsForCurrentStore(invalid)).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });
  });
});
