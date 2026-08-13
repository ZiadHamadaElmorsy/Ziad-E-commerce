-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required PostgreSQL extension.
-- gen_random_uuid() is built-in on PostgreSQL 13+; pgcrypto guarantees
-- availability on older PostgreSQL versions and is a no-op when already present.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateEnum
CREATE TYPE "store_status" AS ENUM ('ACTIVE', 'DISABLED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "product_status" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "variant_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "category_status" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "reservation_status" AS ENUM ('ACTIVE', 'CONSUMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "cart_status" AS ENUM ('ACTIVE', 'EXPIRED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "page_status" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "movement_type" AS ENUM ('INITIAL_STOCK', 'ADJUSTMENT', 'SALE', 'RESERVATION', 'CONSUMPTION', 'RELEASE');

-- CreateEnum
CREATE TYPE "event_processing_status" AS ENUM ('RECEIVED', 'PROCESSED', 'ERROR');

-- CreateEnum
CREATE TYPE "media_type" AS ENUM ('IMAGE', 'VIDEO', 'FILE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auth_user_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "store_status" NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL DEFAULT 'EGP',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'TRIAL',
    "trial_started_at" TIMESTAMPTZ,
    "trial_ends_at" TIMESTAMPTZ,
    "activated_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "product_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" BIGINT NOT NULL,
    "compare_at_price" BIGINT,
    "cost_price" BIGINT,
    "status" "variant_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "status" "category_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "on_hand_quantity" INTEGER NOT NULL,
    "reserved_quantity" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "cart_id" UUID,
    "order_id" UUID,
    "quantity" INTEGER NOT NULL,
    "status" "reservation_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ,
    "released_at" TIMESTAMPTZ,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "movement_type" "movement_type" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference_type" TEXT,
    "reference_id" UUID,
    "reason" TEXT,
    "on_hand_after" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "auth_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" TEXT,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "country" TEXT,
    "governorate" TEXT,
    "city" TEXT NOT NULL,
    "address_line" TEXT NOT NULL,
    "building" TEXT,
    "apartment" TEXT,
    "postal_code" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "customer_id" UUID,
    "guest_token" TEXT,
    "status" "cart_status" NOT NULL DEFAULT 'ACTIVE',
    "currency" CHAR(3) NOT NULL DEFAULT 'EGP',
    "expires_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "order_number" TEXT NOT NULL,
    "customer_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'PENDING',
    "currency" CHAR(3) NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "shipping_total" BIGINT NOT NULL,
    "tax_total" BIGINT NOT NULL,
    "grand_total" BIGINT NOT NULL,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "shipping_address_snapshot" JSONB NOT NULL,
    "billing_address_snapshot" JSONB,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID,
    "variant_id" UUID,
    "product_name_snapshot" TEXT NOT NULL,
    "variant_name_snapshot" TEXT NOT NULL,
    "sku_snapshot" TEXT,
    "unit_price" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "line_total" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "idempotency_key" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "status" "payment_status" NOT NULL DEFAULT 'PENDING',
    "provider_reference" TEXT,
    "idempotency_key" TEXT,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "initiated_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID,
    "payment_id" UUID,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "processing_status" "event_processing_status" NOT NULL DEFAULT 'RECEIVED',
    "error_message" TEXT,
    "processed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "page_status" NOT NULL DEFAULT 'DRAFT',
    "seo_title" TEXT,
    "seo_description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "page_id" UUID NOT NULL,
    "section_type" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "navigations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "navigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "theme_configurations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "logo_media_id" UUID,
    "config" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "theme_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "storage_path" TEXT NOT NULL,
    "media_type" "media_type" NOT NULL,
    "mime_type" TEXT,
    "size_bytes" BIGINT,
    "alt_text" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "variant_id" UUID,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "settings" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_user_id_key" ON "users"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "stores_slug_key" ON "stores"("slug");

-- CreateIndex
CREATE INDEX "stores_status_idx" ON "stores"("status");

-- CreateIndex
CREATE INDEX "store_memberships_store_id_idx" ON "store_memberships"("store_id");

-- CreateIndex
CREATE INDEX "store_memberships_user_id_idx" ON "store_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_memberships_store_id_user_id_key" ON "store_memberships"("store_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "products_store_id_idx" ON "products"("store_id");

-- CreateIndex
CREATE INDEX "products_store_id_status_idx" ON "products"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_id_key" ON "products"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_slug_key" ON "products"("store_id", "slug");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "product_variants_store_id_status_idx" ON "product_variants"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_id_key" ON "product_variants"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_store_id_sku_key" ON "product_variants"("store_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_id_key" ON "categories"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_slug_key" ON "categories"("store_id", "slug");

-- CreateIndex
CREATE INDEX "product_categories_category_id_idx" ON "product_categories"("category_id");

-- CreateIndex
CREATE INDEX "product_categories_product_id_idx" ON "product_categories"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_product_id_category_id_key" ON "product_categories"("product_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_variant_id_key" ON "inventory"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_store_id_variant_id_key" ON "inventory"("store_id", "variant_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_store_id_status_expires_at_idx" ON "inventory_reservations"("store_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "inventory_reservations_variant_id_idx" ON "inventory_reservations"("variant_id");

-- CreateIndex
CREATE INDEX "inventory_reservations_order_id_idx" ON "inventory_reservations"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movements_variant_id_created_at_idx" ON "inventory_movements"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "customers_store_id_idx" ON "customers"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_store_id_id_key" ON "customers"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_store_id_email_key" ON "customers"("store_id", "email");

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- CreateIndex
CREATE INDEX "carts_store_id_customer_id_idx" ON "carts"("store_id", "customer_id");

-- CreateIndex
CREATE INDEX "carts_store_id_status_expires_at_idx" ON "carts"("store_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "orders_store_id_status_idx" ON "orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "orders_store_id_customer_id_idx" ON "orders"("store_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_id_key" ON "orders"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_order_number_key" ON "orders"("store_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "payment_attempts_payment_id_idx" ON "payment_attempts"("payment_id");

-- CreateIndex
CREATE INDEX "payment_events_store_id_created_at_idx" ON "payment_events"("store_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_provider_event_id_key" ON "payment_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_store_id_id_key" ON "pages"("store_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_store_id_slug_key" ON "pages"("store_id", "slug");

-- CreateIndex
CREATE INDEX "page_sections_page_id_idx" ON "page_sections"("page_id");

-- CreateIndex
CREATE UNIQUE INDEX "theme_configurations_store_id_key" ON "theme_configurations"("store_id");

-- CreateIndex
CREATE INDEX "media_store_id_idx" ON "media"("store_id");

-- CreateIndex
CREATE UNIQUE INDEX "media_store_id_id_key" ON "media"("store_id", "id");

-- CreateIndex
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_media_id_key" ON "product_media"("product_id", "media_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_settings_store_id_key" ON "store_settings"("store_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_created_at_idx" ON "audit_logs"("store_id", "created_at");

-- AddForeignKey
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_memberships" ADD CONSTRAINT "store_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_product_id_fkey" FOREIGN KEY ("store_id", "product_id") REFERENCES "products"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_id_product_id_fkey" FOREIGN KEY ("store_id", "product_id") REFERENCES "products"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_store_id_category_id_fkey" FOREIGN KEY ("store_id", "category_id") REFERENCES "categories"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory" ADD CONSTRAINT "inventory_store_id_variant_id_fkey" FOREIGN KEY ("store_id", "variant_id") REFERENCES "product_variants"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_store_id_variant_id_fkey" FOREIGN KEY ("store_id", "variant_id") REFERENCES "product_variants"("store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_variant_id_fkey" FOREIGN KEY ("store_id", "variant_id") REFERENCES "product_variants"("store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_store_id_customer_id_fkey" FOREIGN KEY ("store_id", "customer_id") REFERENCES "customers"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_store_id_order_id_fkey" FOREIGN KEY ("store_id", "order_id") REFERENCES "orders"("store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_sections" ADD CONSTRAINT "page_sections_store_id_page_id_fkey" FOREIGN KEY ("store_id", "page_id") REFERENCES "pages"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "navigations" ADD CONSTRAINT "navigations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_configurations" ADD CONSTRAINT "theme_configurations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "theme_configurations" ADD CONSTRAINT "theme_configurations_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_store_id_product_id_fkey" FOREIGN KEY ("store_id", "product_id") REFERENCES "products"("store_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_store_id_media_id_fkey" FOREIGN KEY ("store_id", "media_id") REFERENCES "media"("store_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===========================================================================
-- PostgreSQL-specific constraints NOT expressible in the Prisma schema
-- (documented in schema.prisma header). The PostgreSQL database is
-- authoritative; Prisma represents these tables without the following
-- constraints, which are enforced at the database level.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- CHECK constraints (DATABASE.md sections 7, 13, 32)
-- ---------------------------------------------------------------------------

-- product_variants: money >= 0 (BIGINT minor units)
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_product_variants_price_nonneg" CHECK ("price" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_product_variants_compare_at_price_nonneg" CHECK ("compare_at_price" >= 0);
ALTER TABLE "product_variants" ADD CONSTRAINT "chk_product_variants_cost_price_nonneg" CHECK ("cost_price" >= 0);

-- inventory: on_hand >= 0, reserved >= 0, available = on_hand - reserved >= 0
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inventory_on_hand_nonneg" CHECK ("on_hand_quantity" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inventory_reserved_nonneg" CHECK ("reserved_quantity" >= 0);
ALTER TABLE "inventory" ADD CONSTRAINT "chk_inventory_available_nonneg" CHECK ("on_hand_quantity" >= "reserved_quantity");

-- inventory_reservations: quantity > 0; reservation always has checkout or order context
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "chk_inventory_reservations_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "chk_inventory_reservations_context" CHECK ("cart_id" IS NOT NULL OR "order_id" IS NOT NULL);

-- cart_items: quantity > 0
ALTER TABLE "cart_items" ADD CONSTRAINT "chk_cart_items_quantity_positive" CHECK ("quantity" > 0);

-- carts: exactly one identity path (customer OR guest token)
ALTER TABLE "carts" ADD CONSTRAINT "chk_carts_identity" CHECK ("customer_id" IS NOT NULL OR "guest_token" IS NOT NULL);

-- orders: money >= 0 + grand_total consistency (DATABASE.md section 7.16)
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_subtotal_nonneg" CHECK ("subtotal" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_discount_total_nonneg" CHECK ("discount_total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_shipping_total_nonneg" CHECK ("shipping_total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_tax_total_nonneg" CHECK ("tax_total" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_grand_total_consistency" CHECK ("grand_total" = "subtotal" - "discount_total" + "shipping_total" + "tax_total");

-- order_items: quantity > 0; line_total >= 0
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_items" ADD CONSTRAINT "chk_order_items_line_total_nonneg" CHECK ("line_total" >= 0);

-- payments / payment_attempts: amount > 0
ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "payment_attempts" ADD CONSTRAINT "chk_payment_attempts_amount_positive" CHECK ("amount" > 0);

-- media: size_bytes >= 0
ALTER TABLE "media" ADD CONSTRAINT "chk_media_size_bytes_nonneg" CHECK ("size_bytes" >= 0);

-- ---------------------------------------------------------------------------
-- Partial UNIQUE indexes (DATABASE.md section 10).
-- Prisma cannot express partial unique indexes; they are enforced here.
-- PostgreSQL unique indexes treat NULLs as distinct, so NULLable idempotency
-- / reference columns remain unrestricted when absent.
-- ---------------------------------------------------------------------------

-- At most one OWNER per store.
CREATE UNIQUE INDEX "uq_store_memberships_single_owner"
  ON "store_memberships" ("store_id")
  WHERE "role" = 'OWNER';

-- Guest cart identity: one active token per (store, token); unlimited NULL tokens.
CREATE UNIQUE INDEX "uq_carts_guest_token"
  ON "carts" ("store_id", "guest_token")
  WHERE "guest_token" IS NOT NULL;

-- Checkout idempotency (when an idempotency key is present).
CREATE UNIQUE INDEX "uq_orders_idempotency_key"
  ON "orders" ("store_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Payment initiation idempotency (when an idempotency key is present).
CREATE UNIQUE INDEX "uq_payments_idempotency_key"
  ON "payments" ("store_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Provider reconciliation: a provider payment reference is never reused.
CREATE UNIQUE INDEX "uq_payments_provider_reference"
  ON "payments" ("provider", "provider_reference")
  WHERE "provider_reference" IS NOT NULL;

-- Attempt-level idempotency within the parent payment.
CREATE UNIQUE INDEX "uq_payment_attempts_idempotency_key"
  ON "payment_attempts" ("payment_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- payment_events partial index for the webhook retry / reprocessing scan
-- (DATABASE.md section 11). Prisma cannot express partial indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX "idx_payment_events_processing_status"
  ON "payment_events" ("processing_status")
  WHERE "processing_status" IN ('RECEIVED', 'ERROR');


-- ===========================================================================
-- Row-Level Security foundation (DATABASE.md section 29)
-- Defense-in-depth. Application-layer authorization remains the primary
-- control; RLS guarantees a leaked or forged query cannot cross tenant
-- boundaries. All 28 tables get RLS enabled.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tenant context helpers
-- app.current_store_id() returns the tenant UUID bound to the current
-- request/session. The backend sets it per request via
-- app.set_current_store_id() after authenticating the user and resolving an
-- ACTIVE membership (merchant requests) or resolving the Store from the
-- public storefront URL (public requests). It is never attacker-controlled.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_store_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
    SELECT NULLIF(current_setting('app.current_store_id', true), '')::uuid
  $$;

CREATE OR REPLACE FUNCTION app.set_current_store_id(store_id uuid) RETURNS void
  LANGUAGE sql
  AS $$
    SELECT set_config('app.current_store_id', store_id::text, false)
  $$;

-- ---------------------------------------------------------------------------
-- Role provisioning
-- Supabase hosts already provide `anon` and `authenticated`; on a standalone
-- PostgreSQL these roles are created here (NOLOGIN) so the migration is safe
-- to apply to a fresh database. Must run BEFORE any role-bound GRANT.
-- auth.uid() is provided by Supabase Auth; on a standalone database a
-- compatible fallback reads the session GUC `app.current_user_id`.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) THEN
    EXECUTE 'CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS '
      || quote_literal('SELECT NULLIF(current_setting(''app.current_user_id'', true), '''')::uuid');
  END IF;
END;
$$;

-- Only trusted roles may bind the tenant context.
REVOKE ALL ON FUNCTION app.set_current_store_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.set_current_store_id(uuid) TO authenticated;

GRANT USAGE ON SCHEMA app TO authenticated, anon;
GRANT EXECUTE ON FUNCTION app.current_store_id() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- Table privileges (column-level)
-- authenticated: full DML on every tenant table (row access is gated by RLS).
-- anon: read-only access to public storefront tables only.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON "stores", "products", "product_variants", "categories", "pages",
  "page_sections", "navigations", "theme_configurations", "media", "product_media" TO anon;

-- ---------------------------------------------------------------------------
-- Enable RLS on every tenant table (all 28 tables).
-- ---------------------------------------------------------------------------
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_variants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_reservations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_addresses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "page_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "navigations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "theme_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "product_media" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------------
-- Policies - special tables (DATABASE.md section 29.5)
-- users: a user may access their own row (id = auth.uid(), per DATABASE.md).
-- stores / store_memberships / subscriptions: members with an ACTIVE
-- membership may read; write paths run through the service role.
-- ---------------------------------------------------------------------------
CREATE POLICY user_own_row_select ON "users"
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL AND "id" = auth.uid());

CREATE POLICY member_store_select ON "stores"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "store_memberships" m
    WHERE m."store_id" = "stores"."id"
      AND m."user_id" = auth.uid()
      AND m."status" = 'ACTIVE'
  ));

CREATE POLICY member_membership_select ON "store_memberships"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "store_memberships" m
    WHERE m."store_id" = "store_memberships"."store_id"
      AND m."user_id" = auth.uid()
      AND m."status" = 'ACTIVE'
  ));

CREATE POLICY member_subscription_select ON "subscriptions"
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "store_memberships" m
    WHERE m."store_id" = "subscriptions"."store_id"
      AND m."user_id" = auth.uid()
      AND m."status" = 'ACTIVE'
  ));

-- ---------------------------------------------------------------------------
-- Tenant-isolation policies for every directly store-owned table
-- (DATABASE.md section 29.3). Bound to the authenticated (merchant) role so
-- the public `anon` role can never observe non-public rows (section 29.6).
-- ---------------------------------------------------------------------------

-- products
CREATE POLICY tenant_isolation_select ON "products"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "products"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "products"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "products"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- product_variants
CREATE POLICY tenant_isolation_select ON "product_variants"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "product_variants"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "product_variants"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "product_variants"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- categories
CREATE POLICY tenant_isolation_select ON "categories"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "categories"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "categories"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "categories"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());


-- product_categories
CREATE POLICY tenant_isolation_select ON "product_categories"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "product_categories"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "product_categories"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "product_categories"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- inventory
CREATE POLICY tenant_isolation_select ON "inventory"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "inventory"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "inventory"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "inventory"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- inventory_reservations
CREATE POLICY tenant_isolation_select ON "inventory_reservations"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "inventory_reservations"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "inventory_reservations"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "inventory_reservations"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- inventory_movements
CREATE POLICY tenant_isolation_select ON "inventory_movements"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "inventory_movements"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "inventory_movements"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "inventory_movements"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- customers
CREATE POLICY tenant_isolation_select ON "customers"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "customers"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "customers"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "customers"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- customer_addresses
CREATE POLICY tenant_isolation_select ON "customer_addresses"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "customer_addresses"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "customer_addresses"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "customer_addresses"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());


-- carts
CREATE POLICY tenant_isolation_select ON "carts"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "carts"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "carts"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "carts"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- orders
CREATE POLICY tenant_isolation_select ON "orders"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "orders"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "orders"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "orders"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- payments
CREATE POLICY tenant_isolation_select ON "payments"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "payments"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "payments"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "payments"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- payment_events: unresolved rows (store_id NULL) are invisible to tenant
-- queries and are processed only by the service role (DATABASE.md 29.5).
CREATE POLICY tenant_isolation_select ON "payment_events"
  FOR SELECT TO authenticated
  USING ("store_id" IS NOT NULL AND "store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "payment_events"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" IS NOT NULL AND "store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "payment_events"
  FOR UPDATE TO authenticated
  USING ("store_id" IS NOT NULL AND "store_id" = app.current_store_id())
  WITH CHECK ("store_id" IS NOT NULL AND "store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "payment_events"
  FOR DELETE TO authenticated
  USING ("store_id" IS NOT NULL AND "store_id" = app.current_store_id());

-- pages
CREATE POLICY tenant_isolation_select ON "pages"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "pages"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "pages"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "pages"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- page_sections
CREATE POLICY tenant_isolation_select ON "page_sections"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "page_sections"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "page_sections"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "page_sections"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());


-- navigations
CREATE POLICY tenant_isolation_select ON "navigations"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "navigations"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "navigations"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "navigations"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- theme_configurations
CREATE POLICY tenant_isolation_select ON "theme_configurations"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "theme_configurations"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "theme_configurations"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "theme_configurations"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- media
CREATE POLICY tenant_isolation_select ON "media"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "media"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "media"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "media"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- product_media
CREATE POLICY tenant_isolation_select ON "product_media"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "product_media"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "product_media"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "product_media"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- store_settings
CREATE POLICY tenant_isolation_select ON "store_settings"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "store_settings"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "store_settings"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "store_settings"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());

-- audit_logs
CREATE POLICY tenant_isolation_select ON "audit_logs"
  FOR SELECT TO authenticated
  USING ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_insert ON "audit_logs"
  FOR INSERT TO authenticated
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_update ON "audit_logs"
  FOR UPDATE TO authenticated
  USING ("store_id" = app.current_store_id())
  WITH CHECK ("store_id" = app.current_store_id());

CREATE POLICY tenant_isolation_delete ON "audit_logs"
  FOR DELETE TO authenticated
  USING ("store_id" = app.current_store_id());


-- ---------------------------------------------------------------------------
-- Inherited-ownership tables - RLS traverses the parent aggregate
-- (DATABASE.md section 29.4).
-- ---------------------------------------------------------------------------

-- cart_items (store resolved through carts)
CREATE POLICY tenant_isolation ON "cart_items"
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "carts" c
    WHERE c."id" = "cart_items"."cart_id"
      AND c."store_id" = app.current_store_id()
  ));

-- order_items (store resolved through orders)
CREATE POLICY tenant_isolation ON "order_items"
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "orders" o
    WHERE o."id" = "order_items"."order_id"
      AND o."store_id" = app.current_store_id()
  ));

-- payment_attempts (store resolved through payments)
CREATE POLICY tenant_isolation ON "payment_attempts"
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM "payments" p
    WHERE p."id" = "payment_attempts"."payment_id"
      AND p."store_id" = app.current_store_id()
  ));

-- ---------------------------------------------------------------------------
-- Public storefront read-only policies (DATABASE.md section 29.6).
-- The public `anon` role may only read the resolved Store's published /
-- ACTIVE data and can never write. The backend resolves the Store from the
-- public URL (slug/domain) and binds it via app.set_current_store_id().
-- ---------------------------------------------------------------------------

CREATE POLICY public_storefront_select ON "stores"
  FOR SELECT TO anon
  USING ("id" = app.current_store_id() AND "status" = 'ACTIVE');

CREATE POLICY public_storefront_select ON "products"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id() AND "status" = 'ACTIVE');

CREATE POLICY public_storefront_select ON "product_variants"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id() AND "status" = 'ACTIVE');

CREATE POLICY public_storefront_select ON "categories"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id() AND "status" = 'ACTIVE');

CREATE POLICY public_storefront_select ON "pages"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id() AND "status" = 'PUBLISHED');

CREATE POLICY public_storefront_select ON "page_sections"
  FOR SELECT TO anon
  USING (EXISTS (
    SELECT 1 FROM "pages" p
    WHERE p."id" = "page_sections"."page_id"
      AND p."store_id" = app.current_store_id()
      AND p."status" = 'PUBLISHED'
  ));

CREATE POLICY public_storefront_select ON "navigations"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());

CREATE POLICY public_storefront_select ON "theme_configurations"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());

CREATE POLICY public_storefront_select ON "media"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());

CREATE POLICY public_storefront_select ON "product_media"
  FOR SELECT TO anon
  USING ("store_id" = app.current_store_id());

