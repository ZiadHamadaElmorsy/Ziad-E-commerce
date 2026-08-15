import type { ReactNode } from 'react';
import { StorefrontShell } from '@/components/storefront/StorefrontShell';
import '../storefront.css';

/**
 * Customer-facing storefront (Phase 19). The store is resolved by the backend
 * from the slug (`X-Storefront-Slug` header). Local development serves the
 * storefront at /store/[slug]; production wildcard subdomains
 * (merchant-slug.yourdomain.com) are NOT configured yet — see the phase report.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontShell slug={slug}>{children}</StorefrontShell>;
}
