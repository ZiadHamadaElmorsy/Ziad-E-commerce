import { Injectable } from '@nestjs/common';
import { PaymentAttempt, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a PaymentAttempt (docs/DATABASE.md §7.19). */
export interface CreatePaymentAttemptInput {
  paymentId: string;
  amount: bigint;
  currency: string;
  idempotencyKey?: string | null;
}

/** Extra data a legal attempt transition may write (provider/failure info). */
export interface PaymentAttemptTransitionData {
  providerReference?: string;
  failureCode?: string;
  failureMessage?: string;
  initiatedAt?: Date;
  completedAt?: Date;
}

/**
 * Persistence access for the `payment_attempts` table
 * (docs/DATABASE.md §7.19/§16.4).
 *
 * Ownership is INHERITED through the parent payment (no store_id column);
 * the store is always resolved through the payment (RLS parent-aggregate
 * pattern, DATABASE §4/§9.2). Attempts are append/state-update only.
 *
 * Payment initiation is idempotent: payment_attempts.idempotency_key is
 * UNIQUE within the parent payment (partial index, DATABASE §27.1/§16.4).
 */
@Injectable()
export class PaymentAttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates the PENDING attempt inside the caller's tenant-bound transaction. */
  async create(
    tx: Prisma.TransactionClient,
    data: CreatePaymentAttemptInput,
  ): Promise<PaymentAttempt> {
    return tx.paymentAttempt.create({
      data: {
        paymentId: data.paymentId,
        amount: data.amount,
        currency: data.currency,
        ...(data.idempotencyKey ? { idempotencyKey: data.idempotencyKey } : {}),
      },
    });
  }

  /** The most recent attempt of a payment (attempts are ordered by creation). */
  async findLatestForPayment(paymentId: string): Promise<PaymentAttempt | null> {
    return this.prisma.paymentAttempt.findFirst({
      where: { paymentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Concurrency-safe lifecycle transition (docs/DATABASE.md §26.2):
   * guarded conditional UPDATE WHERE status = from. The attempt lifecycle
   * mirrors the payment lifecycle (PENDING -> PROCESSING -> SUCCEEDED/FAILED)
   * and writes initiated_at / completed_at on the documented transitions
   * (DATABASE §7.19).
   */
  async transitionStatus(
    tx: Prisma.TransactionClient,
    paymentId: string,
    attemptId: string,
    from: PaymentStatus,
    to: PaymentStatus,
    data?: PaymentAttemptTransitionData,
  ): Promise<{ count: number }> {
    return tx.paymentAttempt.updateMany({
      where: { id: attemptId, paymentId, status: from },
      data: {
        status: to,
        ...(data?.providerReference ? { providerReference: data.providerReference } : {}),
        ...(data?.failureCode ? { failureCode: data.failureCode } : {}),
        ...(data?.failureMessage ? { failureMessage: data.failureMessage } : {}),
        ...(data?.initiatedAt ? { initiatedAt: data.initiatedAt } : {}),
        ...(data?.completedAt ? { completedAt: data.completedAt } : {}),
      },
    });
  }
}
