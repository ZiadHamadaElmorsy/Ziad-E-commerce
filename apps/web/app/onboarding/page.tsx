'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { merchantHomePath } from '@/lib/auth/merchant-route';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { Spinner } from '@/components/ui/Spinner';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { StoreInfoStep } from '@/components/onboarding/StoreInfoStep';
import { AppearanceStep } from '@/components/onboarding/AppearanceStep';
import { FirstProductStep } from '@/components/onboarding/FirstProductStep';
import { LaunchStep } from '@/components/onboarding/LaunchStep';

export type OnboardingStepId = 1 | 2 | 3 | 4;

const STEPS: Array<{ id: OnboardingStepId; key: TranslationKey }> = [
  { id: 1, key: 'onboarding.step1' },
  { id: 2, key: 'onboarding.step2' },
  { id: 3, key: 'onboarding.step3' },
  { id: 4, key: 'onboarding.step4' },
];

/**
 * Merchant onboarding flow (Phase 17).
 *
 * Routing:
 * - session loading       -> spinner
 * - unauthenticated       -> /login
 * - authenticated + store -> /dashboard (already onboarded)
 * - authenticated, no store -> step-by-step onboarding
 *
 * Step 1 creates the application User + Store + OWNER membership through
 * POST /onboarding/merchant (idempotent). Steps 2-4 are optional quick-start
 * configuration backed by the existing Theme and Catalog APIs.
 */
export default function OnboardingPage() {
  return (
    <AuthProvider>
      <OnboardingFlow />
    </AuthProvider>
  );
}

function OnboardingFlow() {
  const { status, store, refreshMe } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<OnboardingStepId>(1);
  const [storeCreated, setStoreCreated] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated' && store && !storeCreated) {
      // Only auto-skip onboarding when arriving WITH an existing store. After
      // creating the store during this session the merchant continues through
      // the remaining optional quick-start steps. Routing uses the single
      // merchant-routing source of truth.
      router.replace(merchantHomePath(store));
    }
  }, [status, store, storeCreated, router]);

  if (status === 'loading') {
    return (
      <div className="gate-loading" role="status">
        <Spinner />
        <span>{t('gate.loading')}</span>
      </div>
    );
  }

  if (status === 'unauthenticated' || (store && !storeCreated)) {
    return null;
  }

  const handleStoreCreated = async () => {
    // Mark the store as created BEFORE refreshing so the redirect effect above
    // never bounces the merchant back to /dashboard mid-onboarding.
    setStoreCreated(true);
    await refreshMe();
    setStep(2);
  };

  const renderStep = (): ReactNode => {
    switch (step) {
      case 2:
        return <AppearanceStep onDone={() => setStep(3)} onSkip={() => setStep(3)} />;
      case 3:
        return <FirstProductStep onDone={() => setStep(4)} onSkip={() => setStep(4)} />;
      case 4:
        return <LaunchStep />;
      case 1:
      default:
        return <StoreInfoStep onCreated={() => void handleStoreCreated()} />;
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__topbar">
        <div className="onboarding__brand">
          <span className="onboarding__logo" aria-hidden="true">
            Z
          </span>
          <span className="onboarding__brand-name">{t('common.appName')}</span>
        </div>
        <LanguageSwitcher />
      </div>

      <div className="onboarding__card">
        <div className="onboarding__stepper" aria-label={t('onboarding.progress')}>
          {STEPS.map((item, index) => {
            const isCurrent = step === item.id;
            const isDone = (storeCreated && item.id < step) || (storeCreated && item.id === 1);
            return (
              <div
                key={item.id}
                className={
                  isCurrent
                    ? 'onboarding__step onboarding__step--current'
                    : isDone
                      ? 'onboarding__step onboarding__step--done'
                      : 'onboarding__step'
                }
              >
                <span className="onboarding__step-badge">{isDone ? '✓' : index + 1}</span>
                <span className="onboarding__step-label">{t(item.key)}</span>
              </div>
            );
          })}
        </div>

        <div className="onboarding__body">{renderStep()}</div>
      </div>
    </div>
  );
}
