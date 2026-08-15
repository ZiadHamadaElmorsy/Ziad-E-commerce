'use client';

import type { StorefrontProduct } from '@/lib/storefront/types';
import { ProductCard } from './ProductCard';

/** Responsive grid of storefront product cards. */
export function ProductGrid({ products }: { products: StorefrontProduct[] }) {
  if (products.length === 0) return null;
  return (
    <div className="sf-grid" role="list" aria-label="Products">
      {products.map((product) => (
        <div key={product.id} role="listitem">
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  );
}
