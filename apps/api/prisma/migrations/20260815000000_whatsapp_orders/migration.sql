-- Phase 22 — WhatsApp ordering.
-- Justified schema change (see docs/IMPLEMENTATION-PHASE22-PAYMENTS-WHATSAPP.md):
-- the order acquisition/payment channel must be queryable and displayed in the
-- merchant dashboard ("Payment Channel: Online Payment / WhatsApp"). Orders had
-- no metadata column to carry this, so a dedicated nullable-free enum column
-- with a backward-compatible default is added. Existing rows become
-- ONLINE_PAYMENT (the historical behavior).

-- Create the order_channel enum type.
CREATE TYPE "order_channel" AS ENUM ('ONLINE_PAYMENT', 'WHATSAPP');

-- Add the channel column with a safe default so existing rows are preserved.
ALTER TABLE "orders"
  ADD COLUMN "channel" "order_channel" NOT NULL DEFAULT 'ONLINE_PAYMENT';
