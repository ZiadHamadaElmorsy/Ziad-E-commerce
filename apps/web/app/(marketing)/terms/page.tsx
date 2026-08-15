import type { Metadata } from 'next';
import { LegalPlaceholder } from '@/components/marketing/LegalPlaceholder';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'The Ziad E-commerce Terms of Service. This document is a placeholder until it is finalized.',
};

export default function TermsPage() {
  return <LegalPlaceholder titleKey="marketing.terms.title" />;
}
