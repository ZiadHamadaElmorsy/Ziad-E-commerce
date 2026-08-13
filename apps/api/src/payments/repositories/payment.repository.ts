import { Injectable } from '@nestjs/common';
import { Payment, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a Payment (docs/DATABASE.md §7.18). */
export interface CreatePaymentInput {
  storeId: string;
  orderId: string;
  provider: string;
  amount: bigint;
  currency: string;
  idempotencyKey?: string | null;
}

/** Extra data a legal status transition may write (provider/failure info). */
export interface PaymentTransitionData {
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
}

/**
 * Persistence access for the `payments` table (docs/DATABASE.md §7.18/§16).
 *
 * Payments are append/state-update only — history is never deleted (§16.6).
 * Every merchant-side read/write is store-scoped (storeId is the trusted
 * tenant id resolved from the membership); RLS remains the final defense.
 *
 * The active payment for an order is the most recently created one; its status
 * is the authoritative payment state (§16.4). Only after a FAILED payment may
 * a new Payment be created for the same Order (retry).
 */
@Injectable()
export class PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the PENDING payment inside the caller's tenant-bound transaction. */
  async create(tx: Prisma.TransactionClient, data: CreatePaymentInput): Promise<Payment> {
    return tx.payment.create({
      data: {
        storeId: data.storeId,
        orderId: data.orderId,
        provider: data.provider,
        amount: data.amount,
        currency: data.currency,
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
      },
    });
  }

  /** Store-scoped read (shared client) — cross-tenant lookups fail closed. */
  async findById(storeId: string, paymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { id: paymentId, storeId } });
  }

  /** Store-scoped read inside the caller's transaction. */
  async findByIdTx(
    tx: Prisma.TransactionClient,
    storeId: string,
    paymentId: string,
  ): Promise<Payment | null> {
    return tx.payment.findFirst({ where: { id: paymentId, storeId } });
  }

  /**
   * GLOBAL read by payment UUID (no store scoping). Used ONLY by the webhook
   * path, where the tenant is derived server-side from the payment's own
   * store_id (DATABASE §16.5 step 3 / §29.2 — service-role, RLS bypass).
   * Never used by merchant-facing flows.
   */
  async findByGlobalId(paymentId: string): Promise<Payment | null> {
    return this.prisma.payment.findUnique({ where: { id: paymentId } });
  }

  /** Idempotency-key lookup (UNIQUE(store_id, idempotency_key) — §27.1). */
  async findByIdempotencyKey(storeId: string, idempotencyKey: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({ where: { storeId, idempotencyKey } });
  }

  /**
   * The most recent payment of an order (the active payment — §16.4).
   * Store-scoped; cross-tenant orders fail closed.
   */
  async findLatestForOrder(storeId: string, orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { storeId, orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * The most recent NON-FAILED payment of an order. Payment initiation is
   * blocked while one exists: only after a FAILED payment may a new Payment be
   * created for the same Order (§16.4).
   */
  async findNonFailedForOrder(storeId: string, orderId: string): Promise<Payment | null> {
    return this.prisma.payment.findFirst({
      where: { storeId, orderId, status: { not: PaymentStatus.FAILED } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2/§16.5):
   * guarded conditional UPDATE WHERE status = from. Only when the UPDATE
   * affects exactly one row was the transition applied; 0 means a concurrent
   * operation already moved the payment (the caller re-reads and resolves
   * idempotently). Provider/failure columns are written on the documented
   * transitions.
   */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    storeId: string,
    paymentId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    data?: PaymentTransitionData,
  ): Promise<{ count: number }> {
    return tx.payment.updateMany({
      where: { id: paymentId, storeId, status: from },
      data: {
        status: to,
        ...(data?.providerReference ? { providerReference: data.providerReference } : {}),
        ...(data?.failureCode ? { failureCode: data.failureCode } : {}),
        ...(data?.failureMessage ? { failureMessage: data.failureMessage } : {}),
      },
    });
  }
}
