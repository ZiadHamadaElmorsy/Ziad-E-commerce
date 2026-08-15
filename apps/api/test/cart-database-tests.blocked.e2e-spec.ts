/**
 * CART DATABASE INTEGRATION TESTS — REAL PostgreSQL (Phase 23).
 *
 * Gated on POSTGRES_RLS_TEST_DATABASE_URL (see docs/RLS-TEST-ENVIRONMENT.md).
 * Every probe runs inside a transaction that is rolled back.
 */
import { PrismaClient } from '@prisma/client';
import {
  bindTenant,
  createTestClient,
  expectPgState,
  RLS_TEST_DATABASE_URL,
  seedProductAndVariant,
  seedStore,
} from './db-helpers';

const describeOrSkip = RLS_TEST_DATABASE_URL ? describe : describe.skip;

describeOrSkip('Cart database integration (real PostgreSQL)', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = createTestClient();
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('carts identity CHECK rejects a cart with neither customer_id nor guest_token', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-check-a', 'Cart Check A');
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "carts" (store_id) VALUES (${storeId}::uuid)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('carts partial UNIQUE (store_id, guest_token) rejects a duplicate guest cart', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-uniq-a', 'Cart Uniq A');
        await tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token)
        VALUES (${storeId}::uuid, 'guest-1')`;
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token)
          VALUES (${storeId}::uuid, 'guest-1')`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('allows the same guest token in a different store', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cart-guest-a', 'Cart Guest A');
        const storeB = await seedStore(tx, 'cart-guest-b', 'Cart Guest B');
        await tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token) VALUES (${storeA}::uuid, 'g')`;
        await tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token) VALUES (${storeB}::uuid, 'g')`;
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('cart_items UNIQUE (cart_id, variant_id) rejects a second line for the same variant', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-item-a', 'Cart Item A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'cart-item-p', 'P');
        const [cart] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "carts" (store_id, guest_token) VALUES (${storeId}::uuid, 'guest-2')
        RETURNING id`;
        await tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
        VALUES (${cart.id}::uuid, ${variantId}::uuid, 1)`;
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
          VALUES (${cart.id}::uuid, ${variantId}::uuid, 1)`,
          '23505',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('cart_items CHECK (quantity > 0) rejects quantity = 0', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-qty-a', 'Cart Qty A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'cart-qty-p', 'P');
        const [cart] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "carts" (store_id, guest_token) VALUES (${storeId}::uuid, 'guest-3')
        RETURNING id`;
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
          VALUES (${cart.id}::uuid, ${variantId}::uuid, 0)`,
          '23514',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('deleting a cart cascades to its cart_items', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-cas-a', 'Cart Cas A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'cart-cas-p', 'P');
        const [cart] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "carts" (store_id, guest_token) VALUES (${storeId}::uuid, 'guest-4')
        RETURNING id`;
        await tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
        VALUES (${cart.id}::uuid, ${variantId}::uuid, 1)`;
        await tx.$queryRaw`DELETE FROM "carts" WHERE id = ${cart.id}::uuid`;
        const left = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "cart_items" WHERE cart_id = ${cart.id}::uuid`;
        expect(Number(left[0]?.count ?? 0n)).toBe(0);
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: a member cannot attach a line to another store cart (parent-cart boundary)', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cart-fk-a', 'Cart FK A');
        const storeB = await seedStore(tx, 'cart-fk-b', 'Cart FK B');
        const { variantId } = await seedProductAndVariant(tx, storeB, 'cart-fk-pb', 'PB');
        const [cartB] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "carts" (store_id, guest_token) VALUES (${storeB}::uuid, 'guest-5')
        RETURNING id`;
        // cart_items has NO store_id column by design (DATABASE.md §29.4 — the
        // tenant resolves through the parent cart), so the cross-tenant line is
        // blocked by the parent-cart RLS policy, not a composite FK.
        await bindTenant(tx, storeA);
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
          VALUES (${cartB.id}::uuid, ${variantId}::uuid, 1)`,
          '42501',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('RLS: Store A cannot read or modify Store B carts', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeA = await seedStore(tx, 'cart-rls-a', 'Cart RLS A');
        const storeB = await seedStore(tx, 'cart-rls-b', 'Cart RLS B');
        await tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token) VALUES (${storeB}::uuid, 'gb')`;

        await bindTenant(tx, storeA);
        const foreign = await tx.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "carts" WHERE store_id = ${storeB}::uuid`;
        expect(Number(foreign[0]?.count ?? 0n)).toBe(0);

        // Cross-tenant INSERT is DENIED by the RLS WITH CHECK policy (42501).
        await expectPgState(
          () => tx.$queryRaw`INSERT INTO "carts" (store_id, guest_token) VALUES (${storeB}::uuid, 'forged')`,
          '42501',
        );

        // The 42501 aborted the transaction (25P02) — no clearTenant here.
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });

  it('a failed cart + item multi-write rolls back the whole transaction', async () => {
    await prisma
      .$transaction(async (tx) => {
        const storeId = await seedStore(tx, 'cart-tx-a', 'Cart TX A');
        const { variantId } = await seedProductAndVariant(tx, storeId, 'cart-tx-p', 'P');
        const [cart] = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "carts" (store_id, guest_token) VALUES (${storeId}::uuid, 'guest-6')
        RETURNING id`;
        let failed = false;
        try {
          // Bad quantity aborts the whole transaction (cart insert included).
          await tx.$queryRaw`INSERT INTO "cart_items" (cart_id, variant_id, quantity)
          VALUES (${cart.id}::uuid, ${variantId}::uuid, 0)`;
        } catch {
          failed = true;
        }
        expect(failed).toBe(true);
        // PostgreSQL aborted the whole transaction — any further statement
        // raises 25P02, proving no partial state can persist (Prisma rolls
        // the transaction back on exit).
        await expectPgState(
          () => tx.$queryRaw`SELECT count(*)::bigint AS count FROM "carts" WHERE id = ${cart.id}::uuid`,
          '25P02',
        );
        throw new Error('__rollback__');
      })
      .catch((e: unknown) =>
        e instanceof Error && e.message === '__rollback__' ? undefined : Promise.reject(e),
      );
  });
});
