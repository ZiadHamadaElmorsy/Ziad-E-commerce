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
} from '@nestjs/common';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartService } from '../services/cart.service';

/** Header carrying the opaque guest cart token (docs/DOMAIN-MODEL.md §10.1). */
export const GUEST_TOKEN_HEADER = 'x-guest-token';

/**
 * Cart API (docs/API-SPEC.md §21) — the exact documented endpoints:
 *
 *   GET    /api/v1/cart              Get Cart (resolved from the guest/session context)
 *   POST   /api/v1/cart/items        Add Cart Item
 *   PATCH  /api/v1/cart/items/:itemId  Update Cart Item
 *   DELETE /api/v1/cart/items/:itemId  Remove Cart Item
 *   DELETE /api/v1/cart/items        Clear Cart
 *
 * Thin controller: all business logic lives in CartService. Every route is
 * authenticated + tenant-scoped through the global guard chain; the trusted
 * store comes from the resolved tenant context, never from client input. The
 * X-Guest-Token header only selects a cart INSIDE the trusted store.
 */
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@Headers(GUEST_TOKEN_HEADER) guestToken?: string) {
    const cart = await this.cartService.getCart(guestToken);
    return { data: cart };
  }

  @Post('items')
  @HttpCode(HttpStatus.CREATED)
  async addItem(
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    const cart = await this.cartService.addItem(guestToken, dto);
    return { data: cart };
  }

  @Patch('items/:itemId')
  async updateItem(
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const cart = await this.cartService.updateItem(guestToken, itemId, dto);
    return { data: cart };
  }

  @Delete('items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    await this.cartService.removeItem(guestToken, itemId);
  }

  @Delete('items')
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearCart(@Headers(GUEST_TOKEN_HEADER) guestToken: string | undefined): Promise<void> {
    await this.cartService.clearCart(guestToken);
  }
}
