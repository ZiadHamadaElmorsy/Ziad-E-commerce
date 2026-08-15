import { HeroSection } from '@/components/marketing/HeroSection';
import { TrustSection } from '@/components/marketing/TrustSection';
import { ProductIntroduction } from '@/components/marketing/ProductIntroduction';
import { FeaturesSection } from '@/components/marketing/FeaturesSection';
import { DashboardShowcase } from '@/components/marketing/DashboardShowcase';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { StorefrontShowcase } from '@/components/marketing/StorefrontShowcase';
import { CmsShowcase } from '@/components/marketing/CmsShowcase';
import { PaymentsSection } from '@/components/marketing/PaymentsSection';
import { PricingSection } from '@/components/marketing/PricingSection';
import { FaqSection } from '@/components/marketing/FaqSection';
import { FinalCta } from '@/components/marketing/FinalCta';

/**
 * Ziad E-commerce marketing homepage — the public root experience.
 * All sections are composed here in document order for a single-pass page.
 */
export default function MarketingHomePage() {
  return (
    <>
      <HeroSection />
      <TrustSection />
      <ProductIntroduction />
      <FeaturesSection />
      <DashboardShowcase />
      <HowItWorks />
      <StorefrontShowcase />
      <CmsShowcase />
      <PaymentsSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
    </>
  );
}
