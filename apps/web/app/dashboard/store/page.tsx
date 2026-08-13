'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useAuth } from '@/lib/auth/auth-context';
import { storeApi, type StoreView } from '@/lib/api/store';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { titleCase } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/**
 * Store information page. Everything is loaded from the real backend: the
 * authenticated identity comes from /auth/me (resolved in AuthProvider) and
 * the store details come from GET /stores/current. The store name is editable
 * through PATCH /stores/current (the only mutable store field per API-SPEC).
 */
export default function StorePage() {
  const { user, store: meStore, membership, refreshMe } = useAuth();
  const { t } = useI18n();
  const toast = useToast();

  const [store, setStore] = useState<StoreView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await storeApi.getCurrentStore();
      setStore(result.data);
      setName(result.data.name);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'store.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleSaveName = async (event: FormEvent) => {
    event.preventDefault();
    if (!store) return;
    setNameError(undefined);
    if (!name.trim()) {
      setNameError(t('store.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const result = await storeApi.updateCurrentStore({ name: name.trim() });
      setStore(result.data);
      await refreshMe();
      toast.success(t('store.updatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'store.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <PageHeader title={t('store.title')} description={t('store.desc')} />

      {error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingBlock label={t('store.loading')} />
      ) : (
        <div className="detail-grid">
          <div className="detail-grid__main">
            <Card title={t('store.information')} description={t('store.informationDesc')}>
              {store ? (
                <dl className="meta-list meta-list--grid">
                  <div>
                    <dt>{t('store.name')}</dt>
                    <dd>{store.name}</dd>
                  </div>
                  <div>
                    <dt>{t('store.slug')}</dt>
                    <dd>{store.slug}</dd>
                  </div>
                  <div>
                    <dt>{t('store.status')}</dt>
                    <dd>
                      <StatusBadge status={store.status} />
                    </dd>
                  </div>
                  <div>
                    <dt>{t('store.currency')}</dt>
                    <dd>{store.currency}</dd>
                  </div>
                  <div>
                    <dt>{t('store.timezone')}</dt>
                    <dd>{store.timezone}</dd>
                  </div>
                  <div>
                    <dt>{t('store.description')}</dt>
                    <dd>{store.description ?? '—'}</dd>
                  </div>
                </dl>
              ) : (
                <p className="card__muted">{meStore?.name ?? '—'}</p>
              )}
            </Card>

            <Card title={t('store.editName')}>
              <form onSubmit={handleSaveName} noValidate>
                <div className="form-grid">
                  <Field
                    label={t('store.nameLabel')}
                    htmlFor="store-name"
                    required
                    error={nameError}
                  >
                    <Input
                      id="store-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </Field>
                </div>
                <div className="form-actions">
                  <Button type="submit" loading={saving}>
                    {saving ? t('common.saving') : t('store.saveName')}
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          <aside className="detail-grid__side">
            <Card title={t('store.yourAccount')} description={t('store.yourAccountDesc')}>
              <dl className="meta-list">
                <div>
                  <dt>{t('store.email')}</dt>
                  <dd>{user?.email ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('store.store')}</dt>
                  <dd>{meStore?.name ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('store.storeSlug')}</dt>
                  <dd>{meStore?.slug ?? '—'}</dd>
                </div>
                <div>
                  <dt>{t('store.membershipRole')}</dt>
                  <dd>{membership ? titleCase(membership.role) : '—'}</dd>
                </div>
              </dl>
            </Card>
          </aside>
        </div>
      )}
    </div>
  );
}
