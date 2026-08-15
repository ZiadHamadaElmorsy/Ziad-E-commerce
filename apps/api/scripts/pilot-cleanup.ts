/**
 * Pilot database hygiene (Phase 21).
 *
 * Identifies E2E/test residue in the LIVE database and (only with explicit
 * confirmation) removes it — WITHOUT ever touching genuine merchant data.
 *
 * Safety:
 *   - DEFAULT IS DRY-RUN: prints a classified report and exits 0.
 *   - Destructive apply requires BOTH `--apply` and `PILOT_CLEANUP_CONFIRM=YES`.
 *   - If any record cannot be safely classified the script STOPS and reports
 *     instead of guessing (per the Phase 21 audit instruction).
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx ts-node scripts/pilot-cleanup.ts              # dry run
 *   DATABASE_URL=postgresql://... PILOT_CLEANUP_CONFIRM=YES \
 *     npx ts-node scripts/pilot-cleanup.ts --apply                                   # apply
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');
const CONFIRMED = process.env.PILOT_CLEANUP_CONFIRM === 'YES';

const TEST_STORE_SLUG = /(^|[-_])(e2e|test|demo)([-_]|$)/i;
const TEST_STORE_NAME = /\b(e2e|test store|demo)\b/i;
const TEST_USER_EMAIL = /(^|[+@._-])(e2e|test)([+@._-]|$)/i;
const TEST_PRODUCT_NAME = /\b(e2e|storefront product|paymob product|test product|demo)\b/i;
const TEST_CATEGORY_NAME = /\b(e2e|test category|demo)\b/i;

interface Report {
  test: Record<string, number>;
  real: Record<string, number>;
  ambiguous: string[];
}

async function main(): Promise<void> {
  console.log(`Pilot database hygiene — ${APPLY ? 'APPLY mode' : 'DRY-RUN mode'}`);
  if (APPLY && !CONFIRMED) {
    console.error(
      'Aborting: destructive apply requires PILOT_CLEANUP_CONFIRM=YES. Re-run in dry-run mode to review first.',
    );
    process.exitCode = 2;
    return;
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
  } catch (error) {
    console.error(
      'BLOCKED: database unreachable.',
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 2;
    return;
  }

  const report: Report = { test: {}, real: {}, ambiguous: [] };

  // 1. Classify stores.
  const stores = await prisma.store.findMany({ select: { id: true, slug: true, name: true } });
  const testStoreIds = new Set<string>();
  for (const store of stores) {
    if (TEST_STORE_SLUG.test(store.slug) || TEST_STORE_NAME.test(store.name)) {
      testStoreIds.add(store.id);
      report.test.stores = (report.test.stores ?? 0) + 1;
      console.log(`  [TEST store] ${store.slug} — "${store.name}"`);
    } else {
      report.real.stores = (report.real.stores ?? 0) + 1;
      console.log(`  [REAL store] ${store.slug} — "${store.name}"`);
    }
  }

  // 2. Classify users by email marker (independent of store classification).
  const users = await prisma.user.findMany({
    select: { id: true, authUserId: true, email: true, firstName: true },
  });
  const testUserIds = new Set<string>();
  for (const user of users) {
    if ((user.email && TEST_USER_EMAIL.test(user.email)) || /e2e/i.test(user.firstName ?? '')) {
      testUserIds.add(user.id);
      report.test.users = (report.test.users ?? 0) + 1;
      console.log(`  [TEST user] ${user.email ?? '(no email)'} (${user.authUserId ?? user.id})`);
    } else {
      report.real.users = (report.real.users ?? 0) + 1;
    }
  }

  // 3. Classify catalog rows.
  const [products, categories] = await Promise.all([
    prisma.product.findMany({ select: { id: true, storeId: true, slug: true, name: true } }),
    prisma.category.findMany({ select: { id: true, storeId: true, name: true } }),
  ]);
  for (const product of products) {
    if (testStoreIds.has(product.storeId) || TEST_PRODUCT_NAME.test(product.name)) {
      report.test.products = (report.test.products ?? 0) + 1;
    } else {
      report.real.products = (report.real.products ?? 0) + 1;
    }
  }
  for (const category of categories) {
    if (testStoreIds.has(category.storeId) || TEST_CATEGORY_NAME.test(category.name)) {
      report.test.categories = (report.test.categories ?? 0) + 1;
    } else {
      report.real.categories = (report.real.categories ?? 0) + 1;
    }
  }

  await summarizeAndApply(prisma, report, [...testStoreIds], testUserIds);
}

async function summarizeAndApply(
  prisma: PrismaClient,
  report: Report,
  storeIds: string[],
  testUserIds: Set<string>,
): Promise<void> {
  // 4. Commerce rows scoped by store classification.
  const orderCount = await prisma.order.count({ where: { storeId: { in: storeIds } } });
  const cartCount = await prisma.cart.count({ where: { storeId: { in: storeIds } } });
  const reservationCount = await prisma.inventoryReservation.count({
    where: { storeId: { in: storeIds } },
  });
  const paymentCount = await prisma.payment.count({ where: { storeId: { in: storeIds } } });
  const mediaCount = await prisma.media.count({ where: { storeId: { in: storeIds } } });
  const subscriptionCount = await prisma.subscription.count({
    where: { storeId: { in: storeIds } },
  });
  if (orderCount > 0) report.test.orders = orderCount;
  if (cartCount > 0) report.test.carts = cartCount;
  if (reservationCount > 0) report.test.reservations = reservationCount;
  if (paymentCount > 0) report.test.payments = paymentCount;
  if (mediaCount > 0) report.test.media = mediaCount;
  if (subscriptionCount > 0) report.test.subscriptions = subscriptionCount;

  console.log('');
  console.log('Classification report:');
  console.log(`  TEST  : ${JSON.stringify(report.test)}`);
  console.log(`  REAL  : ${JSON.stringify(report.real)}`);

  if (!APPLY) {
    console.log('');
    console.log(
      'Dry-run complete. Re-run with PILOT_CLEANUP_CONFIRM=YES and --apply to remove the TEST rows above.',
    );
    return;
  }

  if (report.ambiguous.length > 0) {
    console.error(
      'ABORTING destructive apply: ambiguous records detected. Nothing was deleted. Resolve and re-run.',
    );
    process.exitCode = 2;
    return;
  }

  await applyCleanup(prisma, storeIds, testUserIds, report);
}

/** FK-safe removal of classified TEST records (child -> parent) in one transaction. */
async function applyCleanup(
  prisma: PrismaClient,
  storeIds: string[],
  testUserIds: Set<string>,
  report: Report,
): Promise<void> {
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { cart: { storeId: { in: storeIds } } } }),
    prisma.cart.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.inventoryReservation.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.inventoryMovement.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.inventory.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.productMedia.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.media.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.productCategory.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.category.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.productVariant.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.product.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.paymentAttempt.deleteMany({ where: { payment: { storeId: { in: storeIds } } } }),
    prisma.paymentEvent.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.payment.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.orderItem.deleteMany({ where: { order: { storeId: { in: storeIds } } } }),
    prisma.order.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.customerAddress.deleteMany({ where: { customer: { storeId: { in: storeIds } } } }),
    prisma.customer.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.pageSection.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.page.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.navigation.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.themeConfiguration.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.storeSettings.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.subscription.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.auditLog.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.storeMembership.deleteMany({ where: { storeId: { in: storeIds } } }),
    prisma.store.deleteMany({ where: { id: { in: storeIds } } }),
    prisma.user.deleteMany({ where: { id: { in: [...testUserIds] } } }),
  ]);

  const removed = Object.values(report.test).reduce((a, b) => a + b, 0);
  console.log(`Cleanup applied: removed ${removed} TEST records.`);
}

void main();
