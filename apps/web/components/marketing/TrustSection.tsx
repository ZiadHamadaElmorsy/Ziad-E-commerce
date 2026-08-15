'use client';

import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Trust / social proof band. Stats are honest placeholders — real platform
 * metrics are not shown because real data is not available yet. Paymob is the
 * genuinely implemented payment partner and is the only "partner" shown.
 */
export function TrustSection() {
  const { t } = useI18n();

  const stats = [
    { label: t('marketing.trust.merchants') },
    { label: t('marketing.trust.orders') },
    { label: t('marketing.trust.products') },
    { label: t('marketing.trust.customers') },
  ];

  return (
    <section className="mk-section mk-trust" aria-label={t('marketing.trust.title')}>
      <div className="mk-container">
        <h2 className="mk-trust__title">{t('marketing.trust.title')}</h2>

        <div className="mk-trust__stats">
          {stats.map((stat) => (
            <div className="mk-trust__stat" key={stat.label}>
              <span className="mk-trust__stat-value">{t('marketing.trust.placeholderValue')}</span>
              <span className="mk-trust__stat-label">{stat.label}</span>
            </div>
          ))}
        </div>

        <div className="mk-trust__partners">
          <div className="mk-trust__partner">
            <span className="mk-trust__partner-name">{t('marketing.trust.paymob')}</span>
            <span className="mk-trust__partner-desc">{t('marketing.trust.paymobDesc')}</span>
          </div>
        </div>

        <p className="mk-trust__note">
          <span className="mk-trust__note-badge">{t('marketing.trust.placeholder')}</span>
          {t('marketing.trust.note')}
        </p>
      </div>
    </section>
  );
}
