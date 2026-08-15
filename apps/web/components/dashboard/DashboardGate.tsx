'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { merchantHomePath } from '@/lib/auth/merchant-route';
import { AdminShell } from './AdminShell';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Protects dashboard routes:
 * - while the session is loading -> full-screen spinner
 * - no session -> redirect to /login
 * - signed in but no Store/membership yet -> redirect to /onboarding
 *   (the merchant must create their store before entering the dashboard)
 * - authenticated with a resolved Store -> renders the admin shell
 */
export function DashboardGate({ children }: { children: ReactNode }) {
  const { status, store } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated' && !store) {
      // Authenticated without a store -> onboarding (single routing source).
      router.replace(merchantHomePath(store));
    }
  }, [status, store, router]);

  if (status === 'loading') {
    return (
      <div className="gate-loading" role="status">
        <Spinner />
        <span>{t('gate.loading')}</span>
      </div>
    );
  }

  if (status === 'unauthenticated' || !store) {
    return null;
  }

  return <AdminShell>{children}</AdminShell>;
}
