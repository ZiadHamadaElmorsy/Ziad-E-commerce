import { OrderStatus } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError, TenantContextRequiredError } from '../../common/errors/domain-exceptions';
import { ListCustomerOrdersQueryDto } from '../dto/list-customer-orders-query.dto';
import { ListCustomersQueryDto } from '../dto/list-customers-query.dto';
import { CustomerRepository } from '../repositories/customer.repository';
import { CustomersService } from './customers.service';

describe('CustomersService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let customers: {
    findById: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    findOrders: jest.Mock;
    countOrders: jest.Mock;
  };
  let service: CustomersService;

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

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    orderNumber: 'ORD-2026-000001',
    customerId: 'customer-1',
    status: OrderStatus.PENDING,
    currency: 'EGP',
    subtotal: 1000n,
    discountTotal: 0n,
    shippingTotal: 50n,
    taxTotal: 140n,
    grandTotal: 1190n,
    customerEmail: 'ahmed@example.com',
    customerPhone: null,
    shippingAddressSnapshot: {},
    billingAddressSnapshot: null,
    idempotencyKey: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
    confirmedAt: null,
    cancelledAt: null,
  };

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn() };
    customers = {
      findById: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findOrders: jest.fn(),
      countOrders: jest.fn(),
    };
    service = new CustomersService(
      requestContext as unknown as RequestContextService,
      customers as unknown as CustomerRepository,
    );
  });

  function withTenant(): void {
    requestContext.getCurrent.mockReturnValue({
      requestId: 'req-1',
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
    });
  }

  function listQuery(overrides: Partial<ListCustomersQueryDto> = {}): ListCustomersQueryDto {
    return { page: 1, limit: 20, ...overrides };
  }

  function ordersQuery(
    overrides: Partial<ListCustomerOrdersQueryDto> = {},
  ): ListCustomerOrdersQueryDto {
    return { page: 1, limit: 20, ...overrides };
  }

  describe('list', () => {
    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is resolved', async () => {
      await expect(service.list(listQuery())).rejects.toBeInstanceOf(TenantContextRequiredError);
      expect(customers.findMany).not.toHaveBeenCalled();
    });

    it('returns a store-scoped paginated list with search passthrough', async () => {
      withTenant();
      customers.findMany.mockResolvedValue([customerRow]);
      customers.count.mockResolvedValue(1);

      const result = await service.list(listQuery({ search: 'ahmed' }));

      expect(customers.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ search: 'ahmed', skip: 0, take: 20 }),
      );
      expect(customers.count).toHaveBeenCalledWith('store-1', expect.objectContaining({}));
      expect(result.items).toEqual([
        {
          id: 'customer-1',
          email: 'ahmed@example.com',
          phone: '01000000000',
          firstName: 'Ahmed',
          lastName: 'Ali',
        },
      ]);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('computes the skip offset for later pages', async () => {
      withTenant();
      customers.findMany.mockResolvedValue([]);
      customers.count.mockResolvedValue(0);

      await service.list(listQuery({ page: 3, limit: 10 }));

      expect(customers.findMany).toHaveBeenCalledWith(
        'store-1',
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(customers.count).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns the customer view when found in the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);

      const result = await service.get('customer-1');

      expect(customers.findById).toHaveBeenCalledWith('store-1', 'customer-1');
      expect(result).toEqual({
        id: 'customer-1',
        email: 'ahmed@example.com',
        phone: '01000000000',
        firstName: 'Ahmed',
        lastName: 'Ali',
      });
    });

    it('fails with NOT_FOUND when the customer is missing or outside the store', async () => {
      withTenant();
      customers.findById.mockResolvedValue(null);

      await expect(service.get('customer-999')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is resolved', async () => {
      await expect(service.get('customer-1')).rejects.toBeInstanceOf(TenantContextRequiredError);
    });
  });

  describe('listOrders', () => {
    it('resolves the customer in the store before reading orders (no existence leak)', async () => {
      withTenant();
      customers.findById.mockResolvedValue(null);

      await expect(service.listOrders('customer-999', ordersQuery())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(customers.findOrders).not.toHaveBeenCalled();
      expect(customers.countOrders).not.toHaveBeenCalled();
    });

    it('returns a store-scoped paginated order-history projection', async () => {
      withTenant();
      customers.findById.mockResolvedValue(customerRow);
      customers.findOrders.mockResolvedValue([orderRow]);
      customers.countOrders.mockResolvedValue(1);

      const result = await service.listOrders('customer-1', ordersQuery());

      expect(customers.findOrders).toHaveBeenCalledWith(
        'store-1',
        'customer-1',
        expect.objectContaining({ skip: 0, take: 20 }),
      );
      expect(customers.countOrders).toHaveBeenCalledWith('store-1', 'customer-1');
      expect(result.items).toEqual([
        {
          id: 'order-1',
          orderNumber: 'ORD-2026-000001',
          status: OrderStatus.PENDING,
          currency: 'EGP',
          grandTotal: 1190,
          createdAt: '2026-08-12T00:00:00.000Z',
        },
      ]);
      expect(result.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is resolved', async () => {
      await expect(service.listOrders('customer-1', ordersQuery())).rejects.toBeInstanceOf(
        TenantContextRequiredError,
      );
    });
  });
});
