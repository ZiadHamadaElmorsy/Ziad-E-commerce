import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MarketingNavbar } from '@/components/marketing/MarketingNavbar';
import { MarketingFooter } from '@/components/marketing/MarketingFooter';

export const metadata: Metadata = {
  title: {
    default: 'Ziad E-commerce — Launch your online store',
    template: '%s | Ziad E-commerce',
  },
  description:
    'Ziad E-commerce is the e-commerce platform for merchants: create, manage, and grow your online store — products, inventory, orders, customers, payments, and a published storefront — from one dashboard.',
  openGraph: {
    title: 'Ziad E-commerce — Launch your online store',
    description:
      'Create, manage, and grow your online store from one platform. Products, inventory, orders, customers, payments, and your own published storefront.',
    type: 'website',
    siteName: 'Ziad E-commerce',
  },
};

/**
 * Marketing website layout: sticky navbar + page content + footer. Applies to
 * the public marketing routes (/, /demo, /privacy, /terms) and leaves the
 * /login, /signup and /dashboard experiences untouched.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mk-site">
      <MarketingNavbar />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}
