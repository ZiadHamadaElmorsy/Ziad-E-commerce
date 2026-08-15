'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';
import { BrowserChrome } from './mockups';

/**
 * Payments — presents Paymob as the currently implemented payment provider.
 * No unverified integrations or capabilities are claimed.
 */
export function PaymentsSection() {
  const { t } = useI18n();

  const bullets = [
    t('marketing.payments.b1'),
    t('marketing.payments.b2'),
    t('marketing.payments.b3'),
    t('marketing.payments.b4'),
  ];

  return (
    <section className="mk-section mk-section--tint" aria-labelledby="payments-title">
      <div className="mk-container">
        <div className="mk-pay__layout">
          <div className="mk-pay__text">
            <SectionHeading
              align="left"
              eyebrow={t('marketing.payments.eyebrow')}
              title={t('marketing.payments.title')}
              description={t('marketing.payments.desc')}
            />
            <ul className="mk-pay__bullets">
              {bullets.map((bullet) => (
                <li key={bullet}>
                  <span className="mk-pay__check" aria-hidden="true">
                    ✓
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>
            <p className="mk-pay__note">{t('marketing.payments.note')}</p>
          </div>

          <div className="mk-pay__visual" aria-hidden="true">
            <BrowserChrome url="checkout.ziad-storefront.com">
              <div className="mk-checkout-card">
                <div className="mk-checkout-card__head">
                  <strong>Order summary</strong>
                  <span>EGP 1,250</span>
                </div>
                <div className="mk-checkout-card__rows">
                  <span>Subtotal</span>
                  <span>EGP 1,150</span>
                  <span>Shipping</span>
                  <span>EGP 100</span>
                </div>
                <div className="mk-checkout-card__body">
                  <span className="mk-checkout-card__label">
                    {t('marketing.payments.providerDesc')}
                  </span>
                  <span className="mk-checkout-card__paymob">
                    <i aria-hidden="true">P</i> {t('marketing.payments.provider')}
                  </span>
                  <span className="mk-checkout-card__button">Pay with Paymob</span>
                </div>
              </div>
            </BrowserChrome>
          </div>
        </div>
      </div>
    </section>
  );
}
