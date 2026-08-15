'use client';

import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { Sidebar } from './Sidebar';
import { UserMenu } from './UserMenu';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

/**
 * The admin shell: responsive sidebar + header (store badge + user menu) +
 * page content.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { store } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar
        storeName={store?.name}
        storeSlug={store?.slug}
        mobileOpen={mobileOpen}
        onNavigate={() => setMobileOpen(false)}
      />

      {mobileOpen ? (
        <button
          type="button"
          className="app-shell__overlay"
          aria-label={t('userMenu.closeNav')}
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="app-shell__main">
        <header className="topbar">
          <button
            type="button"
            className="topbar__menu-toggle"
            aria-label={t('userMenu.toggleNav')}
            onClick={() => setMobileOpen((current) => !current)}
          >
            ☰
          </button>
          <div className="topbar__store">
            <span className="topbar__store-name">{store?.name ?? 'Ziad Store'}</span>
            <span className="topbar__store-slug">{store ? `/${store.slug}` : ''}</span>
          </div>
          <div className="topbar__spacer" />
          <div className="topbar__actions">
            <LanguageSwitcher />
            <UserMenu />
          </div>
        </header>

        <main className="app-shell__content">{children}</main>
      </div>
    </div>
  );
}
