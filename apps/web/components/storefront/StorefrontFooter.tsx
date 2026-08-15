'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import {
  navigationItemPath,
  storeCategoriesPath,
  storeHomePath,
  storeProductsPath,
} from '@/lib/storefront/paths';

/** Customer-facing storefront footer with store branding + navigation. */
export function StorefrontFooter() {
  const { slug, store, navigation } = useStorefront();
  const { t } = useI18n();

  const cmsItems = (navigation?.items ?? []).filter(
    (item) => typeof item.label === 'string' && item.label.length > 0,
  );

  return (
    <footer className="sf-footer">
      <div className="sf-footer__inner">
        <div className="sf-footer__brand">
          <strong>{store?.name ?? t('storefront.store')}</strong>
          {store?.description ? <p className="sf-muted">{store.description}</p> : null}
        </div>
        <nav className="sf-footer__nav" aria-label={t('storefront.footerNavigation')}>
          <Link href={storeHomePath(slug)}>{t('nav.home')}</Link>
          <Link href={storeProductsPath(slug)}>{t('nav.products')}</Link>
          <Link href={storeCategoriesPath(slug)}>{t('nav.categories')}</Link>
          {cmsItems.map((item) => (
            <Link key={`${item.type}:${item.value}`} href={navigationItemPath(slug, item)}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="sf-footer__legal">
        © {new Date().getFullYear()} {store?.name ?? t('storefront.store')}
      </p>
    </footer>
  );
}
