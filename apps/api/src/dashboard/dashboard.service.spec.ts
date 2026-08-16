import { ProductStatus } from '@prisma/client';
import { RequestContextService } from '../common/context/request-context.service';
import { CategoryRepository } from '../catalog/repositories/category.repository';
import { ProductRepository } from '../catalog/repositories/product.repository';
import { OrderRepository } from '../orders/repositories/order.repository';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let products: {
    countByStatus: jest.Mock;
    findMany: jest.Mock;
  };
  let categories: { count: jest.Mock };
  let orders: {
    count: jest.Mock;
    findMany: jest.Mock;
    sumGrandTotal: jest.Mock;
  };
  let service: DashboardService;

  function storeContext() {
    return {
      store: { id: 'store-1', slug: 'my-store', name: 'My Store', status: 'ACTIVE' },
      membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
    };
  }

  beforeEach(() => {
    requestContext = { getCurrent: jest.fn().mockReturnValue(storeContext()) };
    products = { countByStatus: jest.fn(), findMany: jest.fn() };
    categories = { count: jest.fn() };
    orders = { count: jest.fn(), findMany: jest.fn(), sumGrandTotal: jest.fn() };
    service = new DashboardService(
      requestContext as unknown as RequestContextService,
      products as unknown as ProductRepository,
      categories as unknown as CategoryRepository,
      orders as unknown as OrderRepository,
    );
  });

  it('aggregates all metrics with parallel store-scoped queries', async () => {
    products.countByStatus.mockResolvedValue({ DRAFT: 3, ACTIVE: 7, ARCHIVED: 2 });
    categories.count.mockResolvedValue(5);
    orders.count.mockResolvedValue(42);
    orders.findMany.mockResolvedValue([
      {
        id: 'order-1',
        orderNumber: 'Z-1001',
        channel: 'ONLINE_PAYMENT',
        status: 'CONFIRMED',
        currency: 'EGP',
        grandTotal: 150000n,
        customerEmail: 'a@example.com',
        customerPhone: null,
        createdAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    ]);
    orders.sumGrandTotal.mockResolvedValue(3_000_000n);
    products.findMany.mockResolvedValue([
      {
        id: 'p-1',
        name: 'T-Shirt',
        slug: 't-shirt',
        description: null,
        status: ProductStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
        storeId: 'store-1',
        variants: [
          {
            id: 'v-1',
            productId: 'p-1',
            storeId: 'store-1',
            name: 'Default',
            sku: 'TS-1',
            price: 25000n,
            compareAtPrice: null,
            costPrice: null,
            status: 'ACTIVE',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      },
    ]);

    const stats = await service.getStats();

    expect(stats.products).toEqual({ total: 12, active: 7, drafts: 3, archived: 2 });
    expect(stats.categories).toBe(5);
    expect(stats.orders.total).toBe(42);
    expect(stats.orders.recent[0].grandTotal).toBe(150000);
    expect(stats.revenue).toBe(3_000_000);
    expect(stats.recentProducts).toEqual([
      { id: 'p-1', name: 'T-Shirt', slug: 't-shirt', status: 'ACTIVE', price: 25000, variantsCount: 1 },
    ]);
  });

  it('returns null revenue and an empty list when there is no data', async () => {
    products.countByStatus.mockResolvedValue({ DRAFT: 0, ACTIVE: 0, ARCHIVED: 0 });
    categories.count.mockResolvedValue(0);
    orders.count.mockResolvedValue(0);
    orders.findMany.mockResolvedValue([]);
    orders.sumGrandTotal.mockResolvedValue(null);
    products.findMany.mockResolvedValue([]);

    const stats = await service.getStats();

    expect(stats.products.total).toBe(0);
    expect(stats.revenue).toBeNull();
    expect(stats.orders.recent).toEqual([]);
    expect(stats.recentProducts).toEqual([]);
  });

  it('scopes every query to the trusted tenant store id', async () => {
    products.countByStatus.mockResolvedValue({ DRAFT: 0, ACTIVE: 0, ARCHIVED: 0 });
    categories.count.mockResolvedValue(0);
    orders.count.mockResolvedValue(0);
    orders.findMany.mockResolvedValue([]);
    orders.sumGrandTotal.mockResolvedValue(null);
    products.findMany.mockResolvedValue([]);

    await service.getStats();

    expect(products.countByStatus).toHaveBeenCalledWith('store-1');
    expect(categories.count).toHaveBeenCalledWith('store-1');
    expect(orders.count).toHaveBeenCalledWith('store-1', expect.anything());
    expect(orders.findMany).toHaveBeenCalledWith('store-1', expect.objectContaining({ take: 5 }));
    expect(orders.sumGrandTotal).toHaveBeenCalledWith('store-1');
    expect(products.findMany).toHaveBeenCalledWith('store-1', expect.objectContaining({ take: 5 }));
  });
});
