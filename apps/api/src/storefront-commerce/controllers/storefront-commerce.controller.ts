import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { GUEST_TOKEN_HEADER } from '../../cart/controllers/cart.controller';
import { AddCartItemDto } from '../../cart/dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../../cart/dto/update-cart-item.dto';
import { IDEMPOTENCY_KEY_HEADER } from '../../checkout/controllers/checkout.controller';
import { CheckoutRequestDto } from '../../checkout/dto/checkout-request.dto';
import { Public } from '../../common/decorators/public.decorator';
import { WhatsAppOrderRequestDto } from '../../whatsapp/dto/whatsapp-order-request.dto';
import { StorefrontCommerceService } from '../services/storefront-commerce.service';

/**
 * Public storefront commerce API (Phase 19/22) — the guest-customer surface
 * bridging the PUBLIC storefront to the existing commerce modules:
 *
 *   GET    /api/v1/storefront/cart
 *   POST   /api/v1/storefront/cart/items
 *   PATCH  /api/v1/storefront/cart/items/:itemId
 *   DELETE /api/v1/storefront/cart/items/:itemId
 *   DELETE /api/v1/storefront/cart/items
 *   POST   /api/v1/storefront/checkout
 *   POST   /api/v1/storefront/orders/whatsapp        (Phase 22 — WhatsApp fallback)
 *   POST   /api/v1/storefront/orders/:orderId/payments
 *   GET    /api/v1/storefront/orders/:orderId/payment
 *   GET    /api/v1/storefront/orders/:orderId
 *   GET    /api/v1/storefront/theme
 *   GET    /api/v1/storefront/navigation
 *   GET    /api/v1/storefront/media/:mediaId/content
 *
 * All routes are @Public() (no merchant session required — API-SPEC §36
 * "Public": cart operations where guest sessions are supported, checkout
 * initiation, payment redirect/result). The Store is resolved server-side by
 * the existing StorefrontStoreResolver (X-Storefront-Slug header + Host
 * subdomain) inside StorefrontCommerceService; a client-supplied store id is
 * never accepted. X-Guest-Token only selects a cart INSIDE the resolved
 * store, and Idempotency-Key makes checkout/payment initiation safe to retry.
 */
@Controller('storefront')
export class StorefrontCommerceController {
  constructor(private readonly commerce: StorefrontCommerceService) {}

  @Public()
  @Get('cart')
  async getCart(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken?: string,
  ) {
    const cart = await this.commerce.getCart(request, this.normalize(guestToken));
    return { data: cart };
  }

  @Public()
  @Post('cart/items')
  @HttpCode(HttpStatus.CREATED)
  async addCartItem(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    const cart = await this.commerce.addCartItem(request, this.normalize(guestToken), dto);
    return { data: cart };
  }

  @Public()
  @Patch('cart/items/:itemId')
  async updateCartItem(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const cart = await this.commerce.updateCartItem(
      request,
      this.normalize(guestToken),
      itemId,
      dto,
    );
    return { data: cart };
  }

  @Public()
  @Delete('cart/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCartItem(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    await this.commerce.removeCartItem(request, this.normalize(guestToken), itemId);
  }

  @Public()
  @Delete('cart/items')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
  ): Promise<void> {
    await this.commerce.clearCart(request, this.normalize(guestToken));
  }

  @Public()
  @Post('checkout')
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() dto: CheckoutRequestDto,
  ) {
    const result = await this.commerce.checkout(
      request,
      this.normalize(guestToken),
      dto,
      this.normalize(idempotencyKey),
    );
    return { data: result };
  }

  @Public()
  @Post('orders/:orderId/payments')
  @HttpCode(HttpStatus.CREATED)
  async createPayment(
    @Req() request: Request,
    @Param('orderId') orderId: string,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
  ) {
    const payment = await this.commerce.createPayment(
      request,
      orderId,
      this.normalize(idempotencyKey),
      this.buildReturnUrl(request, orderId),
    );
    return { data: payment };
  }

  /**
   * POST /storefront/orders/whatsapp — "Order via WhatsApp" fallback (Phase 22).
   * Creates (or reuses) a REAL order through the existing checkout pipeline and
   * returns the wa.me deep link. Idempotent (Idempotency-Key) and store-scoped.
   */
  @Public()
  @Post('orders/whatsapp')
  @HttpCode(HttpStatus.CREATED)
  async orderViaWhatsApp(
    @Req() request: Request,
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Headers(IDEMPOTENCY_KEY_HEADER) idempotencyKey: string | undefined,
    @Body() dto: WhatsAppOrderRequestDto,
  ) {
    const result = await this.commerce.whatsappOrder(
      request,
      this.normalize(guestToken),
      dto,
      this.normalize(idempotencyKey),
    );
    return { data: result };
  }

  @Public()
  @Get('orders/:orderId/payment')
  async getPayment(@Req() request: Request, @Param('orderId') orderId: string) {
    const payment = await this.commerce.getPayment(request, orderId);
    return { data: payment };
  }

  /**
   * GET /storefront/orders/:orderId/tracking (Phase 27 — Part 13).
   * Customer-friendly delivery tracking: ONE aggregated payload (order number,
   * payment method/amount, customer-safe tracking number, timeline). Never
   * exposes the shipping provider, provider ids, raw statuses or internal ids.
   */
  @Public()
  @Get('orders/:orderId/tracking')
  async getOrderTracking(@Req() request: Request, @Param('orderId') orderId: string) {
    const tracking = await this.commerce.getOrderTracking(request, orderId);
    return { data: tracking };
  }

  @Public()
  @Get('orders/:orderId')
  async getOrder(
    @Req() request: Request,
    @Param('orderId') orderId: string,
    @Query('token') lookupToken?: string,
  ) {
    const order = await this.commerce.getOrder(request, orderId, this.normalize(lookupToken));
    return { data: order };
  }

  @Public()
  @Get('theme')
  async getTheme(@Req() request: Request) {
    const theme = await this.commerce.getTheme(request);
    return { data: theme };
  }

  @Public()
  @Get('navigation')
  async getNavigation(@Req() request: Request) {
    const navigation = await this.commerce.getNavigation(request);
    return { data: navigation };
  }

  @Public()
  @Get('media/:mediaId/content')
  async getMediaContent(
    @Req() request: Request,
    @Param('mediaId') mediaId: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.commerce.getMediaContent(request, mediaId);
    if (mimeType) {
      response.type(mimeType);
    }
    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.send(buffer);
  }

  private normalize(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Builds the customer-facing Paymob redirect_url from the storefront origin
   * (the web app, not the API). In development this is
   * `http://localhost:3000/store/{slug}/orders/{orderId}`; in a future
   * wildcard-subdomain deployment the origin is `https://{slug}.yourdomain.com`.
   * Optional — the webhook remains the authoritative confirmation.
   */
  private buildReturnUrl(request: Request, orderId: string): string | undefined {
    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin.trim().length === 0) {
      return undefined;
    }
    const slugHeader = request.headers['x-storefront-slug'];
    const slug = typeof slugHeader === 'string' ? slugHeader.trim() : '';
    if (!slug) {
      return undefined;
    }
    return `${origin.replace(/\/+$/, '')}/store/${encodeURIComponent(slug)}/orders/${encodeURIComponent(
      orderId,
    )}`;
  }
}
