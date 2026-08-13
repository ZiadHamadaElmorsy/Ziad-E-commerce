import type { PrismaService } from '../../prisma/prisma.service';
import { CustomerAddressRepository } from './customer-address.repository';

describe('CustomerAddressRepository', () => {
  let prisma: {
    customerAddress: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let repository: CustomerAddressRepository;
  let tx: { customerAddress: { create: jest.Mock; updateMany: jest.Mock; deleteMany: jest.Mock } };

  beforeEach(() => {
    prisma = { customerAddress: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() } };
    repository = new CustomerAddressRepository(prisma as unknown as PrismaService);
    tx = {
      customerAddress: { create: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    };
  });

  it('create persists the store-scoped, customer-scoped row through the transaction client', async () => {
    (tx.customerAddress.create as jest.Mock).mockResolvedValue({ id: 'address-1' });

    await repository.create(tx as never, {
      storeId: 'store-1',
      customerId: 'customer-1',
      firstName: 'Ahmed',
      lastName: 'Ali',
      city: 'Tanta',
      addressLine: 'El Geish St 12',
    });

    expect(tx.customerAddress.create).toHaveBeenCalledWith({
      data: {
        storeId: 'store-1',
        customerId: 'customer-1',
        firstName: 'Ahmed',
        lastName: 'Ali',
        city: 'Tanta',
        addressLine: 'El Geish St 12',
      },
    });
  });

  it('update uses a guarded updateMany scoped by (id, storeId, customerId)', async () => {
    (tx.customerAddress.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.update(tx as never, 'store-1', 'customer-1', 'address-1', {
      city: 'Cairo',
      isDefault: true,
    });

    expect(tx.customerAddress.updateMany).toHaveBeenCalledWith({
      where: { id: 'address-1', storeId: 'store-1', customerId: 'customer-1' },
      data: { city: 'Cairo', isDefault: true },
    });
  });

  it('delete uses a guarded deleteMany scoped by (id, storeId, customerId)', async () => {
    (tx.customerAddress.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

    await repository.delete(tx as never, 'store-1', 'customer-1', 'address-1');

    expect(tx.customerAddress.deleteMany).toHaveBeenCalledWith({
      where: { id: 'address-1', storeId: 'store-1', customerId: 'customer-1' },
    });
  });

  it('findById scopes by (id, storeId, customerId) — cross-tenant lookups fail closed', async () => {
    prisma.customerAddress.findFirst.mockResolvedValue({ id: 'address-1' });

    await repository.findById('store-1', 'customer-1', 'address-1');

    expect(prisma.customerAddress.findFirst).toHaveBeenCalledWith({
      where: { id: 'address-1', storeId: 'store-1', customerId: 'customer-1' },
    });
  });

  it('findManyByCustomer is store-scoped and customer-scoped, ordered by createdAt', async () => {
    prisma.customerAddress.findMany.mockResolvedValue([]);

    await repository.findManyByCustomer('store-1', 'customer-1');

    expect(prisma.customerAddress.findMany).toHaveBeenCalledWith({
      where: { storeId: 'store-1', customerId: 'customer-1' },
      orderBy: { createdAt: 'asc' },
    });
  });

  it('countByCustomer is store-scoped and customer-scoped', async () => {
    prisma.customerAddress.count.mockResolvedValue(2);

    await repository.countByCustomer('store-1', 'customer-1');

    expect(prisma.customerAddress.count).toHaveBeenCalledWith({
      where: { storeId: 'store-1', customerId: 'customer-1' },
    });
  });
});
