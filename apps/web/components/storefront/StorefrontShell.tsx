'use client';

import type { ReactNode } from 'react';
import { StorefrontProvider, useStorefront } from '@/lib/storefront/storefront-context';
import { StorefrontError, StorefrontLoading } from './StorefrontStates';
import { StorefrontHeader } from './StorefrontHeader';
import { StorefrontFooter } from './StorefrontFooter';

/** Wraps children in the theme-driven storefront shell (header + footer). */
function StorefrontThemeShell({ children }: { children: ReactNode }) {
  const { loading, error, themeVariables, reload } = useStorefront();

  if (loading) {
    return (
      <div className="sf-site">
        <StorefrontLoading label="Loading store…" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="sf-site">
        <StorefrontError message={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="sf-site" style={themeVariables}>
      <StorefrontHeader />
      <main className="sf-main">{children}</main>
      <StorefrontFooter />
    </div>
  );
}

/**
 * Storefront shell for one merchant store (Phase 19).
 * The store is resolved server-side by the backend from the slug — the
 * customer-facing storefront never requires a merchant session.
 */
export function StorefrontShell({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <StorefrontProvider slug={slug}>
      <StorefrontThemeShell>{children}</StorefrontThemeShell>
    </StorefrontProvider>
  );
}
