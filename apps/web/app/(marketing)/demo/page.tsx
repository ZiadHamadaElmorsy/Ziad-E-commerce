import type { Metadata } from 'next';
import { DemoTour } from '@/components/marketing/DemoTour';

export const metadata: Metadata = {
  title: 'Demo — see the merchant dashboard',
  description:
    'A visual tour of the Ziad E-commerce merchant dashboard, storefront, CMS, and payments — exactly as merchants experience them.',
};

/**
 * Demo / product experience page.
 */
export default function DemoPage() {
  return <DemoTour />;
}
