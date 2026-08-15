/**
 * Shared helpers for the REAL PostgreSQL database/RLS integration suites
 * (Phase 23). All `*.blocked.e2e-spec.ts` suites are gated on
 * `POSTGRES_RLS_TEST_DATABASE_URL`; when that variable is absent they are
 * skipped (see `docs/RLS-TEST-ENVIRONMENT.md` for the exact setup).
 *
 * Every probe is wrapped in a transaction that is rolled back, so the suites
 * NEVER mutate a real database.
 */
import { Prisma, PrismaClient } from '@prisma/client';

/** Test database URL — absent => the RLS/database suites are skipped. */
export const RLS_TEST_DATABASE_URL = process.env.POSTGRES_RLS_TEST_DATABASE_URL;
/** Enforcement role the app switches to under FORCE ROW LEVEL SECURITY. */
export const ENFORCEMENT_ROLE = process.env.RLS_ENFORCEMENT_ROLE ?? 'ziad_runtime';

export function createTestClient(): PrismaClient {
  if (!RLS_TEST_DATABASE_URL) {
    throw new Error('POSTGRES_RLS_TEST_DATABASE_URL is required to run the database suites.');
  }
  return new PrismaClient({ datasources: { db: { url: RLS_TEST_DATABASE_URL } } });
}

/**
 * Extracts the PostgreSQL SQLSTATE from a thrown Prisma/driver error.
 * Known states used by these suites:
 *   23505 unique_violation | 23503 foreign_key_violation | 23502 not_null_violation
 *   23514 check_violation  | 23501/23P01 restore/limit  | 42703 undefined_column
 */
export function sqlState(error: unknown): string | null {
  if (!(error instanceof Error)) {
    return null;
  }
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  const direct =
    typeof candidate.code === 'string' && /^\d{5}$/.test(candidate.code) ? candidate.code : null;
  if (direct) {
    return direct;
  }
  const metaCode =
    typeof candidate.meta?.code === 'string' && /^\d{5}$/.test(candidate.meta.code)
      ? candidate.meta.code
      : null;
  if (metaCode) {
    return metaCode;
  }
  const match = error.message.match(
    /(23505|23503|23502|23514|23501|23P01|42P01|42703|42883|22P02|42501|25P02|23001|42P17)/,
  );
  return match ? match[1] : null;
}

/**
 * Runs `work` and asserts that it throws a PostgreSQL error with `state`.
 * Returns the state so callers can assert specific constraints.
 */
export async function expectPgState(work: () => Promise<unknown>, state: string): Promise<void> {
  try {
    await work();
  } catch (error) {
    const actual = sqlState(error);
    if (actual === state) {
      return;
    }
    throw new Error(
      `Expected PostgreSQL error ${state} but got ${actual ?? 'none'} (${error instanceof Error ? error.message : String(error)}).`,
    );
  }
  throw new Error(`Expected PostgreSQL error ${state} but the statement succeeded.`);
}

/** Runs `work` and asserts that it succeeds (no PostgreSQL error). */
export async function expectPgSuccess(work: () => Promise<unknown>): Promise<void> {
  try {
    await work();
  } catch (error) {
    throw new Error(
      `Expected the statement to succeed but PostgreSQL raised ${sqlState(error) ?? 'an error'}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Binds the transaction to `storeId` AS the enforcement role (RLS on). */
export async function bindTenant(tx: Prisma.TransactionClient, storeId: string): Promise<void> {
  await tx.$executeRaw`SELECT set_config('role', ${ENFORCEMENT_ROLE}, true)`;
  await tx.$executeRaw`SELECT app.set_current_store_id(${storeId}::uuid)`;
}

/** Clears the tenant context (NULL -> RLS sees no rows). */
export async function clearTenant(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_store_id', '', false)`;
}

/**
 * Seeds a scratch store inside the caller's transaction and returns its id.
 * The caller MUST throw `new Error('__rollback__')` before the transaction
 * commits so no seed data ever reaches the database.
 */
export async function seedStore(
  tx: Prisma.TransactionClient,
  slug: string,
  name: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "stores" (slug, name, status, currency, timezone)
    VALUES (${slug}, ${name}, 'ACTIVE', 'EGP', 'Africa/Cairo')
    RETURNING id`;
  return rows[0].id;
}

/** Seeds a product + its variant inside the caller's transaction. */
export async function seedProductAndVariant(
  tx: Prisma.TransactionClient,
  storeId: string,
  slug: string,
  name: string,
): Promise<{ productId: string; variantId: string }> {
  const products = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "products" (store_id, slug, name, status)
    VALUES (${storeId}::uuid, ${slug}, ${name}, 'ACTIVE')
    RETURNING id`;
  const variants = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "product_variants" (store_id, product_id, name, price, status)
    VALUES (${storeId}::uuid, ${products[0].id}::uuid, ${name}, 1000, 'ACTIVE')
    RETURNING id`;
  return { productId: products[0].id, variantId: variants[0].id };
}

/** Seeds an inventory row for a variant inside the caller's transaction. */
export async function seedInventory(
  tx: Prisma.TransactionClient,
  storeId: string,
  variantId: string,
  onHand: number,
): Promise<void> {
  await tx.$queryRaw`
    INSERT INTO "inventory" (store_id, variant_id, on_hand_quantity, reserved_quantity)
    VALUES (${storeId}::uuid, ${variantId}::uuid, ${onHand}, 0)`;
}

/** Seeds an Order row inside the caller's transaction. Returns its id. */
export async function seedOrder(
  tx: Prisma.TransactionClient,
  storeId: string,
  orderNumber: string,
  overrides: { idempotencyKey?: string | null; grandTotal?: bigint; subtotal?: bigint } = {},
): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "orders" (
      store_id, order_number, channel, status, currency,
      subtotal, discount_total, shipping_total, tax_total, grand_total,
      shipping_address_snapshot, idempotency_key, lookup_token
    )
    VALUES (
      ${storeId}::uuid, ${orderNumber}, 'ONLINE_PAYMENT', 'PENDING', 'EGP',
      ${overrides.subtotal ?? 1000n}, 0, 0, 0, ${overrides.grandTotal ?? 1000n},
      '{}'::jsonb, ${overrides.idempotencyKey ?? null}, gen_random_uuid()::text
    )
    RETURNING id`;
  return rows[0].id;
}

/** Seeds a Payment row inside the caller's transaction. Returns its id. */
export async function seedPayment(
  tx: Prisma.TransactionClient,
  storeId: string,
  orderId: string,
  providerReference?: string,
): Promise<string> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "payments" (store_id, order_id, status, provider, amount, currency, provider_reference)
    VALUES (${storeId}::uuid, ${orderId}::uuid, 'PENDING', 'paymob', 1000, 'EGP', ${providerReference ?? null})
    RETURNING id`;
  return rows[0].id;
}
