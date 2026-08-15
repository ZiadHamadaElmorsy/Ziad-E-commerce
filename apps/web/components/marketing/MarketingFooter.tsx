'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Marketing footer. Every link has a real destination; contact routes to the
 * demo page because no contact form / real contact details exist yet.
 */
export function MarketingFooter() {
  const { t } = useI18n();

  const productLinks = [
    { href: '/#product', label: t('marketing.footer.product') },
    { href: '/#features', label: t('marketing.footer.features') },
    { href: '/#pricing', label: t('marketing.footer.pricing') },
    { href: '/#faq', label: t('marketing.footer.faq') },
  ];

  const companyLinks = [
    { href: '/login', label: t('marketing.footer.login') },
    { href: '/signup', label: t('marketing.footer.getStarted') },
    { href: '/demo', label: t('marketing.footer.contact') },
  ];

  const legalLinks = [
    { href: '/privacy', label: t('marketing.footer.privacy') },
    { href: '/terms', label: t('marketing.footer.terms') },
  ];

  return (
    <footer className="mk-footer">
      <div className="mk-footer__inner">
        <div className="mk-footer__grid">
          <div className="mk-footer__brand">
            <Link href="/" className="mk-nav__brand" aria-label={t('marketing.nav.home')}>
              <span className="mk-nav__logo" aria-hidden="true">
                Z
              </span>
              <span className="mk-nav__name">Ziad E-commerce</span>
            </Link>
            <p className="mk-footer__tagline">{t('marketing.footer.tagline')}</p>
            <p className="mk-footer__made-for">{t('marketing.footer.madeFor')}</p>
          </div>

          <nav className="mk-footer__col" aria-label={t('marketing.footer.product')}>
            <h3 className="mk-footer__col-title">{t('marketing.footer.product')}</h3>
            {productLinks.map((link) => (
              <Link key={link.href} href={link.href} className="mk-footer__link">
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="mk-footer__col" aria-label="Company">
            <h3 className="mk-footer__col-title">Company</h3>
            {companyLinks.map((link) => (
              <Link key={link.href} href={link.href} className="mk-footer__link">
                {link.label}
              </Link>
            ))}
          </nav>

          <nav className="mk-footer__col" aria-label="Legal">
            <h3 className="mk-footer__col-title">Legal</h3>
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="mk-footer__link">
                {link.label}
              </Link>
            ))}
            <p className="mk-footer__contact-desc">{t('marketing.footer.contactDesc')}</p>
          </nav>
        </div>

        <div className="mk-footer__bottom">
          <span>
            © {new Date().getFullYear()} Ziad E-commerce. {t('marketing.footer.rights')}
          </span>
        </div>
      </div>
    </footer>
  );
}
