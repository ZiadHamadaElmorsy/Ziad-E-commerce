/**
 * Phase 25 - production scale test (SAFE / STAGING ONLY).
 *
 * Seeds a dedicated test store with ~1,000 products, ~1,000 orders and
 * ~1,000 customers, then times the EXACT queries the merchant API runs
 * (list + count, server-side search, status filters, dashboard aggregates)
 * and reports real response times. This validates pagination/search/filter
 * behavior at the "medium merchant" size without touching production data.
 *
 * SAFETY:
 *   - NEVER point this at a production DATABASE_URL. It creates real rows in
 *     whatever database it connects to.
 *   - By default the script DELETES its test store and all seeded rows when it
 *     finishes. Pass --keep to leave the data for inspection.
 *   - The test store slug is always scale-test-<timestamp> so it can never
 *     collide with a real merchant store.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx ts-node scripts/scale-test.ts [--keep]
 */
import { Prisma, PrismaClient, ProductStatus, OrderChannel } from '@prisma/client';

const KEEP = process.argv.includes('--keep');
const ROWS = Number(process.env.SCALE_ROWS ?? 1_000);

const prisma = new PrismaClient();

interface TimingRow {
  query: string;
  rows: number;
  ms: number;
}

const timings: TimingRow[] = [];

async function time<T>(label: string, work: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await work();
  const ms = Math.round(performance.now() - start);
  timings.push({ query: label, rows: Array.isArray(result) ? result.length : 0, ms });
  return result;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const storeSlug = `scale-test-${Date.now()}`;
  console.log(
    `Scale test - seeding ${ROWS} products / ${ROWS} orders / ${ROWS} customers (store slug ${storeSlug}, keep=${KEEP})`,
  );

  await prisma.$connect();

  // --- Create the dedicated test store --------------------------------------
  const store = await prisma.store.create({
    data: {
      slug: storeSlug,
      name: 'Scale Test Store',
      description: 'Temporary Phase 25 scale-test data - safe to delete.',
      status: 'ACTIVE',
      currency: 'EGP',
      timezone: 'Africa/Cairo',
    },
  });
  const storeId = store.id;

  try {
    // --- Seed customers -------------------------------------------------------
    const customerSeedStart = performance.now();
    const customers = [];
    for (let i = 0; i < ROWS; i += 1) {
      customers.push({
        storeId,
        email: `customer${i}@scale-test.example`,
        phone: `+2010${String(i).padStart(8, '0')}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
      });
    }
    await prisma.customer.createMany({ data: customers });
    console.log(
      `  seeded ${ROWS} customers in ${Math.round(performance.now() - customerSeedStart)}ms`,
    );

    // --- Seed products (each with one ACTIVE variant) --------------------------
    const productSeedStart = performance.now();
    const products = [];
    for (let i = 0; i < ROWS; i += 1) {
      products.push({
        storeId,
        name: `Scale Product ${i}`,
        slug: `scale-product-${i}`,
        description: `Phase 25 scale-test product number ${i}.`,
        status: i % 3 === 0 ? ProductStatus.DRAFT : ProductStatus.ACTIVE,
      });
    }
    await prisma.product.createMany({ data: products });
    const inserted = await prisma.product.findMany({
      where: { storeId },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
    const variants = inserted.map((product, index) => ({
      storeId,
      productId: product.id,
      name: 'Default',
      sku: `SKU-${index}`,
      price: BigInt(1000 + index),
      compareAtPrice: null,
      status: 'ACTIVE' as const,
    }));
    for (let i = 0; i < variants.length; i += 100) {
      await prisma.productVariant.createMany({ data: variants.slice(i, i + 100) });
    }
    console.log(
      `  seeded ${ROWS} products + variants in ${Math.round(performance.now() - productSeedStart)}ms`,
    );

    // --- Seed orders (each with one snapshot item) ------------------------------
    const orderSeedStart = performance.now();
    const statuses: Array<'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'> = [
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED',
    ];
    for (let i = 0; i < ROWS; i += 50) {
      const batch = [];
      for (let j = 0; j < 50 && i + j < ROWS; j += 1) {
        const idx = i + j;
        const product = inserted[idx];
        batch.push({
          storeId,
          orderNumber: `SCALE-${String(idx).padStart(6, '0')}`,
          channel: OrderChannel.ONLINE_PAYMENT,
          status: statuses[idx % statuses.length],
          currency: 'EGP',
          subtotal: BigInt(25000),
          discountTotal: BigInt(0),
          shippingTotal: BigInt(5000),
          taxTotal: BigInt(0),
          grandTotal: BigInt(30000),
          customerEmail: `customer${idx}@scale-test.example`,
          customerPhone: `+2010${String(idx).padStart(8, '0')}`,
          shippingAddressSnapshot: { line1: 'Scale Test Street', city: 'Cairo' },
          billingAddressSnapshot: Prisma.DbNull,
          lookupToken: `lookup-${storeSlug}-${idx}`,
          items: {
            create: [
              {
                // order_items has no store_id column (tenant inherited via order_id)
                productId: product?.id ?? null,
                variantId: null,
                productNameSnapshot: product?.name ?? 'Scale Product',
                variantNameSnapshot: 'Default',
                skuSnapshot: `SKU-${idx}`,
                unitPrice: BigInt(25000),
                quantity: 1,
                lineTotal: BigInt(25000),
              },
            ],
          },
        });
      }
      for (const order of batch) {
        await prisma.order.create({ data: order });
      }
    }
    console.log(
      `  seeded ${ROWS} orders (with snapshot items) in ${Math.round(performance.now() - orderSeedStart)}ms`,
    );

    // --- Timing: EXACT queries the merchant API runs ---------------------------
    console.log('\nRunning the same queries the merchant API executes...');

    await time('products: page 1 (findMany + count)', async () => {
      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where: { storeId },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { variants: { orderBy: { createdAt: 'asc' } } },
        }),
        prisma.product.count({ where: { storeId } }),
      ]);
      return { items, total };
    });

    await time('products: search "Scale Product 5" (ILIKE)', async () => {
      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where: {
            storeId,
            OR: [
              { name: { contains: 'Scale Product 5', mode: 'insensitive' } },
              { slug: { contains: 'Scale Product 5', mode: 'insensitive' } },
            ],
          },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { variants: { orderBy: { createdAt: 'asc' } } },
        }),
        prisma.product.count({
          where: {
            storeId,
            OR: [
              { name: { contains: 'Scale Product 5', mode: 'insensitive' } },
              { slug: { contains: 'Scale Product 5', mode: 'insensitive' } },
            ],
          },
        }),
      ]);
      return { items, total };
    });

    await time('products: status=ACTIVE page 1', async () => {
      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where: { storeId, status: ProductStatus.ACTIVE },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
          include: { variants: { orderBy: { createdAt: 'asc' } } },
        }),
        prisma.product.count({ where: { storeId, status: ProductStatus.ACTIVE } }),
      ]);
      return { items, total };
    });

    await time('products: countByStatus (groupBy)', async () => {
      const grouped = await prisma.product.groupBy({
        by: ['status'],
        where: { storeId },
        _count: { _all: true },
      });
      return grouped;
    });

    await time('orders: page 1 (findMany + count)', async () => {
      const [items, total] = await Promise.all([
        prisma.order.findMany({
          where: { storeId },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.order.count({ where: { storeId } }),
      ]);
      return { items, total };
    });

    await time('orders: status=DELIVERED page 1', async () => {
      const [items, total] = await Promise.all([
        prisma.order.findMany({
          where: { storeId, status: 'DELIVERED' },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.order.count({ where: { storeId, status: 'DELIVERED' } }),
      ]);
      return { items, total };
    });

    await time('orders: search "SCALE-000042" (ILIKE order number)', async () => {
      const [items, total] = await Promise.all([
        prisma.order.findMany({
          where: {
            storeId,
            OR: [
              { orderNumber: { contains: 'SCALE-000042', mode: 'insensitive' } },
              { customerEmail: { contains: 'SCALE-000042', mode: 'insensitive' } },
              { customerPhone: { contains: 'SCALE-000042', mode: 'insensitive' } },
            ],
          },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.order.count({
          where: {
            storeId,
            OR: [
              { orderNumber: { contains: 'SCALE-000042', mode: 'insensitive' } },
              { customerEmail: { contains: 'SCALE-000042', mode: 'insensitive' } },
              { customerPhone: { contains: 'SCALE-000042', mode: 'insensitive' } },
            ],
          },
        }),
      ]);
      return { items, total };
    });

    await time('orders: SUM(grand_total) - dashboard revenue', async () => {
      const result = await prisma.order.aggregate({
        where: { storeId },
        _sum: { grandTotal: true },
      });
      return result._sum.grandTotal === null ? [] : [result._sum.grandTotal];
    });

    await time('customers: page 1 (findMany + count)', async () => {
      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where: { storeId },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.customer.count({ where: { storeId } }),
      ]);
      return { items, total };
    });

    await time('customers: search "First5" (ILIKE)', async () => {
      const [items, total] = await Promise.all([
        prisma.customer.findMany({
          where: {
            storeId,
            OR: [
              { firstName: { contains: 'First5', mode: 'insensitive' } },
              { lastName: { contains: 'First5', mode: 'insensitive' } },
              { email: { contains: 'First5', mode: 'insensitive' } },
              { phone: { contains: 'First5', mode: 'insensitive' } },
            ],
          },
          skip: 0,
          take: 20,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.customer.count({
          where: {
            storeId,
            OR: [
              { firstName: { contains: 'First5', mode: 'insensitive' } },
              { lastName: { contains: 'First5', mode: 'insensitive' } },
              { email: { contains: 'First5', mode: 'insensitive' } },
              { phone: { contains: 'First5', mode: 'insensitive' } },
            ],
          },
        }),
      ]);
      return { items, total };
    });

    await time('categories: count (dashboard)', async () => {
      return prisma.category.count({ where: { storeId } });
    });

    // --- Report -----------------------------------------------------------------
    console.log('\n=== SCALE TEST RESULTS (1,000 rows per collection) ===');
    console.log(`${'QUERY'.padEnd(52)} ${'ROWS'.padEnd(8)} ${'MS'.padEnd(8)}`);
    for (const row of timings) {
      console.log(
        `${row.query.padEnd(52)} ${String(row.rows).padEnd(8)} ${String(row.ms).padEnd(8)}`,
      );
    }
    const worst = timings.reduce((max, row) => (row.ms > max.ms ? row : max), timings[0]);
    console.log(`\nSlowest query: ${worst.query} (${worst.ms}ms)`);

    // --- Cleanup (unless --keep) ---------------------------------------------------
    if (!KEEP) {
      console.log('\nCleaning up test data...');
      await cleanupStore(storeId);
      console.log('Cleanup complete.');
    } else {
      console.log(
        `\n--keep provided - leaving test data for store id ${storeId} (slug ${storeSlug}).`,
      );
    }

    const totalMs = Math.round(performance.now() - startedAt.valueOf());
    console.log(`Scale test finished in ${totalMs}ms.`);
  } catch (error) {
    console.error('Scale test FAILED.', error);
    // Best-effort cleanup so a failed run never leaves data behind.
    try {
      await cleanupStore(storeId);
    } catch {
      // Ignore cleanup errors on the failure path.
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

/** Deletes every row owned by the test store in FK-safe order. */
async function cleanupStore(storeId: string): Promise<void> {
  const q = (sql: string) => prisma.$executeRawUnsafe(sql, storeId);

  await q(
    `DELETE FROM "cart_items" WHERE "cart_id" IN (SELECT id FROM "carts" WHERE "store_id" = $1::uuid)`,
  );
  await q(`DELETE FROM "carts" WHERE "store_id" = $1::uuid`);
  await q(
    `DELETE FROM "inventory_reservations" WHERE "order_id" IN (SELECT id FROM "orders" WHERE "store_id" = $1::uuid) OR "cart_id" IN (SELECT id FROM "carts" WHERE "store_id" = $1::uuid)`,
  );
  await q(
    `DELETE FROM "order_items" WHERE "order_id" IN (SELECT id FROM "orders" WHERE "store_id" = $1::uuid)`,
  );
  await q(
    `DELETE FROM "payment_events" WHERE "payment_id" IN (SELECT id FROM "payments" WHERE "order_id" IN (SELECT id FROM "orders" WHERE "store_id" = $1::uuid))`,
  );
  await q(
    `DELETE FROM "payment_attempts" WHERE "payment_id" IN (SELECT id FROM "payments" WHERE "order_id" IN (SELECT id FROM "orders" WHERE "store_id" = $1::uuid))`,
  );
  await q(
    `DELETE FROM "payments" WHERE "order_id" IN (SELECT id FROM "orders" WHERE "store_id" = $1::uuid)`,
  );
  await q(`DELETE FROM "orders" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "inventory_movements" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "inventory" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "product_media" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "product_categories" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "product_variants" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "products" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "categories" WHERE "store_id" = $1::uuid`);
  await q(
    `DELETE FROM "customer_addresses" WHERE "customer_id" IN (SELECT id FROM "customers" WHERE "store_id" = $1::uuid)`,
  );
  await q(`DELETE FROM "customers" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "media" WHERE "store_id" = $1::uuid`);
  await q(
    `DELETE FROM "page_sections" WHERE "page_id" IN (SELECT id FROM "pages" WHERE "store_id" = $1::uuid)`,
  );
  await q(`DELETE FROM "pages" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "theme_configurations" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "navigations" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "audit_logs" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "store_settings" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "subscriptions" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "store_memberships" WHERE "store_id" = $1::uuid`);
  await q(`DELETE FROM "stores" WHERE "id" = $1::uuid`);
}

void main();
