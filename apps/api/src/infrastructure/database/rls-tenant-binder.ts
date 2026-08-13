import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Binds the tenant store to the PostgreSQL request/session context so RLS
 * policies (DATABASE.md section 29 / migration.sql) evaluate
 * `app.current_store_id()` correctly.
 *
 * The migration defines (as the FINAL database contract):
 *
 *   app.current_store_id()            -> reads the session GUC
 *   app.set_current_store_id(uuid)    -> writes the session GUC (is_local=false)
 *
 * Because `set_config(..., is_local = false)` persists for the pooled
 * connection after the transaction, this binder ALWAYS pairs the bind with a
 * reset. The transaction helper guarantees the reset in a `finally` block so a
 * connection can never return to the pool carrying another tenant's context.
 *
 * IMPORTANT: this is application-level plumbing for the RLS foundation. Real
 * RLS behavior is NOT exercised until a live PostgreSQL instance is available
 * (tests are marked BLOCKED — PostgreSQL unavailable).
 */
@Injectable()
export class RlsTenantBinder {
  /**
   * Binds `storeId` as the current tenant for the given (transaction) client.
   */
  async bind(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
    await tx.$executeRaw`SELECT app.set_current_store_id(${storeId}::uuid)`;
  }

  /**
   * Clears the current tenant so the pooled connection is left tenant-neutral.
   * `app.current_store_id()` returns NULL for an empty setting, which is the
   * correct "no tenant" value for RLS policies (fail closed).
   */
  async reset(tx: Prisma.TransactionClient): Promise<void> {
    await tx.$executeRaw`SELECT set_config('app.current_store_id', '', false)`;
  }
}
