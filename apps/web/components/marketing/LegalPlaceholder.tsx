'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Honest placeholder for legal pages (Privacy / Terms). No legal text is
 * invented; the copy clearly states the page will be published when finalized.
 */
export function LegalPlaceholder({
  titleKey,
}: {
  titleKey: 'marketing.privacy.title' | 'marketing.terms.title';
}) {
  const { t } = useI18n();
  const placeholderKey =
    titleKey === 'marketing.privacy.title'
      ? 'marketing.privacy.placeholder'
      : 'marketing.terms.placeholder';

  return (
    <section className="mk-legal">
      <div className="mk-container mk-legal__inner">
        <h1 className="mk-legal__title">{t(titleKey)}</h1>
        <div className="mk-legal__card">
          <p>{t(placeholderKey)}</p>
        </div>
        <Link href="/" className="btn btn--outline btn--md">
          {t('marketing.legal.back')}
        </Link>
      </div>
    </section>
  );
}
