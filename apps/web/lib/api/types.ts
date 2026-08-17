/**
 * TypeScript mirror of the backend API response contracts (docs/API-SPEC.md).
 *
 * These types match the `data` / `meta` envelope returned by the NestJS API:
 * every successful response is `{ data: T }` (collections add `meta`), and
 * every error is `{ error: { code, message, details } }`.
 */

// --- Identity / tenant (GET /auth/me) --------------------------------------

export type MembershipRole = 'OWNER' | 'ADMIN' | 'STAFF';
export type StoreStatus = 'ACTIVE' | 'DISABLED' | 'SUSPENDED';

export interface MeUser {
  authUserId: string;
  email: string;
}

export interface MeStore {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
}

export interface MeMembership {
  id: string;
  storeId: string;
  role: MembershipRole;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface MeResponse {
  requestId: string;
  user: MeUser | null;
  store: MeStore | null;
  membership: MeMembership | null;
}

// --- Merchant onboarding (Phase 17) ------------------------------------------

export interface OnboardingUser {
  id: string;
  authUserId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface OnboardingMembership {
  id: string;
  storeId: string;
  role: MembershipRole;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface OnboardingStatus {
  user: OnboardingUser | null;
  store: StoreViewFull | null;
  membership: OnboardingMembership | null;
}

export interface CreateMerchantResult {
  store: StoreViewFull;
  membership: OnboardingMembership;
}

export interface CreateMerchantInput {
  firstName: string;
  lastName: string;
  storeName: string;
  slug?: string;
  currency?: string;
}

export interface StoreViewFull {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: StoreStatus;
  currency: string;
  timezone: string;
}

// --- Theme (docs/API-SPEC.md §28) ---------------------------------------------

export interface ThemeView {
  id: string;
  logoMediaId: string | null;
  config: Record<string, unknown>;
}

export interface UpdateThemeInput {
  primaryColor?: string;
  fontFamily?: string;
  logoMediaId?: string;
}

// --- Catalog -----------------------------------------------------------------

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type VariantStatus = 'ACTIVE' | 'ARCHIVED';
export type CategoryStatus = 'ACTIVE' | 'ARCHIVED';

export interface VariantView {
  id: string;
  productId: string;
  name: string;
  /** Structured variant attributes (e.g. { color: 'Black', size: 'M' }). */
  attributes: Record<string, string> | null;
  sku: string | null;
  /** Integer minor units (EGP piastres). Divide by 100 for the display price. */
  price: number;
  /** Integer minor units (EGP piastres), or null. */
  compareAtPrice: number | null;
  status: VariantStatus;
}

/** A product image reference (media id + alt text; media resolvable via /media/:id). */
export interface ProductImage {
  id: string;
  altText: string | null;
}

/** A ProductMedia gallery row (association + minimal media metadata). */
export interface ProductMediaView {
  id: string;
  mediaId: string;
  variantId: string | null;
  altText: string | null;
  sortOrder: number;
  isPrimary: boolean;
  mediaType: MediaType;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface ProductView {
  id: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  slug: string;
  description: string | null;
  status: ProductStatus;
  variants: VariantView[];
  /** Product images ordered by sort_order (empty when none are attached yet). */
  images: ProductImage[];
}

export interface CategoryView {
  id: string;
  name: string;
  nameAr: string | null;
  nameEn: string | null;
  slug: string;
  description: string | null;
  status: CategoryStatus;
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

// --- Request bodies -----------------------------------------------------------

export interface CreateCategoryInput {
  name: string;
  nameAr?: string;
  nameEn?: string;
  description?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  nameAr?: string | null;
  nameEn?: string | null;
  /** Pass `null` to clear the description. */
  description?: string | null;
}

export interface CreateProductInput {
  name: string;
  nameAr?: string;
  nameEn?: string;
  description?: string;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  name?: string;
  nameAr?: string | null;
  nameEn?: string | null;
  /** Pass `null` to clear the description. */
  description?: string | null;
}

export interface CreateVariantInput {
  name: string;
  /** Structured variant attributes (e.g. { color: 'Black', size: 'M' }). */
  attributes?: Record<string, string>;
  sku?: string;
  price: number;
  /** Pass `null` to create the variant without a compare-at price. */
  compareAtPrice?: number | null;
}

export interface UpdateVariantInput {
  name?: string;
  attributes?: Record<string, string>;
  sku?: string;
  price?: number;
  /** Pass `null` to clear the compare-at price. */
  compareAtPrice?: number | null;
}

export interface ProductLinkInput {
  productId: string;
  categoryId: string;
}

export interface ListProductsParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  sort?: 'createdAt' | 'name';
  order?: 'asc' | 'desc';
}

export interface ListCategoriesParams {
  page?: number;
  limit?: number;
  search?: string;
}

// --- Product gallery (Phase 26) ----------------------------------------------

export interface AttachProductMediaInput {
  variantId?: string;
  isPrimary?: boolean;
  altText?: string;
}

export interface UpdateProductMediaInput {
  sortOrder?: number;
  isPrimary?: boolean;
  variantId?: string | null;
  altText?: string | null;
}

export interface ListProductMediaParams {
  page?: number;
  limit?: number;
  variantId?: string;
}

// --- Orders --------------------------------------------------------------------

export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED';

/** Order acquisition/payment channel (Phase 22). */
export type OrderChannel = 'ONLINE_PAYMENT' | 'WHATSAPP';

/** How the order's payment is settled (Phase 27). */
export type OrderPaymentMethod = 'ONLINE' | 'COD';

/** Order-level payment status (Phase 27). */
export type OrderPaymentStatus = 'PAID' | 'UNPAID' | 'FAILED' | 'REFUNDED';

export interface OrderSummaryView {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  /** How the order's payment is settled (ONLINE | COD) — Phase 27. */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (PAID/UNPAID/FAILED/REFUNDED) — Phase 27. */
  paymentStatus: OrderPaymentStatus;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
}

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

export type ReservationStatus = 'ACTIVE' | 'RELEASED' | 'CONSUMED';

export interface OrderReservationView {
  id: string;
  variantId: string;
  quantity: number;
  status: ReservationStatus;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  /** How the order's payment is settled (ONLINE | COD) — Phase 27. */
  paymentMethod: OrderPaymentMethod;
  /** Order-level payment status (PAID/UNPAID/FAILED/REFUNDED) — Phase 27. */
  paymentStatus: OrderPaymentStatus;
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
}

export interface ListOrdersParams {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

// --- Customers ------------------------------------------------------------------

export interface CustomerView {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string;
  lastName: string;
}

export interface CustomerOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  createdAt: string;
}

export interface ListCustomersParams {
  page?: number;
  limit?: number;
  search?: string;
}

// --- Media ----------------------------------------------------------------------

export type MediaType = 'IMAGE' | 'VIDEO' | 'FILE';

export interface MediaView {
  id: string;
  mediaType: MediaType;
  mimeType: string | null;
  sizeBytes: number | null;
  altText: string | null;
  storagePath: string;
  createdAt: string;
}

export interface ListMediaParams {
  page?: number;
  limit?: number;
}

// --- Inventory ------------------------------------------------------------------

export interface InventoryView {
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
}

export type MovementType =
  'INITIAL_STOCK' | 'ADJUSTMENT' | 'SALE' | 'RESERVATION' | 'CONSUMPTION' | 'RELEASE';

export interface MovementView {
  id: string;
  variantId: string;
  movementType: MovementType;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  reason: string | null;
  onHandAfter: number;
  reservedAfter: number;
  createdAt: string;
}

// --- Dashboard (Phase 25 — GET /api/v1/dashboard/stats) ---------------------------

export interface DashboardProductCounts {
  total: number;
  active: number;
  drafts: number;
  archived: number;
}

export interface DashboardRecentProduct {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  /** Price (minor units) of the first ACTIVE variant, or null when none is active. */
  price: number | null;
  variantsCount: number;
}

// --- Shipping (Phase 27 — merchant shipment management) ----------------------

export type ShipmentStatus =
  | 'CREATED'
  | 'HANDED_TO_COURIER'
  | 'AT_DELIVERY_CENTER'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'REJECTED'
  | 'DELIVERY_FAILED'
  | 'RETURNED'
  | 'CANCELLED';

export interface ShipmentHistoryView {
  id: string;
  previousStatus: ShipmentStatus | null;
  newStatus: ShipmentStatus;
  providerStatus: string | null;
  source: string;
  createdAt: string;
}

/** Merchant shipment view (Part 10 — dashboard order details). */
export interface ShipmentView {
  id: string;
  orderId: string;
  /** The shipping provider the merchant can see (Bosta). */
  provider: 'BOSTA';
  trackingNumber: string | null;
  status: ShipmentStatus;
  codAmount: number;
  shippingCost: number;
  createdAt: string;
  updatedAt: string;
  deliveredAt: string | null;
  /** Merchant-facing operational error message (sanitized). */
  errorMessage: string | null;
  /** Merchant-facing shipping label URL. */
  printedLabelUrl: string | null;
  statusHistory: ShipmentHistoryView[];
}

export interface DashboardOrderSummary {
  id: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OrderStatus;
  currency: string;
  grandTotal: number;
  customerEmail: string | null;
  customerPhone: string | null;
  createdAt: string;
}

export interface DashboardStatsView {
  products: DashboardProductCounts;
  categories: number;
  orders: {
    total: number;
    recent: DashboardOrderSummary[];
  };
  /** Sum of grand_total across ALL orders (null when there are no orders). */
  revenue: number | null;
  recentProducts: DashboardRecentProduct[];
}

// --- Subscription ---------------------------------------------------------------

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'EXPIRED';

export interface SubscriptionView {
  id: string;
  status: SubscriptionStatus;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  activatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Payments -------------------------------------------------------------------

export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED';

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
