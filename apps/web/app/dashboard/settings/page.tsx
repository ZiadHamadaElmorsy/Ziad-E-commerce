'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { storeApi, type StoreView, type WhatsAppSettingsView } from '@/lib/api/store';
import { subscriptionApi } from '@/lib/api/subscription';
import type { SubscriptionView } from '@/lib/api/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { formatDate, titleCase } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/** International WhatsApp phone: 1-3 digit country code + 7-13 digit number. */
const WHATSAPP_PHONE_PATTERN = /^\+?[0-9\s\-()]{9,18}$/;

/** Builds the digits-only E.164 value sent to the API (the API normalizes it). */
function toDigits(value: string): string {
  return value.replace(/\s/g, '');
}

/**
 * Settings — only exposes sections the real backend supports:
 *  - Store settings  (PATCH /stores/current — name only, per API-SPEC §15)
 *  - WhatsApp orders (Phase 22 — GET/PUT /stores/current/settings/whatsapp)
 *  - Account         (/auth/me — identity + role)
 *  - Subscription    (GET /subscription)
 *  - Localization    (currency + timezone from the store, read-only)
 */
export default function SettingsPage() {
  const { user, membership, refreshMe } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  const [store, setStore] = useState<StoreView | null>(null);
  const [storeLoading, setStoreLoading] = useState(true);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const [subscription, setSubscription] = useState<SubscriptionView | null>(null);
  const [subLoading, setSubLoading] = useState(true);
  const [subError, setSubError] = useState<string | null>(null);

  // WhatsApp ordering (Phase 22).
  const [whatsapp, setWhatsapp] = useState<WhatsAppSettingsView['whatsapp'] | null>(null);
  const [whatsappLoading, setWhatsappLoading] = useState(true);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [whatsappLabel, setWhatsappLabel] = useState('');
  const [whatsappNumberError, setWhatsappNumberError] = useState<string | undefined>();
  const [whatsappSaving, setWhatsappSaving] = useState(false);

  const loadStore = useCallback(async () => {
    setStoreLoading(true);
    setStoreError(null);
    try {
      const result = await storeApi.getCurrentStore();
      setStore(result.data);
      setName(result.data.name);
    } catch (caught) {
      setStoreError(apiErrorMessage(caught, t, 'settings.storeUpdateFailed'));
    } finally {
      setStoreLoading(false);
    }
  }, [t]);

  const loadSubscription = useCallback(async () => {
    setSubLoading(true);
    setSubError(null);
    try {
      const result = await subscriptionApi.getCurrent();
      setSubscription(result.data);
    } catch (caught) {
      setSubError(apiErrorMessage(caught, t, 'settings.subscriptionLoadFailed'));
    } finally {
      setSubLoading(false);
    }
  }, [t]);

  const loadWhatsApp = useCallback(async () => {
    setWhatsappLoading(true);
    setWhatsappError(null);
    try {
      const result = await storeApi.getWhatsAppSettings();
      setWhatsapp(result.data.whatsapp);
      setWhatsappEnabled(result.data.whatsapp.enabled);
      setWhatsappNumber(result.data.whatsapp.phoneNumber);
      setWhatsappLabel(result.data.whatsapp.label ?? '');
    } catch (caught) {
      setWhatsappError(apiErrorMessage(caught, t, 'settings.whatsappLoadFailed'));
    } finally {
      setWhatsappLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStore();
    void loadSubscription();
    void loadWhatsApp();
  }, [loadStore, loadSubscription, loadWhatsApp]);

  const handleSaveWhatsApp = async (event: FormEvent) => {
    event.preventDefault();
    setWhatsappNumberError(undefined);
    const digits = toDigits(whatsappNumber.trim());
    if (whatsappEnabled && !WHATSAPP_PHONE_PATTERN.test(whatsappNumber.trim())) {
      setWhatsappNumberError(t('settings.whatsappInvalidNumber'));
      return;
    }
    setWhatsappSaving(true);
    try {
      const result = await storeApi.updateWhatsAppSettings({
        whatsapp: {
          enabled: whatsappEnabled,
          phoneNumber: digits,
          ...(whatsappLabel.trim() ? { label: whatsappLabel.trim() } : {}),
        },
      });
      setWhatsapp(result.data.whatsapp);
      toast.success(t('settings.whatsappUpdatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'settings.whatsappUpdateFailed'));
    } finally {
      setWhatsappSaving(false);
    }
  };

  const handleSaveStore = async (event: FormEvent) => {
    event.preventDefault();
    setNameError(undefined);
    if (!name.trim()) {
      setNameError(t('settings.storeNameRequired'));
      return;
    }
    setSaving(true);
    try {
      const result = await storeApi.updateCurrentStore({ name: name.trim() });
      setStore(result.data);
      await refreshMe();
      toast.success(t('settings.storeUpdatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'settings.storeUpdateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('settings.title')} description={t('settings.desc')} />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card title={t('settings.store')} description={t('settings.storeDesc')}>
            {storeError ? (
              <ErrorState message={storeError} onRetry={() => void loadStore()} />
            ) : storeLoading || !store ? (
              <LoadingBlock label={t('common.loading')} />
            ) : (
              <form onSubmit={handleSaveStore} noValidate>
                <div className="form-grid">
                  <Field
                    label={t('settings.storeName')}
                    htmlFor="settings-store-name"
                    required
                    error={nameError}
                  >
                    <Input
                      id="settings-store-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="form-actions">
                  <Button type="submit" loading={saving}>
                    {saving ? t('common.saving') : t('common.saveChanges')}
                  </Button>
                </div>
              </form>
            )}
          </Card>

          <Card title={t('settings.subscription')} description={t('settings.subscriptionDesc')}>
            {subError ? (
              <ErrorState message={subError} onRetry={() => void loadSubscription()} />
            ) : subLoading || !subscription ? (
              <LoadingBlock label={t('common.loading')} />
            ) : (
              <dl className="meta-list meta-list--grid">
                <div>
                  <dt>{t('settings.subscriptionStatus')}</dt>
                  <dd>
                    <StatusBadge status={subscription.status} />
                  </dd>
                </div>
                <div>
                  <dt>{t('settings.trialStarted')}</dt>
                  <dd>{formatDate(subscription.trialStartedAt)}</dd>
                </div>
                <div>
                  <dt>{t('settings.trialEnds')}</dt>
                  <dd>{formatDate(subscription.trialEndsAt)}</dd>
                </div>
                <div>
                  <dt>{t('settings.activated')}</dt>
                  <dd>{formatDate(subscription.activatedAt)}</dd>
                </div>
                <div>
                  <dt>{t('settings.expires')}</dt>
                  <dd>{formatDate(subscription.expiresAt)}</dd>
                </div>
              </dl>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title={t('settings.account')} description={t('settings.accountDesc')}>
            <dl className="meta-list">
              <div>
                <dt>{t('settings.email')}</dt>
                <dd>{user?.email ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('settings.role')}</dt>
                <dd>{membership ? titleCase(membership.role) : '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card title={t('settings.localization')} description={t('settings.localizationDesc')}>
            <dl className="meta-list">
              <div>
                <dt>{t('settings.currency')}</dt>
                <dd>{store?.currency ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('settings.timezone')}</dt>
                <dd>{store?.timezone ?? '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card title={t('settings.whatsapp')} description={t('settings.whatsappDesc')}>
            {whatsappError ? (
              <ErrorState message={whatsappError} onRetry={() => void loadWhatsApp()} />
            ) : whatsappLoading || !whatsapp ? (
              <LoadingBlock label={t('common.loading')} />
            ) : (
              <form onSubmit={handleSaveWhatsApp} noValidate>
                <div className="form-grid">
                  <label className="field">
                    <span className="field__label">
                      <input
                        type="checkbox"
                        className="checkbox"
                        checked={whatsappEnabled}
                        onChange={(event) => setWhatsappEnabled(event.target.checked)}
                        data-testid="whatsapp-enabled"
                      />{' '}
                      {t('settings.whatsappEnabled')}
                    </span>
                    <span className="field__hint">{t('settings.whatsappEnabledDesc')}</span>
                  </label>

                  <Field
                    label={t('settings.whatsappNumber')}
                    htmlFor="settings-whatsapp-number"
                    hint={t('settings.whatsappNumberHint')}
                    error={whatsappNumberError}
                  >
                    <Input
                      id="settings-whatsapp-number"
                      value={whatsappNumber}
                      onChange={(event) => setWhatsappNumber(event.target.value)}
                      inputMode="tel"
                      autoComplete="tel"
                      dir="ltr"
                    />
                  </Field>

                  <Field
                    label={t('settings.whatsappLabel')}
                    htmlFor="settings-whatsapp-label"
                    error={undefined}
                  >
                    <Input
                      id="settings-whatsapp-label"
                      value={whatsappLabel}
                      onChange={(event) => setWhatsappLabel(event.target.value)}
                    />
                  </Field>
                </div>
                {!whatsappEnabled ? (
                  <p className="form-hint" data-testid="whatsapp-disabled-warning">
                    {t('settings.whatsappDisabledWarning')}
                  </p>
                ) : null}
                <div className="form-actions">
                  <Button type="submit" loading={whatsappSaving}>
                    {whatsappSaving ? t('common.saving') : t('common.saveChanges')}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
