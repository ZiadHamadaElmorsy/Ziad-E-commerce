'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { cn } from '@/lib/utils';
import type { TranslationKey } from '@/lib/i18n/translations';

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: '▦' },
  { href: '/dashboard/products', labelKey: 'nav.products', icon: '◈' },
  { href: '/dashboard/categories', labelKey: 'nav.categories', icon: '❖' },
  { href: '/dashboard/orders', labelKey: 'nav.orders', icon: '☰' },
  { href: '/dashboard/customers', labelKey: 'nav.customers', icon: '☺' },
  { href: '/dashboard/media', labelKey: 'nav.media', icon: '◧' },
  { href: '/dashboard/settings', labelKey: 'nav.settings', icon: '⚙' },
  { href: '/dashboard/store', labelKey: 'nav.store', icon: '◉' },
];

export function Sidebar({
  storeName,
  mobileOpen,
  onNavigate,
}: {
  storeName?: string;
  mobileOpen: boolean;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const { t } = useI18n();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <aside className={cn('sidebar', mobileOpen && 'sidebar--open')}>
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">
          Z
        </span>
        <div className="sidebar__brand-text">
          <strong>{storeName || 'Ziad'}</strong>
          <span>{t('nav.admin')}</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label={t('userMenu.toggleNav')}>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn('sidebar__link', isActive(item.href) && 'sidebar__link--active')}
            onClick={onNavigate}
          >
            <span className="sidebar__link-icon" aria-hidden="true">
              {item.icon}
            </span>
            {t(item.labelKey)}
          </Link>
        ))}
      </nav>

      <div className="sidebar__footer">
        <p className="sidebar__footer-note">{t('common.appName')}</p>
      </div>
    </aside>
  );
}
