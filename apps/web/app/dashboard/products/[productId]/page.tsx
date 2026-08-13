'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
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
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea, Select } from '@/components/ui/FormControls';
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
  sku: string;
  price: string;
  compareAtPrice: string;
}

const EMPTY_VARIANT_FORM: VariantFormState = { name: '', sku: '', price: '', compareAtPrice: '' };

export default function ProductDetailsPage() {
  const params = useParams<{ productId: string }>();
  const productId = params.productId;
  const { t } = useI18n();
  const toast = useToast();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [assignedCategories, setAssignedCategories] = useState<CategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit form
  const [name, setName] = useState('');
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
      const [productResult, categoriesResult, assignedResult] = await Promise.all([
        catalogApi.getProduct(productId),
        catalogApi.listCategories({ page: 1, limit: 100 }),
        catalogApi.listProductCategories(productId),
      ]);
      const loaded = productResult.data;
      setProduct(loaded);
      setName(loaded.name);
      setDescription(loaded.description ?? '');
      setCategories(categoriesResult.data);
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

  // Load real inventory levels for every variant of this product.
  useEffect(() => {
    if (!product) return;
    let mounted = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInventoryLoading(true);
    const variantIds = product.variants.map((variant) => variant.id);
    Promise.all(
      variantIds.map((variantId) =>
        inventoryApi
          .getInventory(variantId)
          .then((result) => ({ variantId, view: result.data }))
          .catch(() => ({ variantId, view: null as unknown as InventoryView })),
      ),
    ).then((results) => {
      if (!mounted) return;
      const map: Record<string, InventoryView> = {};
      for (const result of results) {
        if (result.view) map[result.variantId] = result.view;
      }
      setInventory(map);
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

    const payload = {
      name: variantForm.name.trim(),
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

  const unassignedCategories = categories.filter(
    (category) => !assignedCategories.some((assigned) => assigned.id === category.id),
  );

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
        <LoadingBlock label={t('products.details.loading')} />
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
                      <td>{variant.name}</td>
                      <td>{variant.sku ?? '—'}</td>
                      <td>{formatEgpHtml(variant.price)}</td>
                      <td>{formatEgpHtml(variant.compareAtPrice)}</td>
                      <td>
                        <StatusBadge status={variant.status} />
                      </td>
                      <td>
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
                        <td>{variant.name}</td>
                        <td>{level?.onHand ?? '—'}</td>
                        <td>{level?.reserved ?? '—'}</td>
                        <td>{level?.available ?? '—'}</td>
                        <td>
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
            {assignedCategories.length === 0 ? (
              <p className="card__muted">{t('products.details.noCategories')}</p>
            ) : (
              <ul className="category-chip-list">
                {assignedCategories.map((category) => (
                  <li key={category.id} className="category-chip">
                    <Link
                      href={`/dashboard/categories/${category.id}`}
                      className="category-chip__name"
                    >
                      {category.name}
                    </Link>
                    <button
                      type="button"
                      className="category-chip__remove"
                      aria-label={t('products.details.removeAria', { name: category.name })}
                      onClick={() => setRemoveCategory(category)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="assign-category">
              <Select
                aria-label={t('products.details.assignLabel')}
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    void handleAssignCategory(event.target.value);
                  }
                }}
              >
                <option value="">{t('products.details.assignPlaceholder')}</option>
                {unassignedCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              {unassignedCategories.length === 0 ? (
                <p className="card__muted">
                  {categories.length === 0
                    ? t('products.details.noCategoriesExist')
                    : t('products.details.assignedToAll')}
                </p>
              ) : null}
            </div>
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
                  <td>
                    <StatusBadge status={movement.movementType} />
                  </td>
                  <td>{movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}</td>
                  <td>{movement.reason ?? '—'}</td>
                  <td>{movement.onHandAfter}</td>
                  <td>{formatDate(movement.createdAt)}</td>
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
