'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { catalogApi } from '@/lib/api/catalog';

interface ChecklistItem {
  done: boolean;
  labelKey: 'onboarding.launch.store' | 'onboarding.launch.info' | 'onboarding.launch.product' | 'onboarding.launch.storefront' | 'onboarding.launch.publish';
  href?: string;
  ctaKey?: 'onboarding.launch.addProduct' | 'onboarding.launch.configure' | 'onboarding.launch.publishCta';
}

/**
 * Step 4 — Store launch. Shows exactly what the real backend supports:
 * the store + membership exist, and what remains (first product, storefront
 * configuration, publish) links into the existing dashboard. No invented
 * requirements.
 */
export function LaunchStep() {
  const { store, membership } = useAuth();
  const { t, tStatus } = useI18n();
  const router = useRouter();

  const [hasProducts, setHasProducts] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await catalogApi.listProducts({ page: 1, limit: 1 });
      setHasProducts(result.meta.total > 0);
    } catch {
      setHasProducts(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const items: ChecklistItem[] = [
    { done: true, labelKey: 'onboarding.launch.store' },
    { done: true, labelKey: 'onboarding.launch.info' },
    {
      done: hasProducts,
      labelKey: 'onboarding.launch.product',
      href: '/dashboard/products/new',
      ctaKey: 'onboarding.launch.addProduct',
    },
    {
      done: false,
      labelKey: 'onboarding.launch.storefront',
      href: '/dashboard/store',
      ctaKey: 'onboarding.launch.configure',
    },
    {
      done: false,
      labelKey: 'onboarding.launch.publish',
      href: '/dashboard/products',
      ctaKey: 'onboarding.launch.publishCta',
    },
  ];

  return (
    <div>
      <div className="onboarding__heading">
        <h1>{t('onboarding.step4Title')}</h1>
        <p>{t('onboarding.step4Desc')}</p>
      </div>

      <Card title={t('onboarding.launch.checklist')}>
        <ul className="onboarding__checklist">
          {items.map((item) => (
            <li
              key={item.labelKey}
              className={item.done ? 'onboarding__checklist-item onboarding__checklist-item--done' : 'onboarding__checklist-item'}
            >
              <span className="onboarding__checklist-icon" aria-hidden="true">
                {item.done ? '✓' : '○'}
              </span>
              <span className="onboarding__checklist-label">{t(item.labelKey)}</span>
              {item.href && !item.done ? (
                <Link href={item.href} className="btn btn--ghost btn--sm">
                  {item.ctaKey ? t(item.ctaKey) : t('common.view')}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={t('onboarding.launch.yourStore')}>
        <dl className="meta-list meta-list--grid">
          <div>
            <dt>{t('onboarding.launch.storeName')}</dt>
            <dd>{store?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('onboarding.launch.storeSlug')}</dt>
            <dd dir="ltr">{store ? `/${store.slug}` : '—'}</dd>
          </div>
          <div>
            <dt>{t('onboarding.launch.role')}</dt>
            <dd>{membership ? tStatus(membership.role) : '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card title={t('onboarding.launch.rolesTitle')}>
        <ul className="onboarding__roles">
          <li>
            <strong>{t('nav.dashboard')}</strong> — {t('onboarding.launch.dashboardRole')}
          </li>
          <li>
            <strong>{t('nav.store')}</strong> — {t('onboarding.launch.storefrontRole')}
          </li>
        </ul>
        <p className="onboarding__storefront-note">{t('onboarding.launch.storefrontUrlNote')}</p>
      </Card>

      <div className="onboarding__actions">
        {store ? (
          <Link href={`/store/${store.slug}`} className="btn btn--ghost" data-testid="launch-view-store">
            {t('onboarding.launch.viewStore')}
          </Link>
        ) : null}
        <Button size="lg" loading={loading} onClick={() => router.replace('/dashboard')}>
          {t('onboarding.launch.goToDashboard')}
        </Button>
      </div>
    </div>
  );
}
