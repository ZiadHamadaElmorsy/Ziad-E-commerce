import type { PrismaService } from '../../prisma/prisma.service';
import { CustomerRepository } from './customer.repository';

describe('CustomerRepository', () => {
  let prisma: {
    customer: { findUnique: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    order: { findMany: jest.Mock; count: jest.Mock };
  };
  let repository: CustomerRepository;
  let tx: { customer: { create: jest.Mock; update: jest.Mock } };

  beforeEach(() => {
    prisma = {
      customer: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      order: { findMany: jest.fn(), count: jest.fn() },
    };
    repository = new CustomerRepository(prisma as unknown as PrismaService);
    tx = { customer: { create: jest.fn(), update: jest.fn() } };
  });

  it('create persists the store-scoped row through the transaction client', async () => {
    (tx.customer.create as jest.Mock).mockResolvedValue({ id: 'customer-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      firstName: 'Ahmed',
      lastName: 'Ali',
    });

    expect(tx.customer.create).toHaveBeenCalledWith({
      data: { storeId: 'store-1', firstName: 'Ahmed', lastName: 'Ali' },
    });
  });

  it('update targets the composite store-scoped unique (storeId, id)', async () => {
    (tx.customer.update as jest.Mock).mockResolvedValue({ id: 'customer-1', lastName: 'Hassan' });

    await repository.update(tx as never, 'store-1', 'customer-1', { lastName: 'Hassan' });

    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'customer-1' } },
      data: { lastName: 'Hassan' },
    });
  });

  it('findById uses the composite store-scoped unique (storeId, id)', async () => {
    prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });

    await repository.findById('store-1', 'customer-1');

    expect(prisma.customer.findUnique).toHaveBeenCalledWith({
      where: { storeId_id: { storeId: 'store-1', id: 'customer-1' } },
    });
  });

  it('findMany is store-scoped with pagination and orderBy', async () => {
    prisma.customer.findMany.mockResolvedValue([]);

    await repository.findMany('store-1', {
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1' },
      skip: 10,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('findMany applies the search across the customer identity fields (insensitive)', async () => {
    prisma.customer.findMany.mockResolvedValue([]);

    await repository.findMany('store-1', {
      search: 'ahmed',
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.customer.findMany).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        OR: [
          { firstName: { contains: 'ahmed', mode: 'insensitive' } },
          { lastName: { contains: 'ahmed', mode: 'insensitive' } },
          { email: { contains: 'ahmed', mode: 'insensitive' } },
          { phone: { contains: 'ahmed', mode: 'insensitive' } },
        ],
      },
      skip: 0,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('count is store-scoped and honors the search filter', async () => {
    prisma.customer.count.mockResolvedValue(2);

    await repository.count('store-1', { search: 'ali', skip: 0, take: 20, orderBy: {} });

    expect(prisma.customer.count).toHaveBeenCalledWith({
      where: {
        storeId: 'store-1',
        OR: [
          { firstName: { contains: 'ali', mode: 'insensitive' } },
          { lastName: { contains: 'ali', mode: 'insensitive' } },
          { email: { contains: 'ali', mode: 'insensitive' } },
          { phone: { contains: 'ali', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('findOrders is scoped by storeId AND customerId with pagination', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    await repository.findOrders('store-1', 'customer-1', {
      skip: 20,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', customerId: 'customer-1' },
      skip: 20,
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  });

  it('countOrders is scoped by storeId AND customerId', async () => {
    prisma.order.count.mockResolvedValue(1);

    await repository.countOrders('store-1', 'customer-1');

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: { storeId: 'store-1', customerId: 'customer-1' },
    });
  });
});
