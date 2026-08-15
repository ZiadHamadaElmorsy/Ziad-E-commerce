'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/FormControls';
import { Card } from '@/components/ui/Card';
import { onboardingApi } from '@/lib/api/onboarding';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { slugifyStoreName } from '@/lib/utils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { ONBOARDING_STORE_NAME_KEY } from '@/app/signup/page';

/**
 * Step 1 — Store information. Creates the merchant through the idempotent
 * POST /onboarding/merchant endpoint: the backend provisions the application
 * User (if absent), the Store, the OWNER membership and the TRIAL subscription
 * in one transaction.
 */
export function StoreInfoStep({ onCreated }: { onCreated: () => void }) {
  const { t } = useI18n();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [slugTouched, setSlugTouched] = useState(false);

  const [firstNameError, setFirstNameError] = useState<string | undefined>();
  const [lastNameError, setLastNameError] = useState<string | undefined>();
  const [storeNameError, setStoreNameError] = useState<string | undefined>();
  const [slugError, setSlugError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Prefill the merchant's name from the Supabase session metadata (survives
    // email confirmation) and the store name/slug carried from the signup step.
    // Every setState runs inside async callbacks (never synchronously in the
    // effect body) so SSR/hydration starts with empty values and no
    // set-state-in-effect warning is triggered.
    void Promise.resolve()
      .then(() => {
        try {
          return window.sessionStorage.getItem(ONBOARDING_STORE_NAME_KEY) ?? '';
        } catch {
          return '';
        }
      })
      .then((storeNamePrefill) => {
        if (storeNamePrefill) {
          setStoreName(storeNamePrefill);
          setSlug(slugifyStoreName(storeNamePrefill));
        }
        return getSupabaseBrowserClient().auth.getUser();
      })
      .then(({ data }) => {
        const meta = data.user?.user_metadata as
          | { first_name?: string; last_name?: string }
          | undefined;
        setFirstName((current) => current || meta?.first_name || '');
        setLastName((current) => current || meta?.last_name || '');
      });
  }, []);

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugTouched) {
      setSlug(slugifyStoreName(value));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setFirstNameError(undefined);
    setLastNameError(undefined);
    setStoreNameError(undefined);
    setSlugError(undefined);

    let valid = true;
    if (!firstName.trim()) {
      setFirstNameError(t('onboarding.firstNameRequired'));
      valid = false;
    }
    if (!lastName.trim()) {
      setLastNameError(t('onboarding.lastNameRequired'));
      valid = false;
    }
    if (!storeName.trim()) {
      setStoreNameError(t('onboarding.storeNameRequired'));
      valid = false;
    }
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug) || slug.length > 63) {
      setSlugError(t('onboarding.slugInvalid'));
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      await onboardingApi.createMerchant({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        storeName: storeName.trim(),
        slug: slug.trim(),
        currency: currency || undefined,
      });
      onCreated();
    } catch (caught) {
      setFormError(apiErrorMessage(caught, t, 'onboarding.createFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="onboarding__heading">
        <h1>{t('onboarding.step1Title')}</h1>
        <p>{t('onboarding.step1Desc')}</p>
      </div>

      {formError ? (
        <div className="alert alert--error" role="alert">
          {formError}
        </div>
      ) : null}

      <Card title={t('onboarding.yourIdentity')}>
        <div className="form-grid form-grid--two">
          <Field
            label={t('onboarding.firstName')}
            htmlFor="onboarding-first-name"
            required
            error={firstNameError}
          >
            <Input
              id="onboarding-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              autoComplete="given-name"
            />
          </Field>
          <Field
            label={t('onboarding.lastName')}
            htmlFor="onboarding-last-name"
            required
            error={lastNameError}
          >
            <Input
              id="onboarding-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              autoComplete="family-name"
            />
          </Field>
        </div>
      </Card>

      <Card title={t('onboarding.storeInfo')} description={t('onboarding.storeInfoDesc')}>
        <div className="form-grid form-grid--two">
          <Field
            label={t('onboarding.storeName')}
            htmlFor="onboarding-store-name"
            required
            error={storeNameError}
          >
            <Input
              id="onboarding-store-name"
              value={storeName}
              onChange={(event) => handleStoreNameChange(event.target.value)}
              placeholder={t('onboarding.storeNamePlaceholder')}
            />
          </Field>

          <Field
            label={t('onboarding.slug')}
            htmlFor="onboarding-slug"
            hint={t('onboarding.slugHint')}
            error={slugError}
          >
            <Input
              id="onboarding-slug"
              dir="ltr"
              value={slug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(slugifyStoreName(event.target.value));
              }}
            />
          </Field>

          <Field label={t('onboarding.currency')} htmlFor="onboarding-currency">
            <Select
              id="onboarding-currency"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="EGP">EGP — Egyptian Pound</option>
            </Select>
          </Field>
        </div>
      </Card>

      <div className="onboarding__actions">
        <Button type="submit" size="lg" loading={submitting}>
          {submitting ? t('onboarding.creating') : t('onboarding.createStore')}
        </Button>
      </div>
    </form>
  );
}

