'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { SectionHeading } from './SectionHeading';

const CAPABILITIES = [
  { key: 'products', icon: '◈' },
  { key: 'variants', icon: '✦' },
  { key: 'categories', icon: '❖' },
  { key: 'inventory', icon: '▤' },
  { key: 'orders', icon: '☰' },
  { key: 'customers', icon: '☺' },
  { key: 'payments', icon: '₿' },
  { key: 'storefront', icon: '◉' },
  { key: 'cms', icon: '▦' },
] as const;

/**
 * Product introduction — the nine capabilities merchants get in one platform.
 */
export function ProductIntroduction() {
  const { t } = useI18n();

  return (
    <section className="mk-section mk-section--tint" id="product" aria-labelledby="product-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.product.eyebrow')}
          title={t('marketing.product.title')}
          description={t('marketing.product.desc')}
        />

        <div className="mk-product__grid">
          {CAPABILITIES.map((capability) => (
            <div className="mk-product__card" key={capability.key}>
              <span className="mk-product__icon" aria-hidden="true">
                {capability.icon}
              </span>
              <h3 className="mk-product__card-title">{t(`marketing.product.${capability.key}`)}</h3>
              <p className="mk-product__card-desc">
                {t(`marketing.product.${capability.key}Desc`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
