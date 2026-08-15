'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeProductsPath } from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import { ApiError } from '@/lib/api/client';
import type { StorefrontProduct, StorefrontVariant } from '@/lib/storefront/types';
import { StorefrontImage } from '@/components/storefront/StorefrontImage';
import { Price } from '@/components/storefront/Price';
import { StorefrontError, StorefrontLoading } from '@/components/storefront/StorefrontStates';
import { useToast } from '@/components/ui/Toast';

/**
 * Storefront product details (Phase 19). Real catalog data via the public
 * storefront API; the customer must select a valid available variant before
 * adding to cart. Quantity/pricing/availability are revalidated server-side by
 * the existing Cart API at add time.
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
      })
      .catch((caught) => {
        setError(caught instanceof ApiError ? caught.message : t('storefront.loadFailed'));
      });
  }, [slug, productSlug, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const selectedVariant = useMemo<StorefrontVariant | null>(() => {
    if (!product || !selectedVariantId) return null;
    return product.variants.find((variant) => variant.id === selectedVariantId) ?? null;
  }, [product, selectedVariantId]);

  const anyAvailable = product?.variants.some((variant) => variant.available) ?? false;

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

  const cover = product.images[0] ?? null;
  const lowest = Math.min(...product.variants.map((variant) => variant.price));
  const highest = Math.max(...product.variants.map((variant) => variant.price));

  return (
    <div className="sf-page">
      <p className="sf-breadcrumbs">
        <Link href={storeProductsPath(slug)}>{t('storefront.products')}</Link>
        <span aria-hidden="true"> / </span>
        <span>{product.name}</span>
      </p>

      <div className="sf-pdp">
        <div className="sf-pdp__gallery">
          {cover ? (
            <StorefrontImage mediaId={cover.id} alt={cover.altText ?? product.name} className="sf-pdp__cover" />
          ) : (
            <div className="sf-image sf-image--placeholder sf-pdp__cover" />
          )}
        </div>

        <div className="sf-pdp__info">
          <h1>{product.name}</h1>

          <p className="sf-pdp__price">
            {product.variants.length > 1 ? (
              <>
                <Price value={lowest} /> — <Price value={highest} />
              </>
            ) : (
              <Price value={product.variants[0]?.price} />
            )}
          </p>

          {product.description ? <p className="sf-pdp__desc">{product.description}</p> : null}

          {product.variants.length > 1 ? (
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

          {!anyAvailable ? (
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
              disabled={!selectedVariant || !anyAvailable || adding}
              onClick={() => void handleAddToCart()}
            >
              {adding ? t('common.saving') : t('storefront.addToCart')}
            </button>
          </div>

          <p className="sf-muted sf-text-sm">{t('storefront.checkoutNote')}</p>
        </div>
      </div>

      {product.images.length > 1 ? (
        <div className="sf-pdp__thumbs">
          {product.images.map((image) => (
            <StorefrontImage
              key={image.id}
              mediaId={image.id}
              alt={image.altText ?? product.name}
              className="sf-pdp__thumb"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

