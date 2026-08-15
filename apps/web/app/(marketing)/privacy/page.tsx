import type { Metadata } from 'next';
import { LegalPlaceholder } from '@/components/marketing/LegalPlaceholder';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'The Ziad E-commerce Privacy Policy. This document is a placeholder until it is finalized.',
};

export default function PrivacyPage() {
  return <LegalPlaceholder titleKey="marketing.privacy.title" />;
}
