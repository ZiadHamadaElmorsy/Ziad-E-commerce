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
  sku: string | null;
  /** Integer minor units (EGP piastres). Divide by 100 for the display price. */
  price: number;
  /** Integer minor units (EGP piastres), or null. */
  compareAtPrice: number | null;
  status: VariantStatus;
}

export interface ProductView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: ProductStatus;
  variants: VariantView[];
}

export interface CategoryView {
  id: string;
  name: string;
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
  description?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  /** Pass `null` to clear the description. */
  description?: string | null;
}

export interface CreateProductInput {
  name: string;
  description?: string;
  status?: ProductStatus;
}

export interface UpdateProductInput {
  name?: string;
  /** Pass `null` to clear the description. */
  description?: string | null;
}

export interface CreateVariantInput {
  name: string;
  sku?: string;
  price: number;
  /** Pass `null` to create the variant without a compare-at price. */
  compareAtPrice?: number | null;
}

export interface UpdateVariantInput {
  name?: string;
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
}

// --- Orders --------------------------------------------------------------------

export type OrderStatus =
  'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';

/** Order acquisition/payment channel (Phase 22). */
export type OrderChannel = 'ONLINE_PAYMENT' | 'WHATSAPP';

export interface OrderSummaryView {
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
