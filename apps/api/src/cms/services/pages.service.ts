import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError, StateTransitionError } from '../../common/errors/domain-exceptions';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { assertValidCatalogSlug, slugify } from '../../catalog/domain/catalog-slug';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { mapCmsWriteError } from '../domain/cms-error.mapper';
import { pageArchiveTarget, pagePatchStatusTarget } from '../domain/cms-status';
import { CreatePageDto } from '../dto/create-page.dto';
import { ListPagesQueryDto } from '../dto/list-pages-query.dto';
import { UpdatePageDto } from '../dto/update-page.dto';
import { PageRepository } from '../repositories/page.repository';
import { buildPaginationMeta, PageView, PaginatedView, toPageView } from '../cms.types';

/** P2002 conflict messages keyed by the unique-index target (see mapper). */
const PAGE_UNIQUE_MESSAGES = {
  'store_id,slug': 'A page with this slug already exists in this store.',
};

/**
 * Page application service (docs/API-SPEC.md §25, docs/DOMAIN-MODEL.md §14.1,
 * docs/DATABASE.md §7.21/§25.1).
 *
 * Business rules implemented here:
 *
 * - Page ownership is ALWAYS the trusted tenant context (membership ->
 *   store); client-supplied ids are never an authorization source. Every
 *   repository query is store-scoped (composite `storeId_id` unique) and RLS
 *   is the final defense. Missing or foreign pages fail closed with NOT_FOUND
 *   (no cross-tenant existence leak).
 * - Slug: generated from `title` (URL-safe, store-scoped unique) with
 *   automatic `-2`, `-3`, ... collision resolution — the exact Catalog
 *   convention. The slug is STABLE after creation (renaming never rewrites
 *   public SEO URLs).
 * - Lifecycle: DRAFT <-> PUBLISHED through PATCH `status` (no dedicated
 *   publish endpoint is documented for pages), and DRAFT | PUBLISHED ->
 *   ARCHIVED through the dedicated archive endpoint (API-SPEC §25). ARCHIVED
 *   is terminal. Transitions use guarded conditional UPDATEs
 *   (docs/DATABASE.md §26.2) so concurrent requests cannot double-transition.
 * - Physical deletion is NOT exposed; per DATABASE §25.1 draft pages are the
 *   only physically deletable pages (and even that has no documented
 *   endpoint — archive is the API path).
 */
@Injectable()
export class PagesService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly pages: PageRepository,
    private readonly transaction: TransactionService,
  ) {}

  /** POST /api/v1/pages — creates a DRAFT page with a generated unique slug. */
  async create(dto: CreatePageDto): Promise<PageView> {
    const storeId = requireStoreId(this.requestContext);

    const baseSlug = slugify(dto.title);
    assertValidCatalogSlug(baseSlug);

    try {
      const page = await this.transaction.runWithTenant(storeId, async (tx) => {
        const slug = await this.resolveUniqueSlug(tx, storeId, baseSlug);
        return this.pages.create(tx, {
          storeId,
          title: dto.title,
          slug,
          ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
          ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
        });
      });
      return toPageView({ ...page, sections: [] });
    } catch (error) {
      throw mapCmsWriteError(error, PAGE_UNIQUE_MESSAGES);
    }
  }

  /** GET /api/v1/pages — store-scoped collection with pagination. */
  async list(query: ListPagesQueryDto): Promise<PaginatedView<PageView>> {
    const storeId = requireStoreId(this.requestContext);
    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      this.pages.findMany(storeId, {
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.pages.count(storeId),
    ]);

    return {
      items: items.map(toPageView),
      meta: buildPaginationMeta(query.page, query.limit, total),
    };
  }

  /** GET /api/v1/pages/:pageId — page with its sections in defined order. */
  async get(pageId: string): Promise<PageView> {
    const storeId = requireStoreId(this.requestContext);

    const page = await this.pages.findById(storeId, pageId);
    if (!page) {
      throw new NotFoundError('The page was not found.');
    }
    return toPageView(page);
  }

  /**
   * PATCH /api/v1/pages/:pageId — partial field update + DRAFT<->PUBLISHED
   * status transition. The status change and the field updates are applied in
   * ONE guarded write so the transition is concurrency-safe.
   */
  async update(pageId: string, dto: UpdatePageDto): Promise<PageView> {
    const storeId = requireStoreId(this.requestContext);

    const page = await this.pages.findById(storeId, pageId);
    if (!page) {
      throw new NotFoundError('The page was not found.');
    }

    const targetStatus =
      dto.status !== undefined ? pagePatchStatusTarget(page.status, dto.status) : undefined;

    const data: { title?: string; seoTitle?: string; seoDescription?: string } = {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle } : {}),
      ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription } : {}),
    };

    if (Object.keys(data).length === 0 && targetStatus === undefined) {
      // Idempotent no-op PATCH (nothing to change).
      return toPageView(page);
    }

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.pages.updateGuarded(tx, storeId, pageId, page.status, {
        status: targetStatus ?? page.status,
        ...data,
      }),
    );

    if (result.count === 0) {
      // A concurrent request already moved the page — fail closed
      // (guarded conditional UPDATE semantics, DATABASE §26.2).
      throw new StateTransitionError(
        'The page changed concurrently; the requested update was not applied.',
      );
    }

    const updated = await this.pages.findById(storeId, pageId);
    if (!updated) {
      throw new NotFoundError('The page was not found.');
    }
    return toPageView(updated);
  }

  /**
   * POST /api/v1/pages/:pageId/archive — DRAFT | PUBLISHED -> ARCHIVED
   * (terminal). Published/archived pages and their sections are retained
   * (DATABASE §25.1).
   */
  async archive(pageId: string): Promise<PageView> {
    const storeId = requireStoreId(this.requestContext);

    const page = await this.pages.findById(storeId, pageId);
    if (!page) {
      throw new NotFoundError('The page was not found.');
    }

    const target = pageArchiveTarget(page.status);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.pages.updateGuarded(tx, storeId, pageId, page.status, { status: target }),
    );

    if (result.count === 0) {
      throw new StateTransitionError(
        'The page changed concurrently; the archive transition was not applied.',
      );
    }

    const updated = await this.pages.findById(storeId, pageId);
    if (!updated) {
      throw new NotFoundError('The page was not found.');
    }
    return toPageView(updated);
  }

  private async resolveUniqueSlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    baseSlug: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let suffix = 2;
    while (await this.pages.existsBySlug(tx, storeId, candidate)) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    return candidate;
  }
}
