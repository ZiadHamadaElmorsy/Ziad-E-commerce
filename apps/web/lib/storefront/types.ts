/**
 * Storefront API response types (Phase 19).
 *
 * These mirror the PUBLIC storefront read API (docs/API-SPEC.md §31-§32) and
 * the new public storefront commerce endpoints (guest cart / checkout /
 * payment / order / theme / navigation / media). Money is integer minor units
 * (EGP piastres) — divide by 100 for display.
 */

export interface StorefrontStore {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currency: string;
  timezone: string;
  /** Public payment availability (Phase 22). */
  payments: StorefrontPaymentMethods;
}

export interface StorefrontPaymentMethods {
  /** Whether Paymob online card payment is configured for this deployment. */
  payOnline: boolean;
  /** WhatsApp ordering + contact config, null when disabled/invalid. */
  whatsapp: { enabled: boolean; phoneNumber: string; label: string | null } | null;
}

/** Builds a wa.me contact deep link (no order is created). */
export function whatsappContactUrl(phoneNumber: string, message: string): string {
  return `https://wa.me/${phoneNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}

export interface StorefrontImage {
  id: string;
  altText: string | null;
}

export interface StorefrontVariant {
  id: string;
  name: string;
  price: number;
  available: boolean;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  images: StorefrontImage[];
  variants: StorefrontVariant[];
}

export interface StorefrontCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export interface StorefrontCategoryDetail extends StorefrontCategory {
  products: StorefrontProduct[];
  meta: PaginationMeta;
}

export interface StorefrontSection {
  id: string;
  sectionType: string;
  content: unknown;
  sortOrder: number;
}

export interface StorefrontPage {
  id: string;
  title: string;
  slug: string;
  seoTitle: string | null;
  seoDescription: string | null;
  sections: StorefrontSection[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface Envelope<T> {
  data: T;
}

export interface StorefrontTheme {
  id: string;
  logoMediaId: string | null;
  config: Record<string, unknown>;
}

export interface StorefrontNavigationItem {
  label: string;
  type: string;
  value: string;
}

export interface StorefrontNavigation {
  id: string;
  name: string;
  items: StorefrontNavigationItem[];
}

// --- Cart / Checkout / Payment / Order ---------------------------------------

export type CartStatus = 'ACTIVE' | 'EXPIRED' | 'COMPLETED';

export interface CartItemView {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  sku: string | null;
  variantStatus: 'ACTIVE' | 'ARCHIVED';
  quantity: number;
  unitPrice: number;
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

export interface CheckoutCustomerInput {
  name: string;
  phone: string;
  email?: string;
}

export interface CheckoutShippingAddressInput {
  governorate: string;
  city: string;
  addressLine: string;
  building?: string;
  apartment?: string;
}

export interface CheckoutInput {
  customer: CheckoutCustomerInput;
  shippingAddress: CheckoutShippingAddressInput;
}

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'CANCELLED';

/** Order acquisition/payment channel (Phase 22). */
export type OrderChannel = 'ONLINE_PAYMENT' | 'WHATSAPP';

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  productName: string;
  variantName: string;
  sku: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderReservationView {
  id: string;
  variantId: string;
  quantity: number;
  status: string;
}

export interface CheckoutResult {
  orderId: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  /**
   * Phase 23 — per-order secure lookup token. Returned ONLY to the customer
   * that placed the order; required to read the order's customer details on
   * the public confirmation page. Stored in sessionStorage (never in the URL).
   */
  lookupToken: string | null;
  items: OrderItemView[];
  reservations: OrderReservationView[];
  createdAt: string;
}

export interface PaymentAttemptView {
  id: string;
  status: PaymentStatus;
  providerReference: string | null;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  initiatedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentView {
  id: string;
  orderId: string;
  status: PaymentStatus;
  provider: string;
  providerReference: string | null;
  amount: number;
  currency: string;
  failureCode: string | null;
  failureMessage: string | null;
  createdAt: string;
  updatedAt: string;
  attempts: PaymentAttemptView[];
  providerCheckoutUrl: string | null;
}

export interface StorefrontOrderView {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  currency: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  customerId: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  shippingAddress: Record<string, unknown>;
  billingAddress: Record<string, unknown> | null;
  items: OrderItemView[];
  reservations: OrderReservationView[];
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  paymentStatus: PaymentStatus | null;
  paymentFailureMessage: string | null;
}

/** POST /storefront/orders/whatsapp response (Phase 22). */
export interface WhatsAppOrderResult {
  order: CheckoutResult;
  whatsappUrl: string;
}
