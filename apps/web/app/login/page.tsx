'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { merchantHomePath } from '@/lib/auth/merchant-route';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { isEmail } from '@/lib/utils';

/** Login form (rendered inside AuthProvider so it can react to sessions). */
function LoginForm() {
  const { status, store, signIn } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already authenticated -> the merchant home (dashboard when a store exists,
  // onboarding otherwise) via the single routing source of truth. Routing
  // directly to onboarding avoids a /dashboard -> /onboarding bounce.
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(merchantHomePath(store));
    }
  }, [status, store, router]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setEmailError(undefined);
    setPasswordError(undefined);

    let valid = true;
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
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      // On success the AuthProvider status flips to authenticated and the
      // effect above redirects to /dashboard.
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('auth.signInFailed'));
    } finally {
      setSubmitting(false);
    }
  };

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
        <h1 className="login__title">{t('auth.signInTitle')}</h1>
        <p className="login__subtitle">{t('auth.signInSubtitle')}</p>

        {formError ? (
          <div className="alert alert--error" role="alert">
            {formError}
          </div>
        ) : null}

        <form className="login__form" onSubmit={handleSubmit} noValidate>
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
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          <Button type="submit" className="login__submit" size="lg" loading={submitting}>
            {submitting ? t('auth.signingIn') : t('auth.signIn')}
          </Button>
        </form>

        <p className="login__footnote">{t('auth.footnote')}</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
