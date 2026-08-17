'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import { inventoryApi } from '@/lib/api/inventory';
import type {
  CategoryView,
  InventoryView,
  MovementView,
  ProductView,
  VariantView,
} from '@/lib/api/types';
import { ProductCategorySelector } from '@/components/dashboard/ProductCategorySelector';
import { ProductGalleryManager } from '@/components/dashboard/ProductGalleryManager';
import { PageHeader } from '@/components/ui/PageHeader';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/FormControls';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingBlock, Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatEgpHtml, formatDate } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/i18n/api-error';

/** Converts a user-entered EGP amount to integer minor units (piastres). */
function toPiastres(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed) || parsed < 0) return undefined;
  return Math.round(parsed * 100);
}

/** Converts integer minor units (piastres) to a displayable EGP amount. */
function fromPiastres(piastres: number | null | undefined): string {
  if (piastres === null || piastres === undefined) return '';
  return (piastres / 100).toFixed(2);
}

interface LifecycleTarget {
  type: 'publish' | 'unpublish' | 'archive';
}

interface VariantFormState {
  name: string;
  color: string;
  size: string;
  sku: string;
  price: string;
  compareAtPrice: string;
}

const EMPTY_VARIANT_FORM: VariantFormState = {
  name: '',
  color: '',
  size: '',
  sku: '',
  price: '',
  compareAtPrice: '',
};

export default function ProductDetailsPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId;
  const { t } = useI18n();
  const toast = useToast();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [assignedCategories, setAssignedCategories] = useState<CategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit form
  const [name, setName] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  // Variant modal
  const [variantModal, setVariantModal] = useState<'create' | 'edit' | null>(null);
  const [editingVariant, setEditingVariant] = useState<VariantView | null>(null);
  const [variantForm, setVariantForm] = useState<VariantFormState>(EMPTY_VARIANT_FORM);
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({});
  const [variantSaving, setVariantSaving] = useState(false);

  // Confirm dialogs
  const [lifecycleTarget, setLifecycleTarget] = useState<LifecycleTarget | null>(null);
  const [archiveVariant, setArchiveVariant] = useState<VariantView | null>(null);
  const [removeCategory, setRemoveCategory] = useState<CategoryView | null>(null);
  const [acting, setActing] = useState(false);

  // Inventory
  const [inventory, setInventory] = useState<Record<string, InventoryView>>({});
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [adjustVariant, setAdjustVariant] = useState<VariantView | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustErrors, setAdjustErrors] = useState<Record<string, string>>({});
  const [adjustSaving, setAdjustSaving] = useState(false);
  const [movements, setMovements] = useState<MovementView[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productResult, assignedResult] = await Promise.all([
        catalogApi.getProduct(productId),
        catalogApi.listProductCategories(productId),
      ]);
      const loaded = productResult.data;
      setProduct(loaded);
      setName(loaded.name);
      setNameAr(loaded.nameAr ?? '');
      setNameEn(loaded.nameEn ?? '');
      setDescription(loaded.description ?? '');
      setAssignedCategories(assignedResult.data);
    } catch (caught) {
      setError(apiErrorMessage(caught, t, 'products.details.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [productId, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Load real inventory levels for EVERY variant of this product with ONE
  // aggregate request (Phase 25 — previously one authenticated API request per
  // variant, each paying its own Supabase auth + tenant round-trips).
  useEffect(() => {
    if (!product) return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInventoryLoading(true);
    inventoryApi
      .listByProduct(product.id)
      .then((result) => {
        if (!mounted) return;
        const map: Record<string, InventoryView> = {};
        for (const view of result.data) {
          map[view.variantId] = view;
        }
        setInventory(map);
        setInventoryLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setInventory({});
        setInventoryLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [product]);

  // --- Product edit -------------------------------------------------------

  const handleSaveProduct = async (event: FormEvent) => {
    event.preventDefault();
    if (!product) return;
    setNameError(undefined);

    if (!name.trim()) {
      setNameError(t('products.details.nameRequired'));
      return;
    }

    setSaving(true);
    try {
      const result = await catalogApi.updateProduct(product.id, {
        name: name.trim(),
        nameAr: nameAr.trim() || null,
        nameEn: nameEn.trim() || null,
        description: description.trim() ? description.trim() : null,
      });
      setProduct(result.data);
      toast.success(t('products.details.updatedToast'));
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  // --- Product images ---------------------------------------------------------
  // The gallery (upload queue, pagination, reorder, primary, variant links) is
  // rendered by ProductGalleryManager; this page only reloads after changes.

  // --- Lifecycle ------------------------------------------------------------

  const runLifecycle = async () => {
    if (!product || !lifecycleTarget) return;
    setActing(true);
    try {
      const result =
        lifecycleTarget.type === 'publish'
          ? await catalogApi.publishProduct(product.id)
          : lifecycleTarget.type === 'unpublish'
            ? await catalogApi.unpublishProduct(product.id)
            : await catalogApi.archiveProduct(product.id);
      setProduct(result.data);
      toast.success(
        lifecycleTarget.type === 'publish'
          ? t('products.publishedToast')
          : lifecycleTarget.type === 'unpublish'
            ? t('products.unpublishedToast')
            : t('products.archivedToast'),
      );
      setLifecycleTarget(null);
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.lifecycleFailed'));
    } finally {
      setActing(false);
    }
  };

  // --- Variants ---------------------------------------------------------------

  const openCreateVariant = () => {
    setEditingVariant(null);
    setVariantForm(EMPTY_VARIANT_FORM);
    setVariantErrors({});
    setVariantModal('create');
  };

  const openEditVariant = (variant: VariantView) => {
    setEditingVariant(variant);
    setVariantForm({
      name: variant.name,
      color: variant.attributes?.color ?? '',
      size: variant.attributes?.size ?? '',
      sku: variant.sku ?? '',
      price: fromPiastres(variant.price),
      compareAtPrice: fromPiastres(variant.compareAtPrice),
    });
    setVariantErrors({});
    setVariantModal('edit');
  };

  const validateVariantForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!variantForm.name.trim()) errors.name = t('products.details.variantNameRequired');
    if (variantForm.sku.trim().length > 128) errors.sku = t('products.details.variantSkuTooLong');
    const price = toPiastres(variantForm.price);
    if (price === undefined) errors.price = t('products.details.variantPriceInvalid');
    const compareAtPrice = toPiastres(variantForm.compareAtPrice);
    if (variantForm.compareAtPrice.trim() && compareAtPrice === undefined) {
      errors.compareAtPrice = t('products.details.variantCompareInvalid');
    }
    setVariantErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveVariant = async () => {
    if (!product) return;
    if (!validateVariantForm()) return;

    const attributes: Record<string, string> = {};
    if (variantForm.color.trim()) attributes.color = variantForm.color.trim();
    if (variantForm.size.trim()) attributes.size = variantForm.size.trim();

    const payload = {
      name: variantForm.name.trim(),
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      sku: variantForm.sku.trim() || undefined,
      price: toPiastres(variantForm.price) as number,
      compareAtPrice: variantForm.compareAtPrice.trim()
        ? (toPiastres(variantForm.compareAtPrice) as number)
        : null,
    };

    setVariantSaving(true);
    try {
      if (variantModal === 'create') {
        await catalogApi.createVariant(product.id, payload);
        toast.success(t('products.details.variantCreatedToast'));
      } else if (editingVariant) {
        await catalogApi.updateVariant(editingVariant.id, payload);
        toast.success(t('products.details.variantUpdatedToast'));
      }
      setVariantModal(null);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.variantSaveFailed'));
    } finally {
      setVariantSaving(false);
    }
  };

  const runArchiveVariant = async () => {
    if (!archiveVariant) return;
    setActing(true);
    try {
      await catalogApi.archiveVariant(archiveVariant.id);
      toast.success(t('products.details.variantArchivedToast'));
      setArchiveVariant(null);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.variantArchiveFailed'));
    } finally {
      setActing(false);
    }
  };

  // --- Category assignment ------------------------------------------------------

  const handleAssignCategory = async (categoryId: string) => {
    if (!product) return;
    try {
      await catalogApi.assignCategory(product.id, categoryId);
      toast.success(t('products.details.categoryAssignedToast'));
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.categoryAssignFailed'));
    }
  };

  const runRemoveCategory = async () => {
    if (!product || !removeCategory) return;
    setActing(true);
    try {
      await catalogApi.removeCategory(product.id, removeCategory.id);
      toast.success(t('products.details.categoryRemovedToast'));
      setRemoveCategory(null);
      await load();
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'products.details.categoryRemoveFailed'));
    } finally {
      setActing(false);
    }
  };

  // --- Inventory ----------------------------------------------------------------

  const openAdjustVariant = async (variant: VariantView) => {
    setAdjustVariant(variant);
    setAdjustQuantity('');
    setAdjustReason('');
    setAdjustErrors({});
    setMovements([]);
    setMovementsLoading(true);
    try {
      const result = await inventoryApi.listMovements(variant.id, { page: 1, limit: 10 });
      setMovements(result.data);
    } catch {
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  const runAdjustInventory = async () => {
    if (!adjustVariant) return;
    const errors: Record<string, string> = {};
    const quantity = Number(adjustQuantity);
    if (!adjustQuantity.trim() || !Number.isInteger(quantity) || quantity === 0) {
      errors.quantity = t('inventory.adjustFailed');
    }
    if (!adjustReason.trim()) {
      errors.reason = t('inventory.reasonRequired');
    }
    if (Object.keys(errors).length > 0) {
      setAdjustErrors(errors);
      return;
    }
    setAdjustSaving(true);
    try {
      const result = await inventoryApi.adjust(adjustVariant.id, {
        quantity,
        reason: adjustReason.trim(),
      });
      setInventory((current) => ({ ...current, [adjustVariant.id]: result.data }));
      toast.success(t('inventory.adjustedToast'));
      setAdjustVariant(null);
    } catch (caught) {
      toast.error(apiErrorMessage(caught, t, 'inventory.adjustFailed'));
    } finally {
      setAdjustSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton skeleton--line skeleton-title" aria-hidden="true" />
        <div className="detail-grid">
          <div className="detail-grid__main">
            <div className="card" aria-hidden="true">
              <div className="card__body skeleton-form-block">
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block skeleton-form-block__tall" />
              </div>
            </div>
            <div className="card" aria-hidden="true">
              <div className="card__body skeleton-form-block">
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block skeleton-form-block__tall" />
              </div>
            </div>
          </div>
          <aside className="detail-grid__side" aria-hidden="true">
            <div className="card">
              <div className="card__body skeleton-form-block">
                <span className="skeleton skeleton--block" />
                <span className="skeleton skeleton--block" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="page">
        <ErrorState message={error ?? t('products.details.notFound')} onRetry={() => void load()} />
      </div>
    );
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: t('nav.dashboard'), href: '/dashboard' },
          { label: t('nav.products'), href: '/dashboard/products' },
          { label: product.name },
        ]}
      />
      <PageHeader
        title={product.name}
        description={`/${product.slug}`}
        actions={
          <>
            {product.status === 'DRAFT' ? (
              <Button variant="secondary" onClick={() => setLifecycleTarget({ type: 'publish' })}>
                {t('common.publish')}
              </Button>
            ) : null}
            {product.status === 'ACTIVE' ? (
              <Button variant="secondary" onClick={() => setLifecycleTarget({ type: 'unpublish' })}>
                {t('common.unpublish')}
              </Button>
            ) : null}
            {product.status !== 'ARCHIVED' ? (
              <Button variant="danger" onClick={() => setLifecycleTarget({ type: 'archive' })}>
                {t('common.archive')}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="detail-grid">
        <div className="detail-grid__main">
          <Card title={t('common.details')}>
            <form onSubmit={handleSaveProduct} noValidate>
              <div className="form-grid">
                <Field label={t('common.name')} htmlFor="product-name" required error={nameError}>
                  <Input
                    id="product-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('products.details.nameAr')}
                  htmlFor="product-name-ar"
                  hint={t('products.details.nameArHint')}
                >
                  <Input
                    id="product-name-ar"
                    value={nameAr}
                    onChange={(event) => setNameAr(event.target.value)}
                    dir="rtl"
                  />
                </Field>
                <Field
                  label={t('products.details.nameEn')}
                  htmlFor="product-name-en"
                  hint={t('products.details.nameEnHint')}
                >
                  <Input
                    id="product-name-en"
                    value={nameEn}
                    onChange={(event) => setNameEn(event.target.value)}
                  />
                </Field>
                <Field
                  label={t('common.description')}
                  htmlFor="product-description"
                  hint={t('products.new.descriptionHint')}
                >
                  <Textarea
                    id="product-description"
                    rows={4}
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
              </div>
              <div className="form-actions">
                <Button type="submit" loading={saving}>
                  {saving ? t('common.saving') : t('common.saveChanges')}
                </Button>
              </div>
            </form>
          </Card>

          <Card
            title={t('products.details.images')}
            description={t('products.details.imagesDesc')}
          >
            <ProductGalleryManager
              productId={product.id}
              variants={product.variants}
              onChanged={() => void load()}
            />
          </Card>

          <Card
            title={t('products.details.variants')}
            description={
              product.variants.length === 1
                ? t('products.details.variantsDescOne', { count: product.variants.length })
                : t('products.details.variantsDescMany', { count: product.variants.length })
            }
            actions={
              <Button size="sm" onClick={openCreateVariant}>
                {t('products.details.addVariant')}
              </Button>
            }
          >
            {product.variants.length === 0 ? (
              <EmptyState
                icon="◈"
                title={t('products.details.variantsEmpty')}
                description={t('products.details.variantsEmptyDesc')}
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('products.details.sku')}</th>
                    <th>{t('common.price')}</th>
                    <th>{t('products.details.compareAt')}</th>
                    <th>{t('common.status')}</th>
                    <th className="table__actions-head">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => (
                    <tr key={variant.id}>
                      <td data-label={t('common.name')}>{variant.name}</td>
                      <td data-label={t('products.details.sku')}>{variant.sku ?? '—'}</td>
                      <td data-label={t('common.price')}>{formatEgpHtml(variant.price)}</td>
                      <td data-label={t('products.details.compareAt')}>
                        {formatEgpHtml(variant.compareAtPrice)}
                      </td>
                      <td data-label={t('common.status')}>
                        <StatusBadge status={variant.status} />
                      </td>
                      <td data-label="">
                        <div className="table__actions">
                          {variant.status === 'ACTIVE' ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditVariant(variant)}
                            >
                              {t('products.details.edit')}
                            </Button>
                          ) : null}
                          {variant.status === 'ACTIVE' ? (
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => setArchiveVariant(variant)}
                            >
                              {t('common.archive')}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title={t('inventory.title')} description={t('inventory.desc')}>
            {inventoryLoading ? (
              <LoadingBlock label={t('inventory.loading')} />
            ) : product.variants.length === 0 ? (
              <p className="card__muted">{t('products.details.variantsEmpty')}</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('inventory.table.variant')}</th>
                    <th>{t('inventory.onHand')}</th>
                    <th>{t('inventory.reserved')}</th>
                    <th>{t('inventory.available')}</th>
                    <th className="table__actions-head">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((variant) => {
                    const level = inventory[variant.id];
                    return (
                      <tr key={variant.id}>
                        <td data-label={t('inventory.table.variant')}>{variant.name}</td>
                        <td data-label={t('inventory.onHand')}>{level?.onHand ?? '—'}</td>
                        <td data-label={t('inventory.reserved')}>{level?.reserved ?? '—'}</td>
                        <td data-label={t('inventory.available')}>{level?.available ?? '—'}</td>
                        <td data-label="">
                          <div className="table__actions">
                            {variant.status === 'ACTIVE' ? (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void openAdjustVariant(variant)}
                              >
                                {t('inventory.adjust')}
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <aside className="detail-grid__side">
          <Card title={t('common.overview')}>
            <dl className="meta-list">
              <div>
                <dt>{t('common.status')}</dt>
                <dd>
                  <StatusBadge status={product.status} />
                </dd>
              </div>
              <div>
                <dt>{t('products.details.variants')}</dt>
                <dd>{product.variants.length}</dd>
              </div>
            </dl>
          </Card>

          <Card
            title={t('products.details.categories')}
            description={t('products.details.categoriesDesc')}
          >
            <ProductCategorySelector
              value={assignedCategories}
              onChange={(next) => {
                const removed = assignedCategories.filter(
                  (category) => !next.some((c) => c.id === category.id),
                );
                const added = next.filter(
                  (category) => !assignedCategories.some((c) => c.id === category.id),
                );
                setAssignedCategories(next);
                for (const category of added) {
                  void handleAssignCategory(category.id);
                }
                for (const category of removed) {
                  void catalogApi.removeCategory(product.id, category.id).catch((error) => {
                    toast.error(
                      apiErrorMessage(error, t, 'products.details.categoryRemoveFailed'),
                    );
                  });
                }
              }}
            />
          </Card>
        </aside>
      </div>

      <Modal
        open={variantModal === 'create'}
        title={t('products.details.addVariantTitle')}
        description={t('products.details.addVariantDesc')}
        onClose={() => setVariantModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVariantModal(null)} disabled={variantSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSaveVariant()} loading={variantSaving}>
              {variantSaving ? t('common.saving') : t('products.details.addVariant')}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field
            label={t('common.name')}
            htmlFor="variant-name"
            required
            error={variantErrors.name}
          >
            <Input
              id="variant-name"
              value={variantForm.name}
              onChange={(event) => setVariantForm({ ...variantForm, name: event.target.value })}
              placeholder="Black / Medium"
            />
          </Field>
          <Field
            label={t('products.details.color')}
            htmlFor="variant-color"
            hint={t('products.details.colorPlaceholder')}
          >
            <Input
              id="variant-color"
              value={variantForm.color}
              onChange={(event) => setVariantForm({ ...variantForm, color: event.target.value })}
              placeholder={t('products.details.colorPlaceholder')}
            />
          </Field>
          <Field
            label={t('products.details.size')}
            htmlFor="variant-size"
            hint={t('products.details.sizePlaceholder')}
          >
            <Input
              id="variant-size"
              value={variantForm.size}
              onChange={(event) => setVariantForm({ ...variantForm, size: event.target.value })}
              placeholder={t('products.details.sizePlaceholder')}
            />
          </Field>
          <Field label={t('products.details.sku')} htmlFor="variant-sku" error={variantErrors.sku}>
            <Input
              id="variant-sku"
              value={variantForm.sku}
              onChange={(event) => setVariantForm({ ...variantForm, sku: event.target.value })}
              placeholder="TS-BLK-M"
            />
          </Field>
          <Field
            label={t('products.details.priceLabel')}
            htmlFor="variant-price"
            required
            error={variantErrors.price}
          >
            <Input
              id="variant-price"
              type="number"
              min="0"
              step="0.01"
              value={variantForm.price}
              onChange={(event) => setVariantForm({ ...variantForm, price: event.target.value })}
              placeholder="500.00"
            />
          </Field>
          <Field
            label={t('products.details.compareAtLabel')}
            htmlFor="variant-compare"
            error={variantErrors.compareAtPrice}
          >
            <Input
              id="variant-compare"
              type="number"
              min="0"
              step="0.01"
              value={variantForm.compareAtPrice}
              onChange={(event) =>
                setVariantForm({ ...variantForm, compareAtPrice: event.target.value })
              }
              placeholder="600.00"
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={variantModal === 'edit'}
        title={t('products.details.editVariantTitle', { name: editingVariant?.name ?? '' })}
        description={t('products.details.addVariantDesc')}
        onClose={() => setVariantModal(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVariantModal(null)} disabled={variantSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void handleSaveVariant()} loading={variantSaving}>
              {variantSaving ? t('common.saving') : t('products.details.saveVariant')}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field
            label={t('common.name')}
            htmlFor="variant-name-edit"
            required
            error={variantErrors.name}
          >
            <Input
              id="variant-name-edit"
              value={variantForm.name}
              onChange={(event) => setVariantForm({ ...variantForm, name: event.target.value })}
            />
          </Field>
          <Field
            label={t('products.details.color')}
            htmlFor="variant-color-edit"
            hint={t('products.details.colorPlaceholder')}
          >
            <Input
              id="variant-color-edit"
              value={variantForm.color}
              onChange={(event) => setVariantForm({ ...variantForm, color: event.target.value })}
              placeholder={t('products.details.colorPlaceholder')}
            />
          </Field>
          <Field
            label={t('products.details.size')}
            htmlFor="variant-size-edit"
            hint={t('products.details.sizePlaceholder')}
          >
            <Input
              id="variant-size-edit"
              value={variantForm.size}
              onChange={(event) => setVariantForm({ ...variantForm, size: event.target.value })}
              placeholder={t('products.details.sizePlaceholder')}
            />
          </Field>
          <Field
            label={t('products.details.sku')}
            htmlFor="variant-sku-edit"
            error={variantErrors.sku}
          >
            <Input
              id="variant-sku-edit"
              value={variantForm.sku}
              onChange={(event) => setVariantForm({ ...variantForm, sku: event.target.value })}
            />
          </Field>
          <Field
            label={t('products.details.priceLabel')}
            htmlFor="variant-price-edit"
            required
            error={variantErrors.price}
          >
            <Input
              id="variant-price-edit"
              type="number"
              min="0"
              step="0.01"
              value={variantForm.price}
              onChange={(event) => setVariantForm({ ...variantForm, price: event.target.value })}
            />
          </Field>
          <Field
            label={t('products.details.compareAtLabel')}
            htmlFor="variant-compare-edit"
            error={variantErrors.compareAtPrice}
          >
            <Input
              id="variant-compare-edit"
              type="number"
              min="0"
              step="0.01"
              value={variantForm.compareAtPrice}
              onChange={(event) =>
                setVariantForm({ ...variantForm, compareAtPrice: event.target.value })
              }
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={adjustVariant !== null}
        title={t('inventory.adjust')}
        description={
          adjustVariant ? `${adjustVariant.name} — ${t('inventory.adjustDesc')}` : undefined
        }
        onClose={() => setAdjustVariant(null)}
        width="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdjustVariant(null)} disabled={adjustSaving}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void runAdjustInventory()} loading={adjustSaving}>
              {adjustSaving ? t('inventory.adjusting') : t('inventory.adjustSubmit')}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <Field
            label={t('inventory.quantity')}
            htmlFor="adjust-quantity"
            hint={t('inventory.quantityHint')}
            error={adjustErrors.quantity}
          >
            <Input
              id="adjust-quantity"
              type="number"
              step="1"
              value={adjustQuantity}
              onChange={(event) => setAdjustQuantity(event.target.value)}
              placeholder="10"
            />
          </Field>
          <Field
            label={t('inventory.reason')}
            htmlFor="adjust-reason"
            required
            error={adjustErrors.reason}
          >
            <Input
              id="adjust-reason"
              value={adjustReason}
              onChange={(event) => setAdjustReason(event.target.value)}
              placeholder="INITIAL_STOCK"
            />
          </Field>
        </div>

        <h3 className="card__subtitle">{t('inventory.movements')}</h3>
        {movementsLoading ? (
          <LoadingBlock label={t('common.loading')} />
        ) : movements.length === 0 ? (
          <p className="card__muted">{t('inventory.movementsEmpty')}</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>{t('inventory.table.type')}</th>
                <th>{t('inventory.table.quantity')}</th>
                <th>{t('inventory.table.reason')}</th>
                <th>{t('inventory.table.after')}</th>
                <th>{t('inventory.table.date')}</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td data-label={t('inventory.table.type')}>
                    <StatusBadge status={movement.movementType} />
                  </td>
                  <td data-label={t('inventory.table.quantity')}>
                    {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                  </td>
                  <td data-label={t('inventory.table.reason')}>{movement.reason ?? '—'}</td>
                  <td data-label={t('inventory.table.after')}>{movement.onHandAfter}</td>
                  <td data-label={t('inventory.table.date')}>{formatDate(movement.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <ConfirmDialog
        open={lifecycleTarget !== null}
        title={
          lifecycleTarget?.type === 'archive'
            ? t('products.archiveConfirmTitle')
            : lifecycleTarget?.type === 'publish'
              ? t('products.publishConfirmTitle')
              : t('products.unpublishConfirmTitle')
        }
        description={
          lifecycleTarget?.type === 'archive'
            ? t('products.archiveConfirmDesc', { name: product.name })
            : lifecycleTarget?.type === 'publish'
              ? t('products.publishConfirmDesc', { name: product.name })
              : t('products.unpublishConfirmDesc', { name: product.name })
        }
        confirmLabel={
          lifecycleTarget?.type === 'archive'
            ? t('common.archive')
            : lifecycleTarget?.type === 'publish'
              ? t('common.publish')
              : t('common.unpublish')
        }
        tone={lifecycleTarget?.type === 'archive' ? 'danger' : 'primary'}
        loading={acting}
        onConfirm={() => void runLifecycle()}
        onCancel={() => setLifecycleTarget(null)}
      />

      <ConfirmDialog
        open={archiveVariant !== null}
        title={t('products.details.archiveVariantTitle')}
        description={
          archiveVariant
            ? t('products.details.archiveVariantDesc', { name: archiveVariant.name })
            : undefined
        }
        confirmLabel={t('products.details.archiveVariantConfirm')}
        loading={acting}
        onConfirm={() => void runArchiveVariant()}
        onCancel={() => setArchiveVariant(null)}
      />

      <ConfirmDialog
        open={removeCategory !== null}
        title={t('products.details.removeCategoryTitle')}
        description={
          removeCategory
            ? t('products.details.removeCategoryDesc', { name: removeCategory.name })
            : undefined
        }
        confirmLabel={t('common.remove')}
        loading={acting}
        onConfirm={() => void runRemoveCategory()}
        onCancel={() => setRemoveCategory(null)}
      />
    </div>
  );
}
