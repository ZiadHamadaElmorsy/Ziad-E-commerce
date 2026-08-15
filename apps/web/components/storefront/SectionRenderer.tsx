'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/i18n-context';
import { useStorefront } from '@/lib/storefront/storefront-context';
import {
  storeCategoryPath,
  storeProductsPath,
} from '@/lib/storefront/paths';
import { storefrontApi } from '@/lib/api/storefront';
import type {
  StorefrontCategory,
  StorefrontProduct,
  StorefrontSection,
} from '@/lib/storefront/types';
import { ProductGrid } from './ProductGrid';
import { StorefrontImage } from './StorefrontImage';
import { StorefrontLoading } from './StorefrontStates';

function contentText(content: unknown, keys: string[]): string | undefined {
  if (!content || typeof content !== 'object') return undefined;
  const record = content as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Renders a PUBLISHED CMS page section (hero / banner / featured_products /
 * category_grid / text / image — docs/API-SPEC.md §25-§26). Section content is
 * free-form JSON, so rendering reads the documented/common keys defensively and
 * falls back to a readable text block.
 */
export function SectionRenderer({ section }: { section: StorefrontSection }) {
  const { slug } = useStorefront();
  const type = section.sectionType;

  if (type === 'hero') {
    const title = contentText(section.content, ['title', 'heading']);
    const subtitle = contentText(section.content, ['subtitle', 'description', 'text', 'body']);
    const ctaLabel = contentText(section.content, ['ctaLabel', 'buttonLabel', 'cta']);
    const ctaLink = contentText(section.content, ['ctaLink', 'link', 'href']);
    return (
      <div className="sf-section sf-section--hero">
        {title ? <h1 className="sf-hero-title">{title}</h1> : null}
        {subtitle ? <p className="sf-hero-subtitle">{subtitle}</p> : null}
        {ctaLabel ? (
          <Link href={ctaLink ?? storeProductsPath(slug)} className="sf-btn sf-btn--primary">
            {ctaLabel}
          </Link>
        ) : null}
      </div>
    );
  }

  if (type === 'banner') {
    const title = contentText(section.content, ['title', 'heading']);
    const subtitle = contentText(section.content, ['subtitle', 'description', 'text', 'body']);
    return (
      <div className="sf-section sf-section--banner">
        {title ? <h2>{title}</h2> : null}
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    );
  }

  if (type === 'featured_products') {
    return <FeaturedProductsSection />;
  }

  if (type === 'category_grid') {
    return <CategoryGridSection />;
  }

  if (type === 'image') {
    const mediaId = contentText(section.content, ['mediaId']) ?? null;
    const imageUrl = contentText(section.content, ['imageUrl', 'url']);
    const caption = contentText(section.content, ['caption', 'alt', 'altText']);
    return (
      <div className="sf-section sf-section--image">
        {mediaId ? (
          <StorefrontImage mediaId={mediaId} alt={caption} className="sf-section__media" />
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={caption ?? ''} className="sf-section__media" />
        ) : null}
        {caption ? <p className="sf-muted">{caption}</p> : null}
      </div>
    );
  }

  if (type === 'text') {
    const body = contentText(section.content, ['body', 'text', 'content', 'description']);
    const title = contentText(section.content, ['title', 'heading']);
    if (!title && !body) return null;
    return (
      <div className="sf-section sf-section--text">
        {title ? <h2>{title}</h2> : null}
        {body ? <p>{body}</p> : null}
      </div>
    );
  }

  // Unknown/presentation section types render as a text block when possible.
  const body = contentText(section.content, ['body', 'text', 'content']);
  return body ? (
    <div className="sf-section sf-section--text">
      <p>{body}</p>
    </div>
  ) : null;
}

function FeaturedProductsSection() {
  const { slug } = useStorefront();
  const { t } = useI18n();
  const [products, setProducts] = useState<StorefrontProduct[] | null>(null);

  useEffect(() => {
    let mounted = true;
    void storefrontApi
      .listProducts(slug, { page: 1, limit: 8 })
      .then((result) => {
        if (mounted) setProducts(result.data);
      })
      .catch(() => {
        if (mounted) setProducts([]);
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (products === null) {
    return (
      <div className="sf-section">
        <StorefrontLoading />
      </div>
    );
  }

  return (
    <div className="sf-section">
      <h2>{t('storefront.featuredProducts')}</h2>
      {products.length > 0 ? (
        <ProductGrid products={products} />
      ) : (
        <p className="sf-muted">{t('storefront.noProducts')}</p>
      )}
    </div>
  );
}

function CategoryGridSection() {
  const { slug } = useStorefront();
  const { t } = useI18n();
  const [categories, setCategories] = useState<StorefrontCategory[] | null>(null);

  useEffect(() => {
    let mounted = true;
    void storefrontApi
      .listCategories(slug, { page: 1, limit: 20 })
      .then((result) => {
        if (mounted) setCategories(result.data);
      })
      .catch(() => {
        if (mounted) setCategories([]);
      });
    return () => {
      mounted = false;
    };
  }, [slug]);

  if (categories === null) {
    return (
      <div className="sf-section">
        <StorefrontLoading />
      </div>
    );
  }

  return (
    <div className="sf-section">
      <h2>{t('storefront.categories')}</h2>
      {categories.length > 0 ? (
        <ul className="sf-chip-list">
          {categories.map((category) => (
            <li key={category.id}>
              <Link href={storeCategoryPath(slug, category.slug)} className="sf-chip">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sf-muted">{t('storefront.noCategories')}</p>
      )}
    </div>
  );
}

