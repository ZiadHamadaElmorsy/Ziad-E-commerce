import {
  Cart,
  CartItem,
  CartStatus,
  ProductStatus,
  ProductVariant,
  VariantStatus,
} from '@prisma/client';

/**
 * Public Cart representations returned by the Cart API (docs/API-SPEC.md §21).
 *
 * - Cart pricing is NOT authoritative (docs/DOMAIN-MODEL.md §10.1): the price
 *   fields below are the CURRENT variant prices loaded fresh from the catalog
 *   for display only. Checkout revalidates product/variant availability, price,
 *   inventory, quantity and totals server-side.
 * - The `cart_items` table has NO price column (docs/DATABASE.md §7.15) — no
 *   price snapshot is ever stored by the Cart phase.
 * - Internal columns (store_id, completed_at) are not exposed. `guestToken` IS
 *   exposed so a freshly created cart can be persisted by the storefront.
 * - Money is integer minor units (EGP piastres); the stored BIGINT is converted
 *   to a plain JSON-safe number by the mappers.
 */

/** A CartItem with its current variant and product (for the display view). */
export type CartItemWithVariant = CartItem & {
  variant: ProductVariant & { product: { id: string; status: ProductStatus } };
};

export interface CartItemView {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  /** Current variant lifecycle status (display only; purchasability is rechecked). */
  variantStatus: VariantStatus;
  quantity: number;
  /** Current variant price in minor units — NOT authoritative (checkout revalidates). */
  unitPrice: number;
  /** Current variant compare-at price in minor units, or null. */
  compareAtPrice: number | null;
}

export interface CartView {
  id: string;
  status: CartStatus;
  currency: string;
  guestToken: string;
  expiresAt: string | null;
  items: CartItemView[];
  createdAt: string;
  updatedAt: string;
}

export function toCartItemView(item: CartItemWithVariant): CartItemView {
  return {
    id: item.id,
    variantId: item.variantId,
    productId: item.variant.productId,
    name: item.variant.name,
    sku: item.variant.sku,
    variantStatus: item.variant.status,
    quantity: item.quantity,
    unitPrice: Number(item.variant.price),
    compareAtPrice:
      item.variant.compareAtPrice === null ? null : Number(item.variant.compareAtPrice),
  };
}

export function toCartView(cart: Cart, items: CartItemWithVariant[]): CartView {
  return {
    id: cart.id,
    status: cart.status,
    currency: cart.currency,
    // This phase only reads guest carts (DB CHECK enforces customer_id OR
    // guest_token); a customer cart would flow through the future customer
    // authentication path and is out of scope here.
    guestToken: cart.guestToken as string,
    expiresAt: cart.expiresAt === null ? null : cart.expiresAt.toISOString(),
    items: items.map(toCartItemView),
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
}
