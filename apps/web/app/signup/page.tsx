'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { isEmail } from '@/lib/utils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** Session-storage key carrying the store name from signup to onboarding. */
export const ONBOARDING_STORE_NAME_KEY = 'ziad.onboarding.storeName';

/**
 * Maps a Supabase Auth signup error to a localized, user-friendly message
 * where a translation key exists (Phase 18 — no hardcoded English strings).
 * Unknown Supabase messages are kept verbatim because they are dynamic data
 * from the auth provider, not strings we hardcode.
 */
function localizedSignupError(error: { message?: string }, t: (key: TranslationKey) => string): string {
  const message = error.message ?? '';
  if (/already registered|already been registered/i.test(message)) {
    return t('auth.emailInUse');
  }
  if (/rate limit|too many requests/i.test(message)) {
    return t('auth.signupRateLimited');
  }
  if (/network/i.test(message)) {
    return t('errors.NETWORK');
  }
  return message || t('auth.signUpFailed');
}

/**
 * Merchant registration (Phase 17).
 *
 * 1. Creates the Supabase Auth account (email + password). The password is
 *    NEVER stored in our application database — Supabase Auth owns credentials.
 * 2. First/last name are stored in Supabase user_metadata so they survive the
 *    email-confirmation flow and prefill the onboarding step.
 * 3. When email confirmation is enabled the user is told to check their inbox;
 *    when a session is returned directly they are routed into /onboarding,
 *    where the application User + Store + membership are created idempotently
 *    by the backend.
 */
export default function SignUpPage() {
  const { t } = useI18n();
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [firstNameError, setFirstNameError] = useState<string | undefined>();
  const [lastNameError, setLastNameError] = useState<string | undefined>();
  const [storeNameError, setStoreNameError] = useState<string | undefined>();
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFirstNameError(undefined);
    setLastNameError(undefined);
    setStoreNameError(undefined);
    setEmailError(undefined);
    setPasswordError(undefined);
    setConfirmError(undefined);

    let valid = true;
    if (!firstName.trim()) {
      setFirstNameError(t('auth.firstNameRequired'));
      valid = false;
    }
    if (!lastName.trim()) {
      setLastNameError(t('auth.lastNameRequired'));
      valid = false;
    }
    if (!storeName.trim()) {
      setStoreNameError(t('auth.storeNameRequired'));
      valid = false;
    }
    if (!email.trim()) {
      setEmailError(t('auth.emailRequired'));
      valid = false;
    } else if (!isEmail(email)) {
      setEmailError(t('auth.emailInvalid'));
      valid = false;
    }
    if (!password) {
      setPasswordError(t('auth.passwordRequired'));
      valid = false;
    } else if (password.length < 6) {
      setPasswordError(t('auth.passwordMin'));
      valid = false;
    }
    if (confirm !== password) {
      setConfirmError(t('auth.passwordMismatch'));
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      const { data, error } = await getSupabaseBrowserClient().auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          },
        },
      });
      if (error) {
        setFormError(localizedSignupError(error, t));
        return;
      }

      // Carry the store name (only) across to the onboarding step.
      try {
        window.sessionStorage.setItem(ONBOARDING_STORE_NAME_KEY, storeName.trim());
      } catch {
        // Session storage unavailable — the merchant can type it in onboarding.
      }

      if (data.session) {
        // Email confirmation is disabled — go straight to onboarding, where the
        // application User + Store + membership are created.
        router.replace('/onboarding');
        return;
      }
      setNeedsConfirmation(true);
    } catch {
      setFormError(t('auth.signUpFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  if (needsConfirmation) {
    return (
      <div className="login">
        <div className="login__language">
          <LanguageSwitcher />
        </div>
        <div className="login__brand">
          <span className="login__logo" aria-hidden="true">
            Z
          </span>
          <span className="login__brand-name">{t('common.appName')}</span>
        </div>
        <div className="login__card">
          <h1 className="login__title">{t('auth.confirmTitle')}</h1>
          <p className="login__subtitle">{t('auth.confirmDesc', { email: email.trim() })}</p>
          <div className="login__form">
            <Link href="/login" className="btn btn--primary btn--lg login__submit">
              {t('auth.signInInstead')}
            </Link>
          </div>
          <p className="login__footnote">{t('auth.backToLogin')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login">
      <div className="login__language">
        <LanguageSwitcher />
      </div>

      <div className="login__brand">
        <span className="login__logo" aria-hidden="true">
          Z
        </span>
        <span className="login__brand-name">{t('common.appName')}</span>
      </div>

      <div className="login__card">
        <h1 className="login__title">{t('auth.signUpTitle')}</h1>
        <p className="login__subtitle">{t('auth.signUpSubtitle')}</p>

        {formError ? (
          <div className="alert alert--error" role="alert">
            {formError}
          </div>
        ) : null}

        <form className="login__form" onSubmit={handleSubmit} noValidate>
          <div className="form-grid form-grid--two">
            <Field
              label={t('auth.firstName')}
              htmlFor="first-name"
              required
              error={firstNameError}
            >
              <Input
                id="first-name"
                name="first-name"
                autoComplete="given-name"
                placeholder={t('auth.firstNamePlaceholder')}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>

            <Field
              label={t('auth.lastName')}
              htmlFor="last-name"
              required
              error={lastNameError}
            >
              <Input
                id="last-name"
                name="last-name"
                autoComplete="family-name"
                placeholder={t('auth.lastNamePlaceholder')}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
          </div>


          <Field label={t('auth.storeName')} htmlFor="store-name" required error={storeNameError}>
            <Input
              id="store-name"
              name="store-name"
              placeholder={t('auth.storeNamePlaceholder')}
              value={storeName}
              onChange={(event) => setStoreName(event.target.value)}
            />
          </Field>

          <Field label={t('auth.email')} htmlFor="email" required error={emailError}>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="merchant@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field label={t('auth.password')} htmlFor="password" required error={passwordError}>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Field
            label={t('auth.confirmPassword')}
            htmlFor="confirm-password"
            required
            error={confirmError}
          >
            <Input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>

          <Button type="submit" className="login__submit" size="lg" loading={submitting}>
            {submitting ? t('auth.signingUp') : t('auth.signUp')}
          </Button>
        </form>

        <p className="login__footnote">
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="link">
            {t('auth.signIn')}
          </Link>
        </p>
        <p className="login__footnote">{t('auth.signUpNote')}</p>
      </div>
    </div>
  );
}

