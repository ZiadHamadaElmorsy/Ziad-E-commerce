import { Prisma } from '@prisma/client';

/**
 * Human-readable per-Store order number (docs/DATABASE.md §15.4, docs/PRD.md
 * §23): `ORD-<year>-<zero-padded sequence>`, e.g. ORD-2026-000001.
 *
 * The sequence is the current Store-wide order count + 1 read inside the
 * caller's transaction. This is intentionally NOT a read-then-write guarantee:
 * `UNIQUE (store_id, order_number)` is the documented concurrency barrier
 * (docs/DATABASE.md §26.2) — the Checkout service re-runs the whole checkout
 * transaction with a fresh number when the insert collides.
 */
export function formatOrderNumber(year: number, sequence: number): string {
  return `ORD-${year}-${String(sequence).padStart(6, '0')}`;
}

/** Next candidate order number: Store-wide count + 1 for the current year. */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  storeId: string,
  now: Date = new Date(),
): Promise<string> {
  const count = await tx.order.count({ where: { storeId } });
  return formatOrderNumber(now.getFullYear(), count + 1);
}
