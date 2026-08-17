'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeCategoryPath, storeProductsPath } from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import { ApiError } from '@/lib/api/client';
import type { StorefrontProduct, StorefrontVariant } from '@/lib/storefront/types';
import { Price } from '@/components/storefront/Price';
import { StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';
import { StorefrontGallery } from '@/components/storefront/StorefrontGallery';
import { useToast } from '@/components/ui/Toast';

/**
 * Storefront product details (Phase 19 + Phase 26).
 *
 * - Category breadcrumbs (Home → Category → Product).
 * - Variant-aware gallery (color/size selectors switch images + price +
 *   inventory without a full page reload).
 * - Quantity/pricing/availability revalidated server-side by the Cart API at
 *   add time.
 */
export default function StoreProductDetailPage() {
  const params = useParams<{ slug: string; productSlug: string }>();
  const productSlug = params.productSlug;
  const { slug } = useStorefront();
  const { t } = useI18n();
  const toast = useToast();
  const { addToCart } = useStorefront();

  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => {
    setProduct(null);
    setError(null);
    void storefrontApi
      .getProductBySlug(slug, productSlug)
      .then((result) => {
        setProduct(result.data);
        const available = result.data.variants.find((variant) => variant.available);
        setSelectedVariantId(available?.id ?? null);
        if (available?.attributes) {
          setSelectedColor(available.attributes.color ?? null);
          setSelectedSize(available.attributes.size ?? null);
        }
      })
      .catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, productSlug, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Any variant carries structured attributes → render color/size selectors.
  const hasAttributes = useMemo(
    () =>
      (product?.variants ?? []).some(
        (variant) => variant.attributes && Object.keys(variant.attributes).length > 0,
      ),
    [product],
  );

  /** Distinct values of an attribute across the product's variants. */
  const attributeValues = useCallback(
    (name: string): string[] => {
      const values = new Set<string>();
      for (const variant of product?.variants ?? []) {
        const value = variant.attributes?.[name];
        if (value) values.add(value);
      }
      return Array.from(values);
    },
    [product],
  );

  const colors = useMemo(() => attributeValues('color'), [attributeValues]);
  const sizes = useMemo(() => attributeValues('size'), [attributeValues]);

  /** The variant matching the current color/size selection (or the radio id). */
  const selectedVariant = useMemo<StorefrontVariant | null>(() => {
    if (!product) return null;
    if (!hasAttributes) {
      return product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
    }
    const candidates = product.variants.filter((variant) => {
      if (!variant.attributes) return false;
      if (selectedColor && variant.attributes.color !== selectedColor) return false;
      if (selectedSize && variant.attributes.size !== selectedSize) return false;
      return true;
    });
    return candidates.find((variant) => variant.available) ?? candidates[0] ?? null;
  }, [product, hasAttributes, selectedVariantId, selectedColor, selectedSize]);

  const anyAvailable = product?.variants.some((variant) => variant.available) ?? false;

  const selectColor = (color: string) => {
    setSelectedColor(color);
    const match = product?.variants.find(
      (variant) => variant.attributes?.color === color && (!selectedSize || variant.attributes.size === selectedSize),
    );
    if (match) setSelectedVariantId(match.id);
  };

  const selectSize = (size: string) => {
    setSelectedSize(size);
    const match = product?.variants.find(
      (variant) => variant.attributes?.size === size && (!selectedColor || variant.attributes.color === selectedColor),
    );
    if (match) setSelectedVariantId(match.id);
  };

  const handleAddToCart = async () => {
    if (!selectedVariant) return;
    setAdding(true);
    try {
      await addToCart(selectedVariant.id, quantity);
      toast.success(t('storefront.addedToCart'));
    } catch (caught) {
      toast.error(caught instanceof ApiError ? caught.message : t('storefront.addToCartFailed'));
    } finally {
      setAdding(false);
    }
  };

  if (error) {
    return <StorefrontError message={error} onRetry={load} />;
  }

  if (!product) {
    return <StorefrontLoading />;
  }

  const lowest = Math.min(...product.variants.map((variant) => variant.price));
  const highest = Math.max(...product.variants.map((variant) => variant.price));
  const primaryCategory = product.categories[0] ?? null;

  return (
    <div className="sf-page">
      <p className="sf-breadcrumbs">
        <Link href={storeProductsPath(slug)}>{t('storefront.products')}</Link>
        {primaryCategory ? (
          <>
            <span aria-hidden="true"> / </span>
            <Link href={storeCategoryPath(slug, primaryCategory.slug)}>
              {primaryCategory.name}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true"> / </span>
        <span aria-current="page">{product.name}</span>
      </p>

      <div className="sf-pdp">
        <div className="sf-pdp__gallery">
          <StorefrontGallery
            productSlug={product.slug}
            productName={product.name}
            initialImages={product.images}
            totalImages={product.totalImages}
            selectedVariantId={selectedVariant?.id ?? null}
          />
        </div>

        <div className="sf-pdp__info">
          <h1 className="sf-pdp__title">{product.name}</h1>
          <p className="sf-pdp__price">
            {selectedVariant ? (
              <Price value={selectedVariant.price} />
            ) : product.variants.length > 1 ? (
              <>
                <Price value={lowest} /> — <Price value={highest} />
              </>
            ) : (
              <Price value={product.variants[0]?.price} />
            )}
          </p>

          {product.description ? <p className="sf-pdp__desc">{product.description}</p> : null}
          {/* Attribute selectors (color/size) — Phase 26 */}
          {hasAttributes ? (
            <>
              {colors.length > 0 ? (
                <fieldset className="sf-fieldset">
                  <legend>{t('storefront.selectColor')}</legend>
                  <div className="sf-options" role="radiogroup" aria-label={t('storefront.selectColor')}>
                    {colors.map((color) => {
                      const availableInColor = product.variants.some(
                        (variant) =>
                          variant.attributes?.color === color &&
                          (!selectedSize || variant.attributes.size === selectedSize) &&
                          variant.available,
                      );
                      const selected = selectedColor === color;
                      return (
                        <button
                          key={color}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!availableInColor}
                          className={[
                            'sf-option',
                            selected ? 'sf-option--selected' : '',
                            availableInColor ? '' : 'sf-option--disabled',
                          ].join(' ')}
                          onClick={() => selectColor(color)}
                        >
                          {color}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}

              {sizes.length > 0 ? (
                <fieldset className="sf-fieldset">
                  <legend>{t('storefront.selectSize')}</legend>
                  <div className="sf-options" role="radiogroup" aria-label={t('storefront.selectSize')}>
                    {sizes.map((size) => {
                      const availableInSize = product.variants.some(
                        (variant) =>
                          variant.attributes?.size === size &&
                          (!selectedColor || variant.attributes.color === selectedColor) &&
                          variant.available,
                      );
                      const selected = selectedSize === size;
                      return (
                        <button
                          key={size}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={!availableInSize}
                          className={[
                            'sf-option',
                            selected ? 'sf-option--selected' : '',
                            availableInSize ? '' : 'sf-option--disabled',
                          ].join(' ')}
                          onClick={() => selectSize(size)}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : product.variants.length > 1 ? (
            <fieldset className="sf-fieldset">
              <legend>{t('storefront.selectVariant')}</legend>
              <div className="sf-variants" role="radiogroup" aria-label={t('storefront.selectVariant')}>
                {product.variants.map((variant) => (
                  <label
                    key={variant.id}
                    className={
                      variant.available
                        ? selectedVariantId === variant.id
                          ? 'sf-variant sf-variant--selected'
                          : 'sf-variant'
                        : 'sf-variant sf-variant--disabled'
                    }
                  >
                    <input
                      type="radio"
                      name="variant"
                      value={variant.id}
                      disabled={!variant.available}
                      checked={selectedVariantId === variant.id}
                      onChange={() => setSelectedVariantId(variant.id)}
                    />
                    <span className="sf-variant__name">{variant.name}</span>
                    <span className="sf-variant__meta">
                      <Price value={variant.price} />
                      {!variant.available ? <em>{t('storefront.outOfStock')}</em> : null}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {selectedVariant && !selectedVariant.available ? (
            <p className="sf-alert sf-alert--danger">{t('storefront.outOfStock')}</p>
          ) : !anyAvailable ? (
            <p className="sf-alert sf-alert--danger">{t('storefront.outOfStock')}</p>
          ) : null}

          <div className="sf-pdp__buy">
            <label className="sf-qty">
              <span>{t('storefront.quantity')}</span>
              <input
                type="number"
                min={1}
                max={99}
                value={quantity}
                aria-label={t('storefront.quantity')}
                onChange={(event) => {
                  const value = Number.parseInt(event.target.value, 10);
                  setQuantity(Number.isFinite(value) && value >= 1 ? value : 1);
                }}
              />
            </label>
            <button
              type="button"
              className="sf-btn sf-btn--primary sf-btn--lg"
              disabled={!selectedVariant || !selectedVariant.available || adding}
              onClick={() => void handleAddToCart()}
            >
              {adding ? t('common.saving') : t('storefront.addToCart')}
            </button>
          </div>

          <p className="sf-muted sf-text-sm">{t('storefront.checkoutNote')}</p>
        </div>
      </div>
    </div>
  );
}


