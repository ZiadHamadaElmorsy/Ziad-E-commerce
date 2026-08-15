'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';
import { BrowserChrome, StorefrontHero, StorefrontProduct, StorefrontWindow } from './mockups';

/**
 * Storefront showcase — makes the relationship between the merchant's Store and
 * their published storefront explicit, and distinguishes it from this marketing
 * website.
 */
export function StorefrontShowcase() {
  const { t } = useI18n();

  const steps = [
    { num: 1, title: t('marketing.storefront.step1'), desc: t('marketing.storefront.step1Desc') },
    { num: 2, title: t('marketing.storefront.step2'), desc: t('marketing.storefront.step2Desc') },
    { num: 3, title: t('marketing.storefront.step3'), desc: t('marketing.storefront.step3Desc') },
  ];

  return (
    <section className="mk-section mk-section--tint" aria-labelledby="storefront-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.storefront.eyebrow')}
          title={t('marketing.storefront.title')}
          description={t('marketing.storefront.desc')}
        />

        <div className="mk-storefront__layout">
          <div className="mk-storefront__steps">
            {steps.map((step) => (
              <div className="mk-storefront__step" key={step.num}>
                <span className="mk-storefront__step-num">{step.num}</span>
                <div>
                  <h3 className="mk-storefront__step-title">{step.title}</h3>
                  <p className="mk-storefront__step-desc">{step.desc}</p>
                </div>
              </div>
            ))}
            <div className="mk-storefront__live">
              <span className="mk-storefront__live-dot" aria-hidden="true" />
              {t('marketing.storefront.live')}
            </div>
          </div>

          <div className="mk-storefront__visual" aria-hidden="true">
            <BrowserChrome url="my-store.ziad-storefront.com">
              <StorefrontWindow brand="My Store">
                <StorefrontHero
                  title="New season. New prices."
                  subtitle="Up to 30% off selected styles"
                />
                <div className="mk-sf-products">
                  <StorefrontProduct title="Classic T-Shirt" price="EGP 350" />
                  <StorefrontProduct title="Slim Jeans" price="EGP 720" tone="gray" />
                  <StorefrontProduct title="Winter Jacket" price="EGP 1,150" />
                </div>
              </StorefrontWindow>
            </BrowserChrome>
          </div>
        </div>
      </div>
    </section>
  );
}
