import { Injectable } from '@nestjs/common';
import { CustomerAddress, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a CustomerAddress (docs/DATABASE.md §7.13). */
export interface CreateCustomerAddressInput {
  storeId: string;
  customerId: string;
  label?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  country?: string | null;
  governorate?: string | null;
  city: string;
  addressLine: string;
  building?: string | null;
  apartment?: string | null;
  postalCode?: string | null;
  isDefault?: boolean;
}

/** Partial update input; ownership columns are never part of an update. */
export type UpdateCustomerAddressInput = Partial<
  Omit<CreateCustomerAddressInput, 'storeId' | 'customerId'>
>;

/**
 * Persistence access for the `customer_addresses` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped AND customer-scoped.
 *
 * NOTE: `customer_addresses` has NO composite `(store_id, id)` unique index
 * (PK is `id` only — DATABASE.md §7.13/§9.1 defines only the composite FK
 * `(store_id, customer_id)` and an index on `customer_id`), so single-row
 * writes cannot use a `storeId_id` unique target. They therefore use guarded
 * `updateMany`/`deleteMany` scoped by `(id, storeId, customerId)` and return
 * the affected row count (0 = missing or outside the store — fail closed).
 */
@Injectable()
export class CustomerAddressRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tx: Prisma.TransactionClient,
    data: CreateCustomerAddressInput,
  ): Promise<CustomerAddress> {
    return tx.customerAddress.create({ data: { ...data } });
  }

  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    customerId: string,
    addressId: string,
    data: UpdateCustomerAddressInput,
  ): Promise<{ count: number }> {
    return tx.customerAddress.updateMany({
      where: { id: addressId, storeId, customerId },
      data: { ...data },
    });
  }

  async delete(
    tx: Prisma.TransactionClient,
    storeId: string,
    customerId: string,
    addressId: string,
  ): Promise<{ count: number }> {
    return tx.customerAddress.deleteMany({
      where: { id: addressId, storeId, customerId },
    });
  }

  async findById(
    storeId: string,
    customerId: string,
    addressId: string,
  ): Promise<CustomerAddress | null> {
    return this.prisma.customerAddress.findFirst({
      where: { id: addressId, storeId, customerId },
    });
  }

  async findManyByCustomer(storeId: string, customerId: string): Promise<CustomerAddress[]> {
    return this.prisma.customerAddress.findMany({
      where: { storeId, customerId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async countByCustomer(storeId: string, customerId: string): Promise<number> {
    return this.prisma.customerAddress.count({ where: { storeId, customerId } });
  }
}
