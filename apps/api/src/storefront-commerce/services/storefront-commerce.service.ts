import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderChannel, PaymentStatus, StoreStatus } from '@prisma/client';
import type { Request } from 'express';
import { CartService } from '../../cart/services/cart.service';
import { CheckoutService } from '../../checkout/services/checkout.service';
import { CheckoutView } from '../../checkout/checkout.types';
import { ConflictError, NotFoundError } from '../../common/errors/domain-exceptions';
import { ThemeService } from '../../cms/services/theme.service';
import { NavigationService } from '../../cms/services/navigation.service';
import { NavigationView, ThemeView } from '../../cms/cms.types';
import { StorageProvider } from '../../media/storage/storage-provider';
import { OrderRepository } from '../../orders/repositories/order.repository';
import { PaymentsService } from '../../payments/services/payments.service';
import { PaymentView } from '../../payments/payments.types';
import { isWhatsAppAvailable, WhatsAppSettings } from '../../store-settings/domain/whatsapp-config';
import { StoreSettingsService } from '../../store-settings/services/store-settings.service';
import { isPaymobConfigured } from '../../config/payment-config';
import type { PaymobConfig } from '../../config/configuration';
import { StorefrontRepository } from '../../storefront/repositories/storefront.repository';
import { StorefrontStoreResolver } from '../../storefront/services/storefront-store-resolver';
import { AddCartItemDto } from '../../cart/dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../../cart/dto/update-cart-item.dto';
import { CartView } from '../../cart/cart.types';
import { CheckoutRequestDto } from '../../checkout/dto/checkout-request.dto';
import { isValidOrderLookupToken } from '../../checkout/domain/order-lookup-token';
import { WhatsAppOrderRequestDto } from '../../whatsapp/dto/whatsapp-order-request.dto';
import { WhatsappService, WhatsAppOrderResult } from '../../whatsapp/services/whatsapp.service';
import { toStorefrontOrderView, StorefrontOrderView } from '../storefront-commerce.types';

/** Public payment availability for a storefront (Phase 22). */
export interface StorefrontPaymentMethods {
  /** Whether the deployment has Paymob configured (Intention flow). */
  payOnline: boolean;
  /** WhatsApp ordering availability + contact config (store-scoped). */
  whatsapp: { enabled: boolean; phoneNumber: string; label: string | null } | null;
}

/**
 * Public storefront commerce service (Phase 19).
 *
 * Bridges the PUBLIC storefront surface to the existing commerce modules
 * (docs/API-SPEC.md §36 "Public": cart operations where guest sessions are
 * supported, checkout initiation, payment redirect/result endpoints). Business
 * rules are NOT duplicated here — every operation delegates to the existing
 * CartService / CheckoutService / PaymentsService / OrderRepository /
 * ThemeService / NavigationService and the same StorageProvider used by the
 * Media module.
 *
 * Tenant isolation:
 * - The Store is ALWAYS resolved server-side by StorefrontStoreResolver
 *   (X-Storefront-Slug header / Host subdomain) — never from client input.
 * - Every underlying call receives that resolved store id, so cross-tenant
 *   carts/orders/payments/media fail closed with NOT_FOUND (no existence leak).
 * - A client-supplied store id is never accepted anywhere in this surface.
 */
@Injectable()
export class StorefrontCommerceService {
  constructor(
    private readonly storeResolver: StorefrontStoreResolver,
    private readonly storefrontRepository: StorefrontRepository,
    private readonly carts: CartService,
    private readonly checkoutService: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly orders: OrderRepository,
    private readonly themes: ThemeService,
    private readonly navigations: NavigationService,
    private readonly storage: StorageProvider,
    private readonly settings: StoreSettingsService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {}

  // --- Cart -------------------------------------------------------------------

  async getCart(request: Pick<Request, 'headers'>, guestToken?: string): Promise<CartView> {
    const store = await this.storeResolver.resolve(request);
    return this.carts.getCart(guestToken, store.id);
  }

  async addCartItem(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    dto: AddCartItemDto,
  ): Promise<CartView> {
    const store = await this.storeResolver.resolve(request);
    return this.carts.addItem(guestToken, dto, store.id);
  }

  async updateCartItem(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartView> {
    const store = await this.storeResolver.resolve(request);
    return this.carts.updateItem(guestToken, itemId, dto, store.id);
  }

  async removeCartItem(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    itemId: string,
  ): Promise<void> {
    const store = await this.storeResolver.resolve(request);
    return this.carts.removeItem(guestToken, itemId, store.id);
  }

  async clearCart(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
  ): Promise<void> {
    const store = await this.storeResolver.resolve(request);
    return this.carts.clearCart(guestToken, store.id);
  }

  // --- Checkout / Payment -------------------------------------------------------

  /**
   * POST /storefront/checkout — Phase 22: the public checkout fails closed when
   * NO payment method is available (Paymob unconfigured AND WhatsApp disabled).
   * This prevents creating an order that can never be paid, and keeps the
   * customer-facing "neither available" state an explicit merchant
   * configuration error instead of an unsafe order.
   */
  async checkout(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    dto: CheckoutRequestDto,
    idempotencyKey: string | undefined,
  ): Promise<CheckoutView> {
    await this.assertPaymentMethodAvailable(request);
    return this.checkoutInternal(request, guestToken, dto, idempotencyKey, OrderChannel.ONLINE_PAYMENT);
  }

  /** Shared checkout execution (online payment or WhatsApp channel). */
  private async checkoutInternal(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    dto: CheckoutRequestDto,
    idempotencyKey: string | undefined,
    channel: OrderChannel,
  ): Promise<CheckoutView> {
    const store = await this.storeResolver.resolve(request);
    return this.checkoutService.createCheckout(
      dto,
      guestToken,
      idempotencyKey,
      store.id,
      StoreStatus.ACTIVE,
      channel,
    );
  }

  /**
   * POST /storefront/orders/whatsapp — creates (or reuses) a real WhatsApp
   * order through the existing checkout pipeline and returns the wa.me URL.
   * Idempotent: the same idempotency key returns the same order, and an
   * existing orderId from this checkout session is reused, never duplicated.
   */
  async whatsappOrder(
    request: Pick<Request, 'headers'>,
    guestToken: string | undefined,
    dto: WhatsAppOrderRequestDto,
    idempotencyKey: string | undefined,
  ): Promise<WhatsAppOrderResult> {
    return this.whatsapp.createWhatsAppOrder({ request, guestToken, dto, idempotencyKey });
  }

  async createPayment(
    request: Pick<Request, 'headers'>,
    orderId: string,
    idempotencyKey: string | undefined,
    returnUrl?: string,
  ): Promise<PaymentView> {
    const store = await this.storeResolver.resolve(request);
    return this.payments.createPayment(orderId, idempotencyKey, store.id, { returnUrl });
  }

  async getPayment(request: Pick<Request, 'headers'>, orderId: string): Promise<PaymentView> {
    const store = await this.storeResolver.resolve(request);
    return this.payments.getPayment(orderId, store.id);
  }

  /**
   * Public payment-methods + WhatsApp contact config for the storefront. The
   * WhatsApp phone number is the merchant's public business contact (needed to
   * build the contact CTA); it is store-scoped and resolved server-side.
   */
  async getPaymentMethods(request: Pick<Request, 'headers'>): Promise<StorefrontPaymentMethods> {
    const store = await this.storeResolver.resolve(request);
    const whatsapp = await this.settings.readWhatsAppSettings(store.id);
    return {
      payOnline: this.isPaymobConfigured(),
      whatsapp: this.toPublicWhatsApp(whatsapp),
    };
  }

  /**
   * GET /storefront/orders/:orderId — public order confirmation view (Phase 23
   * security hardening). The order is always resolved store-scoped; a
   * cross-tenant order id fails closed with NOT_FOUND. Customer PII
   * (email/phone/address) is ONLY included when the caller presents the
   * matching lookup token (`?token=...` from the checkout response); without
   * it a PII-free view is returned so the confirmation page still renders
   * without leaking sensitive data to anyone who merely obtained the URL.
   */
  async getOrder(
    request: Pick<Request, 'headers'>,
    orderId: string,
    lookupToken?: string,
  ): Promise<StorefrontOrderView> {
    const store = await this.storeResolver.resolve(request);

    const order = await this.orders.findWithDetails(store.id, orderId);
    if (!order) {
      throw new NotFoundError('The order was not found.');
    }

    let payment: { status: PaymentStatus; failureMessage: string | null } | null = null;
    try {
      const view = await this.payments.getPayment(orderId, store.id);
      payment = { status: view.status, failureMessage: view.failureMessage };
    } catch {
      // No payment yet — the confirmation page renders the order without one.
    }

    const authorized =
      lookupToken !== undefined && isValidOrderLookupToken(lookupToken, order.lookupToken);
    return toStorefrontOrderView(order, payment, authorized);
  }

  // --- CMS / Theme ---------------------------------------------------------------

  async getTheme(request: Pick<Request, 'headers'>): Promise<ThemeView> {
    const store = await this.storeResolver.resolve(request);
    return this.themes.getTheme(store.id);
  }

  async getNavigation(request: Pick<Request, 'headers'>): Promise<NavigationView> {
    const store = await this.storeResolver.resolve(request);
    return this.navigations.getNavigation(store.id);
  }

  // --- Media ---------------------------------------------------------------------

  /**
   * GET /storefront/media/:mediaId/content — streams a store media binary to
   * the storefront. The media row is resolved STORE-SCOPED first; only media
   * belonging to the resolved store can ever be retrieved (a cross-tenant
   * media id fails closed with NOT_FOUND — docs/API-SPEC.md §34).
   */
  async getMediaContent(
    request: Pick<Request, 'headers'>,
    mediaId: string,
  ): Promise<{ buffer: Buffer; mimeType: string | null }> {
    const store = await this.storeResolver.resolve(request);

    const media = await this.storefrontRepository.findMediaInStore(store.id, mediaId);
    if (!media) {
      throw new NotFoundError('The media asset was not found.');
    }

    const buffer = await this.storage.downloadObject(media.storagePath);
    return { buffer, mimeType: media.mimeType };
  }

  // --- Payment availability (Phase 22) ------------------------------------------

  /**
   * Fail-closed payment availability gate for the public checkout. Checkout is
   * only allowed when Paymob is configured OR the merchant enabled WhatsApp.
   * When neither exists, a clear merchant configuration error is returned and
   * no order is created.
   */
  private async assertPaymentMethodAvailable(request: Pick<Request, 'headers'>): Promise<void> {
    const store = await this.storeResolver.resolve(request);
    const whatsapp = await this.settings.readWhatsAppSettings(store.id);
    if (!this.isPaymobConfigured() && !isWhatsAppAvailable(whatsapp)) {
      throw new ConflictError(
        'No payment method is available for this store right now. Please try again later.',
      );
    }
  }

  /** Whether the deployment has the Paymob Intention-flow credentials. */
  private isPaymobConfigured(): boolean {
    return isPaymobConfigured(this.config.get<PaymobConfig>('paymob'));
  }

  /** Public WhatsApp contact config (null when disabled). */
  private toPublicWhatsApp(whatsapp: WhatsAppSettings): {
    enabled: boolean;
    phoneNumber: string;
    label: string | null;
  } | null {
    if (!isWhatsAppAvailable(whatsapp)) {
      return null;
    }
    return {
      enabled: true,
      phoneNumber: whatsapp.phoneNumber,
      label: whatsapp.label,
    };
  }
}

