'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Final conversion CTA.
 */
export function FinalCta() {
  const { t } = useI18n();

  return (
    <section className="mk-cta" aria-labelledby="cta-title">
      <div className="mk-cta__inner">
        <h2 className="mk-cta__title" id="cta-title">
          {t('marketing.cta.title')}
        </h2>
        <p className="mk-cta__subtitle">{t('marketing.cta.subtitle')}</p>
        <div className="mk-cta__actions">
          <Link href="/signup" className="btn btn--primary btn--lg">
            {t('marketing.cta.getStarted')}
          </Link>
          <Link href="/demo" className="btn btn--secondary btn--lg">
            {t('marketing.cta.bookDemo')}
          </Link>
        </div>
      </div>
    </section>
  );
}
