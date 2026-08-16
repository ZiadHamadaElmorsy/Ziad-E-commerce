'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import type { TranslationKey } from '@/lib/i18n/translations';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { SupportContact } from '@/components/auth/SupportContact';
import { isEmail } from '@/lib/utils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { emailConfirmationRedirectUrl } from '@/lib/config';

/** Session-storage key carrying the store name from signup to onboarding. */
export const ONBOARDING_STORE_NAME_KEY = 'ziad.onboarding.storeName';

/**
 * Inline password-visibility eye icon (the app has no icon library; these are
 * the standard feather/lucide eye + eye-off glyphs, stroke = currentColor so
 * they inherit the button color).
 */
function PasswordEyeIcon({ shown }: { shown: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shown ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

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
  // Independent visibility state per field — toggling one never affects the
  // other, and toggling never clears or resubmits the field's value.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
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
          // Environment-aware redirect target for the email-confirmation link
          // (localhost in development, the production origin in production).
          // This is the ONLY place the confirmation redirect URL is generated.
          emailRedirectTo: emailConfirmationRedirectUrl(),
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
          <SupportContact className="login__footnote" />
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
            <div className="password-input">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="password-input__toggle"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <PasswordEyeIcon shown={showPassword} />
              </button>
            </div>
          </Field>

          <Field
            label={t('auth.confirmPassword')}
            htmlFor="confirm-password"
            required
            error={confirmError}
          >
            <div className="password-input">
              <Input
                id="confirm-password"
                name="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
              />
              <button
                type="button"
                className="password-input__toggle"
                aria-label={showConfirm ? t('auth.hideConfirmPassword') : t('auth.showConfirmPassword')}
                aria-pressed={showConfirm}
                onClick={() => setShowConfirm((visible) => !visible)}
              >
                <PasswordEyeIcon shown={showConfirm} />
              </button>
            </div>
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
        <SupportContact className="login__footnote" />
      </div>
    </div>
  );
}

