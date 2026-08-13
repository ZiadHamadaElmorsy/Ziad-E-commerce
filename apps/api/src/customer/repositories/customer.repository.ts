import { Injectable } from '@nestjs/common';
import { Customer, Order, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a Customer (docs/DATABASE.md §7.12). */
export interface CreateCustomerInput {
  storeId: string;
  email?: string | null;
  phone?: string | null;
  firstName: string;
  lastName: string;
  authUserId?: string | null;
}

/** Minimal write input for updating a Customer. */
export interface UpdateCustomerInput {
  email?: string | null;
  phone?: string | null;
  firstName?: string;
  lastName?: string;
}

/** Store-scoped list filter for the customer collection endpoint. */
export interface CustomerListFilter {
  search?: string;
  skip: number;
  take: number;
  orderBy: Prisma.CustomerOrderByWithRelationInput;
}

/** Store-scoped list filter for the customer order-history endpoint. */
export interface CustomerOrderListFilter {
  skip: number;
  take: number;
  orderBy: Prisma.OrderOrderByWithRelationInput;
}

/**
 * Persistence access for the `customers` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped: writes use the composite `storeId_id` unique target and reads
 * filter by storeId, so a Customer operation can never touch another tenant's
 * rows (RLS remains the final defense boundary).
 *
 * The write methods (create/update) are the persistence contract for the
 * future Checkout/Order phase (docs/DOMAIN-MODEL.md §9.1: "A Customer record
 * may be created during checkout"). API-SPEC §20 explicitly does NOT require
 * merchant-side manual Customer creation, so no HTTP write endpoint is
 * exposed in this phase.
 */
@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreateCustomerInput): Promise<Customer> {
    return tx.customer.create({ data: { ...data } });
  }

  async update(
    tx: Prisma.TransactionClient,
    storeId: string,
    customerId: string,
    data: UpdateCustomerInput,
  ): Promise<Customer> {
    return tx.customer.update({
      where: { storeId_id: { storeId, id: customerId } },
      data: { ...data },
    });
  }

  async findById(storeId: string, customerId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { storeId_id: { storeId, id: customerId } },
    });
  }

  /**
   * Store-scoped customer lookup by email (docs/DATABASE.md §18.2 —
   * UNIQUE (store_id, email) when email is present). Used by the Checkout
   * phase to identify/reuse an existing customer before creating a new one
   * (US-CUST-001 — "create or identify a customer during checkout").
   */
  async findByEmailTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    email: string,
  ): Promise<Customer | null> {
    return tx.customer.findFirst({ where: { storeId, email } });
  }

  async findMany(storeId: string, filter: CustomerListFilter): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: this.buildWhere(storeId, filter),
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
    });
  }

  async count(storeId: string, filter: CustomerListFilter): Promise<number> {
    return this.prisma.customer.count({ where: this.buildWhere(storeId, filter) });
  }

  /** Customer order history (docs/DATABASE.md §11: orders (store_id, customer_id)). */
  async findOrders(
    storeId: string,
    customerId: string,
    filter: CustomerOrderListFilter,
  ): Promise<Order[]> {
    return this.prisma.order.findMany({
      where: { storeId, customerId },
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
    });
  }

  async countOrders(storeId: string, customerId: string): Promise<number> {
    return this.prisma.order.count({ where: { storeId, customerId } });
  }

  private buildWhere(storeId: string, filter: CustomerListFilter): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { storeId };

    if (filter.search) {
      // The FINAL documents do not define the searched fields; the minimal
      // customer-search interpretation is the customer's identifying fields.
      where.OR = [
        { firstName: { contains: filter.search, mode: 'insensitive' } },
        { lastName: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
        { phone: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }
}
