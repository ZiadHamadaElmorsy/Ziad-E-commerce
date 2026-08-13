'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select } from '@/components/ui/FormControls';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';

export default function NewProductPage() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('DRAFT');
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNameError(undefined);

    if (!name.trim()) {
      setNameError(t('products.new.nameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await catalogApi.createProduct({
        name: name.trim(),
        description: description.trim() || undefined,
        status: status === 'DRAFT' ? 'DRAFT' : undefined,
      });
      toast.success(t('products.new.createdToast'));
      router.replace(`/dashboard/products/${result.data.id}`);
    } catch (caught) {
      const message = apiErrorMessage(caught, t, 'products.new.failedToast');
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('products.new.title')}
        description={t('products.new.desc')}
        actions={
          <Link href="/dashboard/products" className="btn btn--ghost btn--md">
            {t('common.cancel')}
          </Link>
        }
      />

      {formError ? (
        <div className="alert alert--error" role="alert">
          {formError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate>
        <Card title={t('common.details')}>
          <div className="form-grid">
            <Field label={t('common.name')} htmlFor="name" required error={nameError}>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Classic T-Shirt"
                autoFocus
              />
            </Field>

            <Field
              label={t('common.description')}
              htmlFor="description"
              hint={t('products.new.descriptionHint')}
            >
              <Textarea
                id="description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the product…"
              />
            </Field>

            <Field label={t('common.status')} htmlFor="status" hint={t('products.new.statusHint')}>
              <Select
                id="status"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="DRAFT">{t('status.DRAFT')}</option>
                <option value="ACTIVE" disabled>
                  {t('products.new.statusActiveDisabled')}
                </option>
                <option value="ARCHIVED" disabled>
                  {t('products.new.statusArchivedDisabled')}
                </option>
              </Select>
            </Field>
          </div>
        </Card>

        <div className="form-actions">
          <Button type="submit" loading={submitting}>
            {submitting ? t('products.new.creating') : t('products.new.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
