'use client';

import { appConfig, supportPhoneHref } from '@/lib/config';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * Customer-facing support contact line for the authentication screens.
 *
 * Replaces the old internal footnote ("Session is created by Supabase Auth…")
 * with useful support information. The phone number is read from the single
 * project-wide configuration value (NEXT_PUBLIC_SUPPORT_PHONE) — it is never
 * hardcoded here or in the pages. The phone renders as a `tel:` link when it
 * is a real dialable number, and as plain text while the placeholder is set.
 *
 * The number is public by design (a support line is not a secret) and is
 * never sent to the backend.
 */
export function SupportContact({ className }: { className?: string }) {
  const { t } = useI18n();
  const phone = appConfig.supportPhone.trim();

  if (!phone) return null;

  const href = supportPhoneHref(phone);

  return (
    <p className={className}>
      {t('auth.supportMessage')}{' '}
      {href ? (
        <a href={href} className="link" dir="ltr">
          {phone}
        </a>
      ) : (
        // Placeholder value (e.g. "+20XXXXXXX") — not dialable, render as text.
        <span dir="ltr">{phone}</span>
      )}
    </p>
  );
}
