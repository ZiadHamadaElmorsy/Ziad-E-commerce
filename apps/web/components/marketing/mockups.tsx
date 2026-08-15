import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Pure-presentational "screenshot" primitives used by the marketing website.
 *
 * They intentionally mirror the real merchant dashboard UI language (dark
 * sidebar, green primary, cards, tables, badges) so the marketing site shows
 * the actual product the merchant receives — not an invented design. They are
 * decorative: surrounding copy carries the accessible meaning.
 */

/* ------------------------------------------------------------------ */
/* Browser chrome                                                      */
/* ------------------------------------------------------------------ */

export function BrowserChrome({
  url,
  children,
  className,
}: {
  url: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mk-browser', className)}>
      <div className="mk-browser__bar" aria-hidden="true">
        <span className="mk-browser__dots">
          <i />
          <i />
          <i />
        </span>
        <span className="mk-browser__url">{url}</span>
        <span className="mk-browser__spacer" />
      </div>
      <div className="mk-browser__body">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared bits                                                   */
/* ------------------------------------------------------------------ */

export type PillTone = 'green' | 'amber' | 'gray' | 'red' | 'blue';

export function StatusPill({ tone = 'gray', children }: { tone?: PillTone; children: ReactNode }) {
  return <span className={cn('mk-pill', `mk-pill--${tone}`)}>{children}</span>;
}

export function MockStatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="mk-stat">
      <span className="mk-stat__label">{label}</span>
      <span className="mk-stat__value">{value}</span>
      {delta ? <span className="mk-stat__delta">{delta}</span> : null}
    </div>
  );
}

export function MockTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="mk-table" role="presentation">
      <div className="mk-table__row mk-table__row--head">
        {head.map((cell) => (
          <span key={cell} className="mk-table__cell mk-table__cell--head">
            {cell}
          </span>
        ))}
      </div>
      {rows.map((row, index) => (
        <div className="mk-table__row" key={index}>
          {row.map((cell, cellIndex) => (
            <span className="mk-table__cell" key={cellIndex}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Admin dashboard window (mirrors the real sidebar + topbar)          */
/* ------------------------------------------------------------------ */

export const DASHBOARD_NAV = [
  { key: 'dashboard', icon: '▦', label: 'Dashboard' },
  { key: 'products', icon: '◈', label: 'Products' },
  { key: 'categories', icon: '❖', label: 'Categories' },
  { key: 'orders', icon: '☰', label: 'Orders' },
  { key: 'customers', icon: '☺', label: 'Customers' },
  { key: 'media', icon: '◧', label: 'Media' },
  { key: 'settings', icon: '⚙', label: 'Settings' },
  { key: 'store', icon: '◉', label: 'Store' },
] as const;

export type DashboardNavKey = (typeof DASHBOARD_NAV)[number]['key'];

export function DashboardWindow({
  active,
  storeName = 'Ziad Store',
  storeSlug = '/my-store',
  children,
}: {
  active: DashboardNavKey;
  storeName?: string;
  storeSlug?: string;
  children: ReactNode;
}) {
  return (
    <div className="mk-admin">
      <aside className="mk-admin__sidebar" aria-hidden="true">
        <div className="mk-admin__brand">
          <span className="mk-admin__logo">Z</span>
          <span className="mk-admin__brand-text">
            <strong>{storeName}</strong>
            <small>Admin</small>
          </span>
        </div>
        <nav className="mk-admin__nav">
          {DASHBOARD_NAV.map((item) => (
            <span
              key={item.key}
              className={cn(
                'mk-admin__nav-item',
                item.key === active && 'mk-admin__nav-item--active',
              )}
            >
              <span className="mk-admin__nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </span>
          ))}
        </nav>
        <div className="mk-admin__sidebar-footer">Ziad E-commerce</div>
      </aside>
      <div className="mk-admin__main">
        <div className="mk-admin__topbar" aria-hidden="true">
          <span className="mk-admin__store">
            <strong>{storeName}</strong>
            <small>{storeSlug}</small>
          </span>
          <span className="mk-admin__topbar-spacer" />
          <span className="mk-admin__lang">English ▾</span>
          <span className="mk-admin__avatar">M</span>
        </div>
        <div className="mk-admin__content">{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Storefront window (a merchant's published storefront)               */
/* ------------------------------------------------------------------ */

export function StorefrontWindow({ brand, children }: { brand: string; children?: ReactNode }) {
  return (
    <div className="mk-storefront">
      <div className="mk-storefront__bar" aria-hidden="true">
        <span className="mk-storefront__logo">
          <i />
        </span>
        <span className="mk-storefront__brand">{brand}</span>
        <span className="mk-storefront__nav">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      {children ? <div className="mk-storefront__body">{children}</div> : null}
    </div>
  );
}

/** A storefront product card used inside the storefront mockup. */
export function StorefrontProduct({
  title,
  price,
  tone = 'green',
}: {
  title: string;
  price: string;
  tone?: 'green' | 'gray';
}) {
  return (
    <div className="mk-sf-product">
      <span
        className={cn('mk-sf-product__image', tone === 'gray' && 'mk-sf-product__image--gray')}
      />
      <span className="mk-sf-product__title">{title}</span>
      <span className="mk-sf-product__price">{price}</span>
    </div>
  );
}

/** A storefront hero strip (used to show a published homepage section). */
export function StorefrontHero({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mk-sf-hero">
      <strong>{title}</strong>
      {subtitle ? <span>{subtitle}</span> : null}
      <i />
    </div>
  );
}
