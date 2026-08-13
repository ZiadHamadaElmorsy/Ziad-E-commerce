import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RlsTenantBinder } from './rls-tenant-binder';

export interface TransactionOptions {
  /** Transaction isolation level (Prisma interactive transaction). */
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Maximum time (ms) a transaction may hold the connection. */
  timeout?: number;
  /** Maximum time (ms) to wait for a pooled connection. */
  maxWait?: number;
}

/** Options accepted by PrismaClient.$transaction (interactive overload). */
type PrismaInteractiveTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  timeout?: number;
  maxWait?: number;
};

/**
 * Reusable transaction boundary around Prisma interactive transactions
 * (DATABASE.md section 28 — Transaction Boundaries).
 *
 * Future workflows (checkout, payment success/failure, order cancellation,
 * inventory adjustment, reservation expiration, store creation, membership
 * changes) will wrap their units of work in one explicit transaction and
 * depend on this helper — never on nested/assumed transaction semantics.
 *
 * - `run`        : plain interactive transaction, explicit boundary.
 * - `runWithTenant` : binds the resolved Store ID to the DB session
 *   (`app.set_current_store_id`) for the duration of the transaction and
 *   resets it in `finally`, so RLS always sees the correct tenant and the
 *   pooled connection is never leaked with another tenant's context.
 *
 * External API calls must stay OUTSIDE these transactions (DATABASE.md §28.7).
 */
@Injectable()
export class TransactionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsTenantBinder: RlsTenantBinder,
  ) {}

  /**
   * Runs `work` inside a single interactive transaction. Rolls back on any
   * throw. `tx` is the Prisma transaction client — domain code must use only
   * `tx` (never the global PrismaService) inside the boundary.
   */
  async run<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return this.prisma.$transaction((tx) => work(tx), this.buildOptions(options));
  }

  /**
   * Same as {@link run} but binds the trusted `storeId` as the database tenant
   * context for the whole transaction. `storeId` MUST come from the resolved
   * tenant context (membership -> store), never from client input.
   */
  async runWithTenant<T>(
    storeId: string,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await this.rlsTenantBinder.bind(tx, storeId);

      try {
        const result = await work(tx);
        // Success path: the tenant reset must succeed so the pooled
        // connection never carries another tenant's context — fail loud if
        // it does not.
        await this.rlsTenantBinder.reset(tx);
        return result;
      } catch (error) {
        // Failure path: `work` threw, so the transaction is already aborted
        // and the reset itself would fail with Postgres 25P02 ("current
        // transaction is aborted"). The reset is best-effort here — the
        // ORIGINAL error must never be masked by cleanup failures.
        try {
          await this.rlsTenantBinder.reset(tx);
        } catch {
          // Transaction already aborted; keep the original error.
        }
        throw error;
      }
    }, this.buildOptions(options));
  }

  private buildOptions(
    options?: TransactionOptions,
  ): PrismaInteractiveTransactionOptions | undefined {
    if (!options) {
      return undefined;
    }
    const prismaOptions: PrismaInteractiveTransactionOptions = {};
    if (options.isolationLevel) {
      prismaOptions.isolationLevel = options.isolationLevel;
    }
    if (options.timeout !== undefined) {
      prismaOptions.timeout = options.timeout;
    }
    if (options.maxWait !== undefined) {
      prismaOptions.maxWait = options.maxWait;
    }
    return prismaOptions;
  }
}
