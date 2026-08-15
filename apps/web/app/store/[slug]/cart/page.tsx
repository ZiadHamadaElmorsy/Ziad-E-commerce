'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeCheckoutPath, storeProductsPath } from '@/lib/storefront/paths';
import { Price } from '@/components/storefront/Price';
import { StorefrontEmpty } from '@/components/storefront/StorefrontStates';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Customer cart page (Phase 19). The cart is the REAL guest cart managed by
 * the backend (X-Guest-Token); quantity updates, removal, clearing and totals
 * all go through the existing Cart API. Pricing shown here is display-only —
 * checkout revalidates everything server-side.
 */
export default function StoreCartPage() {
  const { slug, cart, cartSubtotal, updateCartItem, removeCartItem, clearCart } = useStorefront();
  const { t } = useI18n();
  const toast = useToast();

  const items = cart?.items ?? [];

  const handleQuantityChange = async (itemId: string, quantity: number) => {
    try {
      await updateCartItem(itemId, Math.max(1, quantity));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'storefront.cartUpdateFailed'));
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      await removeCartItem(itemId);
      toast.success(t('storefront.itemRemoved'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'storefront.cartUpdateFailed'));
    }
  };

  const handleClear = async () => {
    try {
      await clearCart();
      toast.success(t('storefront.cartCleared'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'storefront.cartUpdateFailed'));
    }
  };

  return (
    <div className="sf-page">
      <div className="sf-section-head">
        <h1>{t('storefront.cart')}</h1>
        {items.length > 0 ? (
          <button type="button" className="sf-btn sf-btn--ghost" onClick={() => void handleClear()}>
            {t('storefront.clearCart')}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <StorefrontEmpty
          icon="🛒"
          title={t('storefront.cartEmpty')}
          description={t('storefront.cartEmptyDesc')}
          action={
            <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--primary">
              {t('storefront.continueShopping')}
            </Link>
          }
        />
      ) : (
        <div className="sf-cart-layout">
          <div className="sf-cart-items">
            {items.map((item) => (
              <div key={item.id} className="sf-cart-item" data-testid="cart-item">
                <div className="sf-cart-item__main">
                  <span className="sf-cart-item__name">{item.name}</span>
                  <span className="sf-muted sf-text-sm">
                    {t('storefront.unitPrice')}: <Price value={item.unitPrice} />
                  </span>
                </div>
                <div className="sf-cart-item__qty">
                  <button
                    type="button"
                    aria-label={t('storefront.decreaseQuantity')}
                    onClick={() => void handleQuantityChange(item.id, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                  >
                    −
                  </button>
                  <span data-testid="cart-item-qty">{item.quantity}</span>
                  <button
                    type="button"
                    aria-label={t('storefront.increaseQuantity')}
                    onClick={() => void handleQuantityChange(item.id, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
                <span className="sf-cart-item__line">
                  <Price value={item.unitPrice * item.quantity} />
                </span>
                <button
                  type="button"
                  className="sf-cart-item__remove"
                  aria-label={t('common.remove')}
                  onClick={() => void handleRemove(item.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <aside className="sf-cart-summary">
            <h2>{t('storefront.orderSummary')}</h2>
            <dl className="sf-cart-summary__rows">
              <div>
                <dt>{t('storefront.subtotal')}</dt>
                <dd data-testid="cart-subtotal">
                  <Price value={cartSubtotal} />
                </dd>
              </div>
              <div>
                <dt>{t('storefront.shipping')}</dt>
                <dd className="sf-muted">{t('storefront.shippingAtCheckout')}</dd>
              </div>
            </dl>
            <Link href={storeCheckoutPath(slug)} className="sf-btn sf-btn--primary sf-btn--lg sf-cart-summary__cta">
              {t('storefront.checkout')}
            </Link>
            <Link href={storeProductsPath(slug)} className="sf-link">
              {t('storefront.continueShopping')}
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
