'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { AdminShell } from './AdminShell';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Protects dashboard routes:
 * - while the session is loading -> full-screen spinner
 * - no session / no store membership -> redirect to /login
 * - authenticated -> renders the admin shell
 */
export function DashboardGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="gate-loading" role="status">
        <Spinner />
        <span>{t('gate.loading')}</span>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  return <AdminShell>{children}</AdminShell>;
}
