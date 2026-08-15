'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { cn } from '@/lib/utils';
import { SectionHeading } from './SectionHeading';

interface Tier {
  key: 'starter' | 'growth' | 'custom';
  featured?: boolean;
  cta: {
    href: string;
    labelKey:
      | 'marketing.pricing.startSelling'
      | 'marketing.pricing.bookDemo'
      | 'marketing.pricing.contactSales';
  };
}

const TIERS: Tier[] = [
  { key: 'starter', cta: { href: '/signup', labelKey: 'marketing.pricing.startSelling' } },
  { key: 'growth', featured: true, cta: { href: '/demo', labelKey: 'marketing.pricing.bookDemo' } },
  { key: 'custom', cta: { href: '/demo', labelKey: 'marketing.pricing.contactSales' } },
];

/**
 * Pricing — honest placeholder tiers. Final pricing is not published, so no
 * prices are invented; every CTA leads to a real next step.
 */
export function PricingSection() {
  const { t } = useI18n();

  return (
    <section className="mk-section" id="pricing" aria-labelledby="pricing-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.pricing.eyebrow')}
          title={t('marketing.pricing.title')}
          description={t('marketing.pricing.desc')}
        />

        <div className="mk-pricing__grid">
          {TIERS.map((tier) => (
            <div
              className={cn('mk-price-card', tier.featured && 'mk-price-card--featured')}
              key={tier.key}
            >
              {tier.featured ? (
                <span className="mk-price-card__badge">
                  {t('marketing.pricing.placeholderBadge')}
                </span>
              ) : null}
              <h3 className="mk-price-card__name">{t(`marketing.pricing.${tier.key}`)}</h3>
              <p className="mk-price-card__desc">{t(`marketing.pricing.${tier.key}Desc`)}</p>
              <p className="mk-price-card__tbd">{t('marketing.pricing.tbd')}</p>
              <ul className="mk-price-card__list">
                <li>{t('marketing.pricing.trialNote')}</li>
                <li>{t('marketing.product.storefrontDesc')}</li>
              </ul>
              <Link
                href={tier.cta.href}
                className={cn(
                  'btn btn--md mk-price-card__cta',
                  tier.featured ? 'btn--primary' : 'btn--outline',
                )}
              >
                {t(tier.cta.labelKey)}
              </Link>
            </div>
          ))}
        </div>

        <p className="mk-pricing__note">{t('marketing.pricing.note')}</p>
      </div>
    </section>
  );
}
