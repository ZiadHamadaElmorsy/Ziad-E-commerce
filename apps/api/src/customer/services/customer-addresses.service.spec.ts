import { RequestContextService } from '../../common/context/request-context.service';
import {
  NotFoundError,
  TenantContextRequiredError,
  ValidationError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { CreateCustomerAddressDto } from '../dto/create-customer-address.dto';
import { UpdateCustomerAddressDto } from '../dto/update-customer-address.dto';
import { CustomerAddressRepository } from '../repositories/customer-address.repository';
import { CustomerRepository } from '../repositories/customer.repository';
import { CustomerAddressesService } from './customer-addresses.service';

describe('CustomerAddressesService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let customers: { findById: jest.Mock };
  let addresses: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findById: jest.Mock;
    findManyByCustomer: jest.Mock;
  };
  let transaction: { runWithTenant: jest.Mock };
  let service: CustomerAddressesService;

  const customerRow = {
    id: 'customer-1',
    storeId: 'store-1',
    email: 'ahmed@example.com',
    phone: '01000000000',
    firstName: 'Ahmed',
    lastName: 'Ali',
    authUserId: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  const addressRow = {
    id: 'address-1',
    storeId: 'store-1',
    customerId: 'customer-1',
    label: 'Home',
    firstName: 'Ahmed',
    lastName: 'Ali',
    phone: '01000000000',
    country: 'Egypt',
    governorate: 'Gharbia',
    city: 'Tanta',
    addressLine: 'El Geish St 12',
    building: '3',
    apartment: '4',
    postalCode: '31111',
    isDefault: false,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    customers = { findById: jest.fn() };
    addresses = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findById: jest.fn(),
      findManyByCustomer: jest.fn(),
    };
    transaction = { runWithTenant: jest.fn() };
    transaction.runWithTenant.mockImplementation(
      async (_storeId: string, work: (tx: unknown) => Promise<unknown>) => work({}),
    );

    service = new CustomerAddressesService(
      requestContext as unknown as RequestContextService,
      customers as unknown as CustomerRepository,
      addresses as unknown as CustomerAddressRepository,
      transaction as unknown as TransactionService,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function createDto(overrides: Partial<CreateCustomerAddressDto> = {}): CreateCustomerAddressDto {
    return {
      firstName: 'Ahmed',
      lastName: 'Ali',
      city: 'Tanta',
      addressLine: 'El Geish St 12',
      ...overrides,
    };
  }

  function updateDto(overrides: Partial<UpdateCustomerAddressDto> = {}): UpdateCustomerAddressDto {
    return { ...overrides };
  }

  describe('create', () => {
    it('creates a store-scoped, customer-scoped address inside a tenant-bound transaction', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.create.mockResolvedValue(addressRow);

      const result = await service.create('customer-1', createDto({ label: 'Home' }));

      expect(transaction.runWithTenant).toHaveBeenCalledWith('store-1', expect.any(Function));
      expect(addresses.create).toHaveBeenCalledWith(expect.anything(), {
        storeId: 'store-1',
        customerId: 'customer-1',
        label: 'Home',
        firstName: 'Ahmed',
        lastName: 'Ali',
        phone: null,
        country: null,
        governorate: null,
        city: 'Tanta',
        addressLine: 'El Geish St 12',
        building: null,
        apartment: null,
        postalCode: null,
        isDefault: false,
      });
      expect(result.id).toBe('address-1');
      expect(result.isDefault).toBe(false);
    });

    it('rejects an invalid payload with VALIDATION_ERROR before any database access', async () => {
      withTenant();

      await expect(service.create('customer-1', createDto({ city: '' }))).rejects.toBeInstanceOf(
        ValidationError,
      );
      expect(customers.findById).not.toHaveBeenCalled();
      expect(addresses.create).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when the owning customer is not in the current store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(null);

      await expect(service.create('customer-999', createDto())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(addresses.create).not.toHaveBeenCalled();
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is resolved', async () => {
      await expect(service.create('customer-1', createDto())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });
  });

  describe('listByCustomer', () => {
    it('returns only the addresses of the customer within the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.findManyByCustomer.mockResolvedValue([addressRow]);

      const result = await service.listByCustomer('customer-1');

      expect(addresses.findManyByCustomer).toHaveBeenCalledWith('store-1', 'customer-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('address-1');
    });

    it('fails with NOT_FOUND when the customer is not in the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(null);

      await expect(service.listByCustomer('customer-999')).rejects.toBeInstanceOf(NotFoundError);
      expect(addresses.findManyByCustomer).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the address when it belongs to the customer in the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.findById.mockResolvedValue(addressRow);

      const result = await service.get('customer-1', 'address-1');

      expect(addresses.findById).toHaveBeenCalledWith('store-1', 'customer-1', 'address-1');
      expect(result.id).toBe('address-1');
    });

    it('fails with NOT_FOUND when the address is missing or outside the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.findById.mockResolvedValue(null);

      await expect(service.get('customer-1', 'address-999')).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('update', () => {
    it('updates the address with a guarded store-scoped update and returns the fresh row', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.update.mockResolvedValue({ count: 1 });
      addresses.findById.mockResolvedValue({ ...addressRow, city: 'Cairo', isDefault: true });

      const result = await service.update(
        'customer-1',
        'address-1',
        updateDto({ isDefault: true }),
      );

      expect(addresses.update).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'customer-1',
        'address-1',
        { isDefault: true },
      );
      expect(result.city).toBe('Cairo');
      expect(result.isDefault).toBe(true);
    });

    it('fails with NOT_FOUND when the guarded update affects zero rows', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.update.mockResolvedValue({ count: 0 });

      await expect(
        service.update('customer-1', 'address-999', updateDto({ city: 'Cairo' })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects an invalid payload with VALIDATION_ERROR', async () => {
      withTenant();

      await expect(
        service.update('customer-1', 'address-1', updateDto({ firstName: '' })),
      ).rejects.toBeInstanceOf(ValidationError);
    });
  });

  describe('delete', () => {
    it('deletes the address with a guarded store-scoped delete', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.delete.mockResolvedValue({ count: 1 });

      await expect(service.delete('customer-1', 'address-1')).resolves.toBeUndefined();

      expect(addresses.delete).toHaveBeenCalledWith(
        expect.anything(),
        'store-1',
        'customer-1',
        'address-1',
      );
    });

    it('fails with NOT_FOUND when the address does not exist in the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      addresses.delete.mockResolvedValue({ count: 0 });

      await expect(service.delete('customer-1', 'address-999')).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });
  });
});
