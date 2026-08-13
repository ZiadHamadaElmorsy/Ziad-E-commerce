import { Page, PageSection, PageStatus } from '@prisma/client';
import { buildPaginationMeta, PaginatedView } from '../catalog/catalog.types';

/**
 * Merchant CMS representations (docs/API-SPEC.md §25-§28, docs/DATABASE.md
 * §7.21-§7.24).
 *
 * These views are the PROTECTED merchant contract of the CMS module. Only
 * fields documented in the source documents are exposed; internal columns
 * (store_id, created_at, updated_at) are never rendered.
 *
 * Page sections keep their defined order: repositories always load sections
 * ordered by sort_order (US-CMS-002/003 "Sections have a defined order").
 */

export interface PageSectionView {
  id: string;
  sectionType: string;
  content: unknown;
  sortOrder: number;
}

export interface PageView {
  id: string;
  title: string;
  slug: string;
  status: PageStatus;
  seoTitle: string | null;
  seoDescription: string | null;
  sections: PageSectionView[];
}

export interface NavigationItemView {
  label: string;
  type: string;
  value: string;
}

export interface NavigationView {
  id: string;
  name: string;
  items: NavigationItemView[];
}

export interface ThemeView {
  id: string;
  logoMediaId: string | null;
  config: Record<string, unknown>;
}

/** A Page row with its sections loaded in defined order. */
export type PageWithSections = Page & { sections: PageSection[] };

export function toPageSectionView(section: PageSection): PageSectionView {
  return {
    id: section.id,
    sectionType: section.sectionType,
    content: section.content,
    sortOrder: section.sortOrder,
  };
}

export function toPageView(page: PageWithSections): PageView {
  return {
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    seoTitle: page.seoTitle,
    seoDescription: page.seoDescription,
    sections: (page.sections ?? []).map(toPageSectionView),
  };
}

export function toNavigationView(navigation: {
  id: string;
  name: string;
  items: unknown;
}): NavigationView {
  const rawItems = Array.isArray(navigation.items) ? navigation.items : [];
  return {
    id: navigation.id,
    name: navigation.name,
    items: rawItems.map((item) => {
      const record = item as { label?: string; type?: string; value?: string };
      return {
        label: record.label ?? '',
        type: record.type ?? '',
        value: record.value ?? '',
      };
    }),
  };
}

export function toThemeView(theme: {
  id: string;
  logoMediaId: string | null;
  config: unknown;
}): ThemeView {
  return {
    id: theme.id,
    logoMediaId: theme.logoMediaId,
    config: (theme.config ?? {}) as Record<string, unknown>,
  };
}

export { buildPaginationMeta, PaginatedView };
