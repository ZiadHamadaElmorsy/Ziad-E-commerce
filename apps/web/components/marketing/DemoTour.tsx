'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { DashboardShowcase } from './DashboardShowcase';
import { StorefrontShowcase } from './StorefrontShowcase';
import { CmsShowcase } from './CmsShowcase';
import { PaymentsSection } from './PaymentsSection';
import { FinalCta } from './FinalCta';

/**
 * Demo / product experience — a deeper visual tour of the real product using
 * the same UI language as the merchant dashboard.
 */
export function DemoTour() {
  const { t } = useI18n();

  return (
    <>
      <section className="mk-demo-hero">
        <div className="mk-container mk-demo-hero__inner">
          <p className="mk-eyebrow">Ziad E-commerce</p>
          <h1 className="mk-hero__title">{t('marketing.demo.title')}</h1>
          <p className="mk-hero__subtitle">{t('marketing.demo.desc')}</p>
          <div className="mk-hero__cta-row">
            <Link href="/signup" className="btn btn--primary btn--lg">
              {t('marketing.demo.signUp')}
            </Link>
            <Link href="/" className="btn btn--outline btn--lg">
              {t('marketing.demo.back')}
            </Link>
          </div>
          <p className="mk-hero__note">{t('marketing.demo.note')}</p>
        </div>
      </section>

      <DashboardShowcase />
      <StorefrontShowcase />
      <CmsShowcase />
      <PaymentsSection />
      <FinalCta />
    </>
  );
}
