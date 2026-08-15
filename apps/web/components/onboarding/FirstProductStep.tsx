'use client';

import { useState, type FormEvent } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/FormControls';
import { Card } from '@/components/ui/Card';
import { catalogApi } from '@/lib/api/catalog';
import { apiErrorMessage } from '@/lib/i18n/api-error';
import { poundsToPiastres } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

/**
 * Step 3 — First product. Uses the existing Catalog API:
 * POST /products (creates the product + default variant atomically in DRAFT)
 * and PATCH /variants/:id (sets the price on the default variant). The product
 * is automatically scoped to the merchant's Store through the tenant context.
 */
export function FirstProductStep({
  onDone,
  onSkip,
}: {
  onDone: () => void;
  onSkip: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('0.00');
  const [nameError, setNameError] = useState<string | undefined>();
  const [priceError, setPriceError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    setNameError(undefined);
    setPriceError(undefined);

    let valid = true;
    if (!name.trim()) {
      setNameError(t('onboarding.productNameRequired'));
      valid = false;
    }
    const piastres = poundsToPiastres(price);
    if (!Number.isFinite(piastres)) {
      setPriceError(t('onboarding.priceInvalid'));
      valid = false;
    }
    if (!valid) return;

    setSubmitting(true);
    try {
      const product = await catalogApi.createProduct({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      const defaultVariant =
        product.data.variants.find((variant) => variant.status === 'ACTIVE') ??
        product.data.variants[0];
      if (defaultVariant) {
        await catalogApi.updateVariant(defaultVariant.id, {
          name: name.trim(),
          price: piastres,
        });
      }
      toast.success(t('onboarding.productCreated'));
      onDone();
    } catch (caught) {
      setFormError(apiErrorMessage(caught, t, 'onboarding.productFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="onboarding__heading">
        <h1>{t('onboarding.step3Title')}</h1>
        <p>{t('onboarding.step3Desc')}</p>
      </div>

      {formError ? (
        <div className="alert alert--error" role="alert">
          {formError}
        </div>
      ) : null}

      <Card title={t('onboarding.firstProduct')} description={t('onboarding.firstProductDesc')}>
        <div className="form-grid">
          <Field
            label={t('onboarding.productName')}
            htmlFor="onboarding-product-name"
            required
            error={nameError}
          >
            <Input
              id="onboarding-product-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('onboarding.productNamePlaceholder')}
            />
          </Field>

          <Field label={t('onboarding.productDescription')} htmlFor="onboarding-product-desc">
            <Textarea
              id="onboarding-product-desc"
              rows={4}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <Field
            label={t('onboarding.productPrice')}
            htmlFor="onboarding-product-price"
            hint={t('onboarding.productPriceHint')}
            error={priceError}
          >
            <Input
              id="onboarding-product-price"
              dir="ltr"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <div className="onboarding__actions">
        <Button type="submit" size="lg" loading={submitting}>
          {submitting ? t('onboarding.creatingProduct') : t('onboarding.createProduct')}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onSkip}>
          {t('onboarding.skip')}
        </Button>
      </div>
    </form>
  );
}
