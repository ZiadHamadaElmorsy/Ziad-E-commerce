-- ---------------------------------------------------------------------------
-- Phase 28 — Returns & order finality (F-1/F-10)
-- ---------------------------------------------------------------------------
-- Source: docs/ARCHITECTURE-AUDIT-PHASE28.md findings F-1 and F-10.
--
--   1. shipments.restocked_at — exactly-once restock guard. A shipment that
--      reaches a terminal failure state (RETURNED / REJECTED / DELIVERY_FAILED)
--      restores the order's variant stock to inventory exactly once. NULL until
--      that restock happens; the guarded `UPDATE ... SET restocked_at = now()
--      WHERE restocked_at IS NULL` makes the restock idempotent even when a
--      REJECTED shipment later transitions to RETURNED.
--
--   2. orders.returned_at + order_status.RETURNED — the order lifecycle gains a
--      terminal RETURNED state (reachable from CONFIRMED / PROCESSING / SHIPPED)
--      so the order mirrors the shipment return without coupling the two state
--      machines. The timestamp follows the existing confirmed_at/cancelled_at
--      convention (DATABASE §7.16).
--
--   3. movement_type.RETURN — a dedicated append-only inventory movement for
--      returned stock (quantity is positive; the target counter is on_hand).
--
-- All additions are additive: enum values are appended, columns are nullable,
-- existing rows and flows are untouched.
-- ---------------------------------------------------------------------------

-- 1. Order status: RETURNED (appended to the enum; no default change).
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'RETURNED';

-- 2. Inventory movement type: RETURN (appended to the enum).
ALTER TYPE "movement_type" ADD VALUE IF NOT EXISTS 'RETURN';

-- 3. Exactly-once shipment restock guard.
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "restocked_at" TIMESTAMPTZ;

-- 4. Order return timestamp (mirrors confirmed_at / cancelled_at).
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMPTZ;

-- Operational lookups: shipments that still need their restock side effect
-- applied (merchant/ops visibility) and returned-order listing.
CREATE INDEX IF NOT EXISTS "shipments_store_id_restocked_at_idx"
  ON "shipments" ("store_id", "restocked_at");

CREATE INDEX IF NOT EXISTS "orders_store_id_returned_at_idx"
  ON "orders" ("store_id", "returned_at");
