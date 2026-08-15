import Link from 'next/link';
import './storefront.css';

/** Storefront-area 404 for unmatched storefront routes. */
export default function StoreNotFound() {
  return (
    <div className="sf-page sf-page--narrow">
      <div className="sf-state sf-state--empty">
        <div className="sf-state__icon" aria-hidden="true">
          🔍
        </div>
        <h1 className="sf-state__title">Page not found</h1>
        <p className="sf-state__desc">
          The page you are looking for does not exist in this store.
        </p>
        <Link href="/" className="sf-btn sf-btn--primary">
          Back to Ziad E-commerce
        </Link>
      </div>
    </div>
  );
}
