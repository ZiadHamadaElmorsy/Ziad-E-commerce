'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/FormControls';
import { useToast } from '@/components/ui/Toast';
import { apiErrorMessage } from '@/lib/i18n/api-error';

export default function NewCategoryPage() {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();

  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNameError(undefined);

    if (!name.trim()) {
      setNameError(t('categories.new.nameRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await catalogApi.createCategory({
        name: name.trim(),
        nameAr: nameAr.trim() || undefined,
        nameEn: nameEn.trim() || undefined,
        description: description.trim() || undefined,
      });
      toast.success(t('categories.new.createdToast'));
      router.replace(`/dashboard/categories/${result.data.id}`);
    } catch (caught) {
      const message = apiErrorMessage(caught, t, 'categories.new.failed');
      setFormError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title={t('categories.new.title')}
        description={t('categories.new.desc')}
        actions={
          <Link href="/dashboard/categories" className="btn btn--ghost btn--md">
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
                placeholder="T-Shirts"
                autoFocus
              />
            </Field>
            <Field
              label={t('categories.nameAr')}
              htmlFor="name-ar"
              hint={t('products.details.nameArHint')}
            >
              <Input
                id="name-ar"
                value={nameAr}
                onChange={(event) => setNameAr(event.target.value)}
                dir="rtl"
                placeholder="تيشيرتات"
              />
            </Field>
            <Field
              label={t('categories.nameEn')}
              htmlFor="name-en"
              hint={t('products.details.nameEnHint')}
            >
              <Input
                id="name-en"
                value={nameEn}
                onChange={(event) => setNameEn(event.target.value)}
                placeholder="T-Shirts"
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
                placeholder="Describe the collection…"
              />
            </Field>
          </div>
        </Card>

        <div className="form-actions">
          <Button type="submit" loading={submitting}>
            {submitting ? t('categories.new.creating') : t('categories.new.submit')}
          </Button>
        </div>
      </form>
    </div>
  );
}
