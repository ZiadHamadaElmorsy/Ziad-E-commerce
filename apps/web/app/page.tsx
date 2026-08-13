'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Spinner } from '@/components/ui/Spinner';

/**
 * Entry point. Redirects authenticated merchants to the dashboard and
 * everyone else to the login page.
 */
export default function Home() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    const route = async () => {
      const { data } = await getSupabaseBrowserClient().auth.getSession();
      router.replace(data.session ? '/dashboard' : '/login');
    };
    void route();
  }, [router]);

  return (
    <div className="gate-loading" role="status">
      <Spinner />
      <span>{t('auth.redirecting')}</span>
    </div>
  );
}
