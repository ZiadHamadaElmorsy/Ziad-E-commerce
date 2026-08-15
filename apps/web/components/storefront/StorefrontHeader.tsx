'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import {
  navigationItemPath,
  storeCartPath,
  storeHomePath,
} from '@/lib/storefront/paths';
import type { StorefrontNavigationItem } from '@/lib/storefront/types';
import { whatsappContactUrl } from '@/lib/storefront/types';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { StorefrontImage } from './StorefrontImage';

/** Default storefront navigation (always present on top of CMS navigation). */
const DEFAULT_NAV: Array<{ labelKey: 'nav.home' | 'nav.products' | 'nav.categories'; type: string; value: string }> = [
  { labelKey: 'nav.home', type: 'DESTINATION', value: 'home' },
  { labelKey: 'nav.products', type: 'DESTINATION', value: 'products' },
  { labelKey: 'nav.categories', type: 'DESTINATION', value: 'categories' },
];

/** Customer-facing storefront header: branding, navigation, cart, language. */
export function StorefrontHeader() {
  const { slug, store, theme, navigation, cartCount } = useStorefront();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const cmsItems = (navigation?.items ?? []).filter(
    (item) => typeof item.label === 'string' && item.label.length > 0,
  );
  const logoMediaId = theme?.logoMediaId ?? null;

  // Phase 22 — the merchant's public WhatsApp contact CTA (never creates an
  // order; opens WhatsApp with a generic help message).
  const whatsapp = store?.payments?.whatsapp ?? null;
  const whatsappHref = whatsapp
    ? whatsappContactUrl(whatsapp.phoneNumber, t('storefront.chatOnWhatsApp'))
    : null;

  const linkHref = (item: StorefrontNavigationItem): string => navigationItemPath(slug, item);

  const navLinks: Array<{ label: string; href: string }> = [
    ...DEFAULT_NAV.map((item) => ({
      label: t(item.labelKey),
      href: navigationItemPath(slug, { label: t(item.labelKey), type: item.type, value: item.value }),
    })),
    ...cmsItems.map((item) => ({ label: item.label, href: linkHref(item) })),
  ];

  return (
    <header className="sf-header">
      <div className="sf-header__inner">
        <Link href={storeHomePath(slug)} className="sf-brand">
          {logoMediaId ? (
            <span className="sf-brand__logo">
              <StorefrontImage mediaId={logoMediaId} alt={store?.name ?? ''} />
            </span>
          ) : (
            <span className="sf-brand__mark" aria-hidden="true">
              {store?.name?.charAt(0).toUpperCase() ?? 'S'}
            </span>
          )}
          <span className="sf-brand__name">{store?.name ?? t('storefront.store')}</span>
        </Link>

        <nav className="sf-nav" aria-label={t('storefront.mainNavigation')}>
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="sf-nav__link">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="sf-header__actions">
          <LanguageSwitcher />
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="sf-whatsapp-cta"
              data-testid="whatsapp-contact-cta"
            >
              <span aria-hidden="true">💬</span>
              <span>{t('storefront.chatOnWhatsApp')}</span>
            </a>
          ) : null}
          <Link href={storeCartPath(slug)} className="sf-cart-link" aria-label={t('storefront.cart')}>
            <span className="sf-cart-link__icon" aria-hidden="true">
              🛒
            </span>
            <span className="sf-cart-link__count" data-testid="cart-count">
              {cartCount}
            </span>
          </Link>
          <button
            type="button"
            className="sf-nav-toggle"
            aria-expanded={mobileOpen}
            aria-label={t('storefront.toggleNav')}
            onClick={() => setMobileOpen((current) => !current)}
          >
            <span className="sf-nav-toggle__bar" />
            <span className="sf-nav-toggle__bar" />
            <span className="sf-nav-toggle__bar" />
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="sf-nav sf-nav--mobile" aria-label={t('storefront.mainNavigation')}>
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="sf-nav__link"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href={storeCartPath(slug)}
            className="sf-nav__link"
            onClick={() => setMobileOpen(false)}
          >
            {t('storefront.cart')} ({cartCount})
          </Link>
        </nav>
      ) : null}
    </header>
  );
}
