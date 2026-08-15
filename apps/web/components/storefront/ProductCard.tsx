'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import { storeProductPath } from '@/lib/storefront/paths';
import type { StorefrontProduct, StorefrontVariant } from '@/lib/storefront/types';
import { StorefrontImage } from './StorefrontImage';
import { Price } from './Price';

function lowestPrice(variants: StorefrontVariant[]): number | null {
  if (variants.length === 0) return null;
  const available = variants.filter((variant) => variant.available);
  const pool = available.length > 0 ? available : variants;
  return Math.min(...pool.map((variant) => variant.price));
}

/** A real storefront product card (name, image, price, availability). */
export function ProductCard({ product }: { product: StorefrontProduct }) {
  const { slug, store } = useStorefront();
  const { t } = useI18n();
  const cover = product.images[0] ?? null;
  const price = lowestPrice(product.variants);
  const anyAvailable = product.variants.some((variant) => variant.available);
  const href = storeProductPath(slug, product.slug);

  return (
    <article className="sf-product-card">
      <Link href={href} className="sf-product-card__media" tabIndex={-1} aria-hidden="true">
        {cover ? (
          <StorefrontImage mediaId={cover.id} alt={cover.altText ?? product.name} />
        ) : (
          <div className="sf-image sf-image--placeholder" />
        )}
      </Link>
      <div className="sf-product-card__body">
        <h3 className="sf-product-card__name">
          <Link href={href}>{product.name}</Link>
        </h3>
        <div className="sf-product-card__meta">
          <span className="sf-product-card__price">
            {price !== null ? (
              <Price value={price} />
            ) : (
              <span className="sf-muted">{t('storefront.priceUnavailable')}</span>
            )}
          </span>
          {!anyAvailable ? (
            <span className="sf-badge sf-badge--danger">{t('storefront.outOfStock')}</span>
          ) : product.variants.length > 1 ? (
            <span className="sf-muted sf-text-sm">
              {t('storefront.variantCount', { count: product.variants.length })}
            </span>
          ) : null}
        </div>
        {store && product.images.length === 0 ? (
          <span className="sf-muted sf-text-sm">{t('storefront.noImage')}</span>
        ) : null}
      </div>
    </article>
  );
}
