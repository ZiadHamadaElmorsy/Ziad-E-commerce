'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useSupabaseSession } from '@/lib/auth/use-supabase-session';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/#product', key: 'marketing.nav.product' },
  { href: '/#features', key: 'marketing.nav.features' },
  { href: '/#how-it-works', key: 'marketing.nav.howItWorks' },
  { href: '/#pricing', key: 'marketing.nav.pricing' },
  { href: '/#faq', key: 'marketing.nav.faq' },
  { href: '/demo', key: 'marketing.nav.demo' },
] as const;

/**
 * Marketing site navigation. Sticky, responsive (hamburger panel on mobile)
 * and always exposes the primary acquisition CTA.
 *
 * For a signed-in merchant the primary CTA becomes "Go to Dashboard" so they
 * are never pushed back into the signup funnel (Phase 18). The public nav
 * links stay identical for everyone.
 */
export function MarketingNavbar() {
  const { t } = useI18n();
  const { loading, session } = useSupabaseSession();
  const [open, setOpen] = useState(false);

  const isMerchant = !loading && !!session;
  const close = () => setOpen(false);

  return (
    <header className="mk-nav">
      <div className="mk-nav__inner">
        <Link
          href="/"
          className="mk-nav__brand"
          onClick={close}
          aria-label={t('marketing.nav.home')}
        >
          <span className="mk-nav__logo" aria-hidden="true">
            Z
          </span>
          <span className="mk-nav__name">Ziad E-commerce</span>
        </Link>

        <nav className="mk-nav__links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="mk-nav__link">
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="mk-nav__actions">
          <LanguageSwitcher />
          {loading ? (
            // Keep the bar stable while the session resolves — never flash the
            // signup CTA at a merchant who is already signed in.
            <span className="mk-nav__cta-spacer" aria-hidden="true" />
          ) : isMerchant ? (
            <Link href="/dashboard" className="btn btn--primary btn--md mk-nav__cta">
              {t('marketing.nav.goToDashboard')}
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn--ghost btn--md mk-nav__login">
                {t('marketing.nav.login')}
              </Link>
              <Link href="/signup" className="btn btn--primary btn--md mk-nav__cta">
                {t('marketing.nav.getStarted')}
              </Link>
            </>
          )}
          <button
            type="button"
            className={cn('mk-nav__toggle', open && 'mk-nav__toggle--open')}
            aria-expanded={open}
            aria-controls="mk-mobile-nav"
            aria-label={open ? t('marketing.nav.close') : t('marketing.nav.menu')}
            onClick={() => setOpen((current) => !current)}
          >
            <span className="mk-nav__toggle-bar" />
            <span className="mk-nav__toggle-bar" />
            <span className="mk-nav__toggle-bar" />
          </button>
        </div>
      </div>

      {open ? (
        <div id="mk-mobile-nav" className="mk-nav__mobile">
          <nav className="mk-nav__mobile-links" aria-label="Mobile">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="mk-nav__mobile-link"
                onClick={close}
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
          <div className="mk-nav__mobile-actions">
            {isMerchant ? (
              <Link href="/dashboard" className="btn btn--primary btn--md" onClick={close}>
                {t('marketing.nav.goToDashboard')}
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn--outline btn--md" onClick={close}>
                  {t('marketing.nav.login')}
                </Link>
                <Link href="/signup" className="btn btn--primary btn--md" onClick={close}>
                  {t('marketing.nav.getStarted')}
                </Link>
              </>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

