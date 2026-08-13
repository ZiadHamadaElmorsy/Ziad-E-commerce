'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { storeApi, type StoreView } from '@/lib/api/store';
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

/**
 * Settings — only exposes sections the real backend supports:
 *  - Store settings  (PATCH /stores/current — name only, per API-SPEC §15)
 *  - Account         (/auth/me — identity + role)
 *  - Subscription    (GET /subscription)
 *  - Payments        (not available yet — Paymob integration is planned)
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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStore();
    void loadSubscription();
  }, [loadStore, loadSubscription]);

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

          <Card title={t('settings.payments')} description={t('settings.paymentsDesc')}>
            <p className="card__muted">{t('settings.paymentsNotAvailable')}</p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
