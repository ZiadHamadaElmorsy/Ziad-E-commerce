'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { BrowserChrome, DashboardWindow, MockStatCard, MockTable, StatusPill } from './mockups';

/**
 * Hero — communicates the core value immediately and shows the real merchant
 * dashboard as the visual proof point.
 */
export function HeroSection() {
  const { t } = useI18n();

  return (
    <section className="mk-hero">
      <div className="mk-container mk-hero__inner">
        <div className="mk-hero__text">
          <p className="mk-eyebrow">{t('marketing.hero.eyebrow')}</p>
          <h1 className="mk-hero__title">{t('marketing.hero.title')}</h1>
          <p className="mk-hero__subtitle">{t('marketing.hero.subtitle')}</p>

          <div className="mk-hero__cta-row">
            <Link href="/signup" className="btn btn--primary btn--lg">
              {t('marketing.hero.startSelling')}
            </Link>
            <Link href="/demo" className="btn btn--outline btn--lg">
              {t('marketing.hero.seeDemo')}
            </Link>
          </div>

          <p className="mk-hero__note">{t('marketing.hero.trialNote')}</p>
        </div>

        <div className="mk-hero__visual">
          <BrowserChrome url="app.ziad-ecommerce.com/dashboard">
            <DashboardWindow active="dashboard">
              <div className="mk-dash-grid">
                <div className="mk-dash-stats">
                  <MockStatCard label={t('dashboard.products')} value="24" delta="+3" />
                  <MockStatCard label={t('dashboard.totalOrders')} value="187" delta="+12" />
                  <MockStatCard label={t('dashboard.revenue')} value="EGP 48k" delta="+8%" />
                </div>
                <MockTable
                  head={[
                    t('dashboard.recentOrders'),
                    t('dashboard.customer'),
                    t('common.status'),
                    t('dashboard.total'),
                  ]}
                  rows={[
                    [
                      '#1001',
                      'customer@example.com',
                      <StatusPill tone="green" key="1">
                        {t('status.DELIVERED')}
                      </StatusPill>,
                      'EGP 1,250',
                    ],
                    [
                      '#1000',
                      'buyer@example.com',
                      <StatusPill tone="amber" key="2">
                        {t('status.PROCESSING')}
                      </StatusPill>,
                      'EGP 640',
                    ],
                    [
                      '#0999',
                      'shop@example.com',
                      <StatusPill tone="green" key="3">
                        {t('status.SUCCEEDED')}
                      </StatusPill>,
                      'EGP 2,100',
                    ],
                  ]}
                />
              </div>
            </DashboardWindow>
          </BrowserChrome>
        </div>
      </div>
    </section>
  );
}
