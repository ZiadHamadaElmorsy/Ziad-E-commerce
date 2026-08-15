import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 * Phase 21 — RLS effective enforcement (`RLS_ENFORCEMENT_ROLE`): when the
 * environment defines a runtime role, `bind` first switches the transaction
 * to that role with `SET LOCAL ROLE`. Combined with the `FORCE ROW LEVEL
 * SECURITY` migration, the application connection can no longer bypass
 * policies as table owner. `SET LOCAL ROLE` is transaction-scoped and reverts
 * automatically when the transaction ends (safe for pooled connections).
 *
 * IMPORTANT: this is application-level plumbing for the RLS foundation. Real
 * RLS behavior is NOT exercised until a live PostgreSQL instance is available
 * (tests are marked BLOCKED — PostgreSQL unavailable).
 */
@Injectable()
export class RlsTenantBinder {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Binds `storeId` as the current tenant for the given (transaction) client.
   */
  async bind(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
    const rlsRole = this.rlsEnforcementRole();
    if (rlsRole) {
      // A non-owner runtime role makes RLS effective for the application
      // connection (see the Phase 21 migration). Transaction-scoped.
      await tx.$executeRaw`SELECT set_config('role', ${rlsRole}, true)`;
    }
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

  /** The configured RLS enforcement role (RLS_ENFORCEMENT_ROLE), or undefined. */
  private rlsEnforcementRole(): string | undefined {
    const role = this.configService.get<string>('rlsEnforcementRole');
    return role && role.trim().length > 0 ? role.trim() : undefined;
  }
}
