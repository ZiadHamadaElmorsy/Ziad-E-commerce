'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { catalogApi } from '@/lib/api/catalog';
import type { CategoryView } from '@/lib/api/types';

/**
 * Searchable category multi-select for the product editor (Phase 26).
 *
 * - Server-side search (`GET /categories?search=`) so thousands of categories
 *   are never downloaded to the browser.
 * - Selected categories render as removable chips.
 * - Loading / empty / error states.
 *
 * The parent owns the selected list (`value` + `onChange`); this component
 * only renders the searchable picker + chips.
 */
export function ProductCategorySelector({
  value,
  onChange,
  disabled,
}: {
  /** Currently assigned categories (chips). */
  value: CategoryView[];
  onChange: (next: CategoryView[]) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<CategoryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (term: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await catalogApi.listCategories({
          page: 1,
          limit: 12,
          search: term.trim() || undefined,
        });
        setResults(result.data);
      } catch {
        setError(t('products.gallery.categoriesLoadFailed'));
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // Initial load (and reload when opened with an empty query).
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(search);
  }, [open, search, load]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void load(search);
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [search, load]);

  const displayName = (category: CategoryView) => {
    if (locale === 'ar' && category.nameAr) return category.nameAr;
    if (locale === 'en' && category.nameEn) return category.nameEn;
    return category.name;
  };

  const assignedIds = new Set(value.map((category) => category.id));

  const toggle = (category: CategoryView) => {
    if (assignedIds.has(category.id)) {
      onChange(value.filter((c) => c.id !== category.id));
    } else {
      onChange([...value, category]);
    }
  };

  return (
    <div className="category-selector">
      {value.length > 0 ? (
        <ul className="category-chip-list" aria-label={t('products.details.categories')}>
          {value.map((category) => (
            <li key={category.id} className="category-chip">
              <span className="category-chip__name">{displayName(category)}</span>
              <button
                type="button"
                className="category-chip__remove"
                aria-label={t('products.gallery.removeCategoryAria', { name: displayName(category) })}
                disabled={disabled}
                onClick={() => toggle(category)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="category-selector__field">
        <input
          type="search"
          className="input"
          placeholder={t('products.gallery.searchCategories')}
          aria-label={t('products.gallery.searchCategories')}
          value={search}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => setSearch(event.target.value)}
        />
        {loading ? <span className="category-selector__spinner" aria-hidden="true" /> : null}
      </div>

      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}

      {open && !error ? (
        <ul className="category-selector__results" role="listbox" aria-label={t('products.details.categories')}>
          {!loading && results.length === 0 ? (
            <li className="category-selector__empty">{t('products.gallery.categoriesEmpty')}</li>
          ) : null}
          {results.map((category) => {
            const selected = assignedIds.has(category.id);
            return (
              <li key={category.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={
                    selected
                      ? 'category-selector__result category-selector__result--selected'
                      : 'category-selector__result'
                  }
                  disabled={disabled}
                  onClick={() => toggle(category)}
                >
                  <span>{displayName(category)}</span>
                  {selected ? <span aria-hidden="true">✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
