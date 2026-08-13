import 'reflect-metadata';
import { AddCartItemDto } from '../dto/add-cart-item.dto';
import { UpdateCartItemDto } from '../dto/update-cart-item.dto';
import { CartService } from '../services/cart.service';
import { CartController, GUEST_TOKEN_HEADER } from './cart.controller';

describe('CartController', () => {
  let cartService: {
    getCart: jest.Mock;
    addItem: jest.Mock;
    updateItem: jest.Mock;
    removeItem: jest.Mock;
    clearCart: jest.Mock;
  };
  let controller: CartController;

  const cartView = {
    id: 'cart-1',
    status: 'ACTIVE',
    currency: 'EGP',
    guestToken: 'guest-token-1',
    expiresAt: null,
    items: [],
    createdAt: '2026-08-12T00:00:00.000Z',
    updatedAt: '2026-08-12T00:00:00.000Z',
  };

  beforeEach(() => {
    cartService = {
      getCart: jest.fn(),
      addItem: jest.fn(),
      updateItem: jest.fn(),
      removeItem: jest.fn(),
      clearCart: jest.fn(),
    };
    controller = new CartController(cartService as unknown as CartService);
  });

  it('GET /cart delegates the guest token to the service and wraps the result', async () => {
    cartService.getCart.mockResolvedValue(cartView);

    const result = await controller.getCart('guest-token-1');

    expect(cartService.getCart).toHaveBeenCalledWith('guest-token-1');
    expect(result).toEqual({ data: cartView });
  });

  it('POST /cart/items delegates token + body and wraps the result', async () => {
    cartService.addItem.mockResolvedValue(cartView);
    const dto = new AddCartItemDto();
    dto.variantId = 'variant-1';
    dto.quantity = 2;

    const result = await controller.addItem('guest-token-1', dto);

    expect(cartService.addItem).toHaveBeenCalledWith('guest-token-1', dto);
    expect(result).toEqual({ data: cartView });
  });

  it('PATCH /cart/items/:itemId delegates token + itemId + body', async () => {
    cartService.updateItem.mockResolvedValue(cartView);
    const dto = new UpdateCartItemDto();
    dto.quantity = 3;

    const result = await controller.updateItem('guest-token-1', 'item-1', dto);

    expect(cartService.updateItem).toHaveBeenCalledWith('guest-token-1', 'item-1', dto);
    expect(result).toEqual({ data: cartView });
  });

  it('DELETE /cart/items/:itemId delegates and returns void (204 mapped by @HttpCode)', async () => {
    cartService.removeItem.mockResolvedValue(undefined);

    const result = await controller.removeItem('guest-token-1', 'item-1');

    expect(cartService.removeItem).toHaveBeenCalledWith('guest-token-1', 'item-1');
    expect(result).toBeUndefined();
  });

  it('DELETE /cart/items delegates the token and returns void (clear cart)', async () => {
    cartService.clearCart.mockResolvedValue(undefined);

    const result = await controller.clearCart('guest-token-1');

    expect(cartService.clearCart).toHaveBeenCalledWith('guest-token-1');
    expect(result).toBeUndefined();
  });

  it('propagates service errors untouched', async () => {
    cartService.getCart.mockRejectedValue(new Error('boom'));

    await expect(controller.getCart('guest-token-1')).rejects.toThrow('boom');
  });

  it('exposes the documented guest-token header name', () => {
    expect(GUEST_TOKEN_HEADER).toBe('x-guest-token');
  });
});
