'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeOrderPath, storeOrderTrackingPath, storeProductsPath } from '@/lib/storefront/paths';
import {
  checkoutStorefront,
  initiateStorefrontPayment,
  newIdempotencyKey,
  orderViaWhatsApp,
} from '@/lib/api/cart';
import type { CheckoutResult, PaymentView, WhatsAppOrderResult } from '@/lib/storefront/types';
import { Price } from '@/components/storefront/Price';
import { StorefrontEmpty, StorefrontError } from '@/components/storefront/StorefrontStates';
import { clearGuestToken } from '@/lib/storefront/guest-cart';
import { saveOrderLookupToken } from '@/lib/storefront/order-token';
import { isEmail } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Customer checkout (Phase 19 + Phase 22). Collects exactly what the backend
 * contract requires (customer name/phone/email + shipping address), creates the
 * PENDING order through the existing Checkout API (idempotent) and then lets
 * the customer choose the payment method:
 *
 *   - "Pay Online"  -> initiates the Paymob Intention + Unified Checkout
 *                      session; the customer pays on the provider-hosted
 *                      page (providerCheckoutUrl). Payment success/failure is
 *                      driven by the Paymob webhook (server-side, HMAC).
 *   - "Order via WhatsApp" -> creates (or reuses) a REAL WhatsApp order through
 *                      the server and opens WhatsApp with a pre-filled message.
 *                      The order stays PENDING / unpaid until the merchant
 *                      confirms manually.
 *
 * When Paymob initiation fails, the customer sees a fallback and can continue
 * via WhatsApp without creating a duplicate order (the existing order is
 * reused). Card data is never collected or stored in this application.
 */
export default function StoreCheckoutPage() {
  const { slug, store, cart, cartSubtotal, clearCart } = useStorefront();
  const { t, locale } = useI18n();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [governorate, setGovernorate] = useState('');
  const [city, setCity] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [building, setBuilding] = useState('');
  const [apartment, setApartment] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment flow state.
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [order, setOrder] = useState<CheckoutResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [initiatingPayment, setInitiatingPayment] = useState(false);
  const [whatsappResult, setWhatsappResult] = useState<WhatsAppOrderResult | null>(null);
  const [whatsappSubmitting, setWhatsappSubmitting] = useState(false);

  // Phase 27 — payment method selection (ONLINE | COD).
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'COD'>('ONLINE');

  const items = cart?.items ?? [];

  // Public payment availability from the resolved store config (Phase 22).
  const payOnline = store?.payments?.payOnline ?? false;
  const whatsapp = store?.payments?.whatsapp ?? null;

  // When online payment is not configured for the store, default to COD so a
  // hidden ONLINE radio never leaves the customer with no actionable option.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPaymentMethod((current) => (current === 'ONLINE' && !payOnline ? 'COD' : current));
  }, [payOnline]);

  const buildInput = () => ({
    customer: {
      name: name.trim(),
      phone: phone.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
    },
    shippingAddress: {
      governorate: governorate.trim(),
      city: city.trim(),
      addressLine: addressLine.trim(),
      ...(building.trim() ? { building: building.trim() } : {}),
      ...(apartment.trim() ? { apartment: apartment.trim() } : {}),
    },
    ...(paymentMethod === 'COD' ? { paymentMethod: 'COD' as const } : {}),
  });

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = t('storefront.nameRequired');
    if (!phone.trim()) errors.phone = t('storefront.phoneRequired');
    if (email.trim() && !isEmail(email)) errors.email = t('auth.emailInvalid');
    if (!governorate.trim()) errors.governorate = t('storefront.governorateRequired');
    if (!city.trim()) errors.city = t('storefront.cityRequired');
    if (!addressLine.trim()) errors.addressLine = t('storefront.addressRequired');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };


  const handlePlaceOrder = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setPaymentError(null);
    if (!cart || items.length === 0) return;
    if (!validate()) return;

    // WhatsApp-only store: the "Place order" action goes straight to WhatsApp.
    if (!payOnline && whatsapp) {
      await handleOrderViaWhatsApp(undefined);
      return;
    }

    setSubmitting(true);
    try {
      const guestToken = cart.guestToken;
      const created = await checkoutStorefront(slug, guestToken, buildInput(), newIdempotencyKey());

      // Phase 23 — persist the order's lookup token (sessionStorage) so the
      // confirmation page can read the customer's own PII; never in the URL.
      saveOrderLookupToken(created.orderId, created.lookupToken);

      // The cart is completed server-side; start a fresh guest cart locally.
      await clearCart();
      clearGuestToken(slug);
      setOrder(created);

      // Phase 27 — COD: the order is created UNPAID and the customer pays when
      // the order arrives; no online payment is initiated (Part 6/12).
      if (paymentMethod === 'COD') {
        return;
      }

      if (payOnline) {
        await initiatePayment(created.orderId);
      }
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'storefront.checkoutFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const initiatePayment = async (orderId: string) => {
    setInitiatingPayment(true);
    setPaymentError(null);
    try {
      const initiated = await initiateStorefrontPayment(slug, orderId, newIdempotencyKey());
      setPayment(initiated);
    } catch (caught) {
      // Payment initiation can fail closed (e.g. Paymob credentials are not
      // configured in this environment). The ORDER still exists (PENDING with
      // inventory reserved); the customer can continue via WhatsApp or view it.
      setPaymentError(apiErrorMessage(caught, t, 'storefront.paymentInitFailed'));
    } finally {
      setInitiatingPayment(false);
    }
  };

  /**
   * "Order via WhatsApp" â€” creates (or reuses) a REAL order server-side and
   * opens WhatsApp with the prepared message. Idempotent: when an order was
   * already created (the Paymob-failure fallback), `orderId` reuses it and NO
   * duplicate order is created.
   */
  const handleOrderViaWhatsApp = async (orderId: string | undefined) => {
    if (!cart || items.length === 0) return;
    if (!validate()) return;
    setError(null);
    setPaymentError(null);
    setWhatsappSubmitting(true);
    try {
      const result = await orderViaWhatsApp(
        slug,
        cart.guestToken,
        { ...buildInput(), orderId, lang: locale },
        newIdempotencyKey(),
      );
      // Phase 23 — persist the lookup token for the confirmation page.
      saveOrderLookupToken(result.order.orderId, result.order.lookupToken);
      setOrder(result.order);
      setWhatsappResult(result);
      await clearCart();
      clearGuestToken(slug);
      window.open(result.whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'storefront.whatsappFailed'));
    } finally {
      setWhatsappSubmitting(false);
    }
  };

  if (items.length === 0 && !order) {
    return (
      <div className="sf-page">
        <StorefrontEmpty
          icon="ðŸ›’"
          title={t('storefront.cartEmpty')}
          description={t('storefront.cartEmptyDesc')}
          action={
            <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--primary">
              {t('storefront.continueShopping')}
            </Link>
          }
        />
      </div>
    );
  }

  // --- Payment step (order exists) ------------------------------------------
  if (order) {
    // Phase 27 — COD orders skip the online-payment step entirely and show a
    // confirmation with the amount to pay on delivery (Part 12).
    if (order.paymentMethod === 'COD') {
      return <CodConfirmationStep slug={slug} order={order} />;
    }
    return (
      <PaymentStep
        slug={slug}
        order={order}
        payment={payment}
        paymentError={paymentError}
        paymentInitiationLoading={initiatingPayment}
        whatsappResult={whatsappResult}
        whatsappSubmitting={whatsappSubmitting}
        payOnlineAvailable={payOnline}
        whatsappAvailable={Boolean(whatsapp)}
        onRetryPayment={() => void initiatePayment(order.orderId)}
        onOrderViaWhatsApp={() => void handleOrderViaWhatsApp(order.orderId)}
      />
    );
  }


  // --- Order summary + checkout form ------------------------------------------
  return (
    <div className="sf-page">
      <h1>{t('storefront.checkout')}</h1>
      {error ? <StorefrontError message={error} /> : null}

      {!payOnline && !whatsapp ? (
        <StorefrontError message={t('storefront.noPaymentMethod')} />
      ) : null}

      <div className="sf-checkout-layout">
        <form className="sf-checkout-form" onSubmit={handlePlaceOrder} noValidate>
          <fieldset className="sf-fieldset">
            <legend>{t('storefront.customerInfo')}</legend>
            <label className="sf-field">
              <span>{t('storefront.name')} *</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                aria-invalid={Boolean(fieldErrors.name)}
              />
              {fieldErrors.name ? <em className="sf-field__error">{fieldErrors.name}</em> : null}
            </label>
            <label className="sf-field">
              <span>{t('storefront.phone')} *</span>
              <input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                aria-invalid={Boolean(fieldErrors.phone)}
              />
              {fieldErrors.phone ? <em className="sf-field__error">{fieldErrors.phone}</em> : null}
            </label>
            <label className="sf-field">
              <span>{t('storefront.email')} ({t('common.optional')})</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(fieldErrors.email)}
              />
              {fieldErrors.email ? <em className="sf-field__error">{fieldErrors.email}</em> : null}
            </label>
          </fieldset>

          <fieldset className="sf-fieldset">
            <legend>{t('storefront.shippingAddress')}</legend>
            <label className="sf-field">
              <span>{t('storefront.governorate')} *</span>
              <input
                value={governorate}
                onChange={(event) => setGovernorate(event.target.value)}
                autoComplete="address-level1"
                aria-invalid={Boolean(fieldErrors.governorate)}
              />
              {fieldErrors.governorate ? (
                <em className="sf-field__error">{fieldErrors.governorate}</em>
              ) : null}
            </label>
            <label className="sf-field">
              <span>{t('storefront.city')} *</span>
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                autoComplete="address-level2"
                aria-invalid={Boolean(fieldErrors.city)}
              />
              {fieldErrors.city ? <em className="sf-field__error">{fieldErrors.city}</em> : null}
            </label>
            <label className="sf-field">
              <span>{t('storefront.addressLine')} *</span>
              <input
                value={addressLine}
                onChange={(event) => setAddressLine(event.target.value)}
                autoComplete="street-address"
                aria-invalid={Boolean(fieldErrors.addressLine)}
              />
              {fieldErrors.addressLine ? (
                <em className="sf-field__error">{fieldErrors.addressLine}</em>
              ) : null}
            </label>
            <div className="sf-checkout-grid-2">
              <label className="sf-field">
                <span>{t('storefront.building')} ({t('common.optional')})</span>
                <input value={building} onChange={(event) => setBuilding(event.target.value)} />
              </label>
              <label className="sf-field">
                <span>{t('storefront.apartment')} ({t('common.optional')})</span>
                <input value={apartment} onChange={(event) => setApartment(event.target.value)} />
              </label>
            </div>
          </fieldset>


          <fieldset className="sf-fieldset">
            <legend>{t('storefront.paymentMethods')}</legend>
            <p className="sf-muted">{t('storefront.paymentNote')}</p>

            {/* Phase 27 (Part 6/12) — Pay Online vs Cash on Delivery. */}
            <div className="sf-payment-choice" role="radiogroup" aria-label={t('storefront.paymentMethods')}>
              {payOnline ? (
                <label className={`sf-payment-choice__option${paymentMethod === 'ONLINE' ? ' sf-payment-choice__option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === 'ONLINE'}
                    onChange={() => setPaymentMethod('ONLINE')}
                  />
                  <span className="sf-payment-choice__title">{t('storefront.payOnline')}</span>
                  <span className="sf-payment-choice__desc">{t('storefront.payOnlineDesc')}</span>
                </label>
              ) : null}
              <label className={`sf-payment-choice__option${paymentMethod === 'COD' ? ' sf-payment-choice__option--selected' : ''}`}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={paymentMethod === 'COD'}
                  onChange={() => setPaymentMethod('COD')}
                  data-testid="payment-method-cod"
                />
                <span className="sf-payment-choice__title">{t('storefront.cashOnDelivery')}</span>
                <span className="sf-payment-choice__desc">{t('storefront.codDesc')}</span>
              </label>
            </div>

            <div className="sf-payment-methods">
              {paymentMethod === 'ONLINE' && payOnline ? (
                <button
                  type="submit"
                  className="sf-btn sf-btn--primary sf-btn--lg"
                  disabled={submitting}
                  data-testid="place-order"
                >
                  {submitting ? t('common.saving') : t('storefront.payOnline')}
                </button>
              ) : null}
              {paymentMethod === 'COD' ? (
                <button
                  type="submit"
                  className="sf-btn sf-btn--primary sf-btn--lg"
                  disabled={submitting}
                  data-testid="place-order-cod"
                >
                  {submitting ? t('common.saving') : t('storefront.placeCodOrder')}
                </button>
              ) : null}
              {whatsapp ? (
                <button
                  type="button"
                  className="sf-btn sf-btn--whatsapp sf-btn--lg"
                  disabled={whatsappSubmitting || submitting}
                  onClick={() => void handleOrderViaWhatsApp(undefined)}
                  data-testid="order-via-whatsapp"
                >
                  {whatsappSubmitting
                    ? t('storefront.openingWhatsApp')
                    : t('storefront.orderViaWhatsApp')}
                </button>
              ) : null}
            </div>
          </fieldset>
        </form>

        <aside className="sf-cart-summary">
          <h2>{t('storefront.orderSummary')}</h2>
          <ul className="sf-summary-items">
            {items.map((item) => (
              <li key={item.id}>
                <span>
                  {item.name} <em className="sf-muted">Ã— {item.quantity}</em>
                </span>
                <Price value={item.unitPrice * item.quantity} />
              </li>
            ))}
          </ul>
          <dl className="sf-cart-summary__rows">
            <div>
              <dt>{t('storefront.subtotal')}</dt>
              <dd>
                <Price value={cartSubtotal} />
              </dd>
            </div>
            <div>
              <dt>{t('storefront.shipping')}</dt>
              <dd className="sf-muted">{t('storefront.shippingAtCheckout')}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}


function PaymentStep({
  slug,
  order,
  payment,
  paymentError,
  paymentInitiationLoading,
  whatsappResult,
  whatsappSubmitting,
  payOnlineAvailable,
  whatsappAvailable,
  onRetryPayment,
  onOrderViaWhatsApp,
}: {
  slug: string;
  order: CheckoutResult;
  payment: PaymentView | null;
  paymentError: string | null;
  paymentInitiationLoading: boolean;
  whatsappResult: WhatsAppOrderResult | null;
  whatsappSubmitting: boolean;
  payOnlineAvailable: boolean;
  whatsappAvailable: boolean;
  onRetryPayment: () => void;
  onOrderViaWhatsApp: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const orderUrl = storeOrderPath(slug, order.orderId);

  const providerUrl = payment?.providerCheckoutUrl ?? null;

  return (
    <div className="sf-page sf-page--narrow">
      <div className="sf-order-placed">
        <div className="sf-order-placed__icon" aria-hidden="true">
          âœ“
        </div>
        <h1>{t('storefront.orderPlaced')}</h1>
        <p className="sf-order-placed__number">
          {t('storefront.orderNumberLabel')} <strong>{order.orderNumber}</strong>
        </p>
        <p className="sf-muted">{t('storefront.orderPlacedDesc')}</p>
      </div>

      {whatsappResult ? (
        <div className="sf-payment">
          <h2>{t('storefront.whatsappOrderReady')}</h2>
          <p className="sf-muted">{t('storefront.whatsappOrderReadyDesc')}</p>
          <div className="sf-payment__actions">
            <a
              href={whatsappResult.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sf-btn sf-btn--whatsapp"
              data-testid="open-whatsapp"
            >
              {t('storefront.openWhatsApp')}
            </a>
            <button type="button" className="sf-btn sf-btn--outline" onClick={() => router.push(orderUrl)}>
              {t('storefront.viewOrder')}
            </button>
          </div>
        </div>
      ) : providerUrl ? (
        <div className="sf-payment">
          <h2>{t('storefront.completePayment')}</h2>
          <p className="sf-muted">{t('storefront.paymobIframeNote')}</p>
          <iframe
            title={t('storefront.completePayment')}
            src={providerUrl}
            className="sf-payment__iframe"
            data-testid="payment-iframe"
          />
          <div className="sf-payment__actions">
            <button type="button" className="sf-btn sf-btn--primary" onClick={() => router.push(orderUrl)}>
              {t('storefront.iCompletedPayment')}
            </button>
            <button type="button" className="sf-btn sf-btn--ghost" onClick={onRetryPayment}>
              {t('storefront.retryPayment')}
            </button>
          </div>
        </div>
      ) : (
        <div className="sf-payment">
          <h2>{t('storefront.paymentMethods')}</h2>

          {paymentInitiationLoading ? (
            <p className="sf-muted">{t('storefront.initiatingPayment')}</p>
          ) : (
            <>
              {paymentError && whatsappAvailable ? (
                <div className="sf-paymob-fallback" data-testid="paymob-fallback">
                  <p className="sf-alert sf-alert--danger">{paymentError}</p>
                  <p>
                    <strong>{t('storefront.paymobUnavailable')}</strong>{' '}
                    {t('storefront.paymobUnavailableWhatsAppHint')}
                  </p>
                  <div className="sf-payment__actions">
                    <button type="button" className="sf-btn sf-btn--primary" onClick={onRetryPayment}>
                      {t('storefront.retryPaymob')}
                    </button>
                    <button
                      type="button"
                      className="sf-btn sf-btn--whatsapp"
                      onClick={onOrderViaWhatsApp}
                      disabled={whatsappSubmitting}
                      data-testid="fallback-whatsapp"
                    >
                      {whatsappSubmitting
                        ? t('storefront.openingWhatsApp')
                        : t('storefront.orderViaWhatsApp')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {paymentError ? (
                    <p className="sf-alert sf-alert--danger">{paymentError}</p>
                  ) : null}
                  <div className="sf-payment__actions">
                    {payOnlineAvailable ? (
                      <button type="button" className="sf-btn sf-btn--primary" onClick={onRetryPayment}>
                        {t('storefront.payOnline')}
                      </button>
                    ) : null}
                    {whatsappAvailable ? (
                      <button
                        type="button"
                        className="sf-btn sf-btn--whatsapp"
                        onClick={onOrderViaWhatsApp}
                        disabled={whatsappSubmitting}
                        data-testid="step-whatsapp"
                      >
                        {whatsappSubmitting
                          ? t('storefront.openingWhatsApp')
                          : t('storefront.orderViaWhatsApp')}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      <div className="sf-payment__footer">
        <button type="button" className="sf-btn sf-btn--outline" onClick={() => router.push(orderUrl)}>
          {t('storefront.viewOrder')}
        </button>
        <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--ghost">
          {t('storefront.continueShopping')}
        </Link>
      </div>
    </div>
  );
}

/**
 * Cash-on-delivery confirmation (Phase 27 — Part 12). Shown right after a COD
 * order is created: the customer pays when the order arrives. The amount to
 * pay on delivery equals the order grand total (the carrier collects it).
 */
function CodConfirmationStep({
  slug,
  order,
}: {
  slug: string;
  order: CheckoutResult;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const orderUrl = storeOrderPath(slug, order.orderId);
  const trackingUrl = storeOrderTrackingPath(slug, order.orderId);

  return (
    <div className="sf-page sf-page--narrow">
      <div className="sf-order-placed">
        <div className="sf-order-placed__icon" aria-hidden="true">
          ✓
        </div>
        <h1 data-testid="cod-confirmation">{t('storefront.orderConfirmed')}</h1>
        <p className="sf-order-placed__number">
          {t('storefront.orderNumberLabel')} <strong>{order.orderNumber}</strong>
        </p>
        <p className="sf-muted">{t('storefront.orderPlacedDesc')}</p>
      </div>

      <div className="sf-payment">
        <h2>{t('storefront.payment')}</h2>
        <dl className="sf-meta">
          <div>
            <dt>{t('storefront.paymentMethod')}</dt>
            <dd data-testid="cod-payment-method">{t('storefront.cashOnDelivery')}</dd>
          </div>
          <div>
            <dt>{t('storefront.amountToPayOnDelivery')}</dt>
            <dd>
              <strong data-testid="cod-amount">
                <Price value={order.grandTotal} />
              </strong>
            </dd>
          </div>
        </dl>
        <p className="sf-alert sf-alert--info">{t('storefront.codPayWhenArrives')}</p>
      </div>

      <div className="sf-payment__footer">
        <Link href={trackingUrl} className="sf-btn sf-btn--primary">
          {t('storefront.trackOrder')}
        </Link>
        <button type="button" className="sf-btn sf-btn--outline" onClick={() => router.push(orderUrl)}>
          {t('storefront.viewOrder')}
        </button>
        <Link href={storeProductsPath(slug)} className="sf-btn sf-btn--ghost">
          {t('storefront.continueShopping')}
        </Link>
      </div>
    </div>
  );
}
