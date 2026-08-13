import { Injectable } from '@nestjs/common';
import { Page, PageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PageWithSections } from '../cms.types';

/** Minimal write input for creating a Page (docs/DATABASE.md §7.21). */
export interface CreatePageInput {
  storeId: string;
  title: string;
  slug: string;
  seoTitle?: string;
  seoDescription?: string;
}

/** Minimal write input for updating Page fields (slug stays stable). */
export interface UpdatePageInput {
  title?: string;
  seoTitle?: string;
  seoDescription?: string;
}

/** Store-scoped list filter for the pages collection endpoint. */
export interface PageListFilter {
  skip: number;
  take: number;
  orderBy: Prisma.PageOrderByWithRelationInput;
}

/**
 * Persistence access for the `pages` table.
 *
 * Encapsulates Prisma access only — no business rules. Every read and write is
 * store-scoped (composite `storeId_id` unique target / storeId filters).
 * Sections are loaded in defined order (sort_order asc) so the view contract
 * always renders the configured section order (US-CMS-002/003).
 */
@Injectable()
export class PageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreatePageInput): Promise<Page> {
    return tx.page.create({ data: { ...data } });
  }

  /**
   * Concurrency-safe guarded UPDATE (docs/DATABASE.md §26.2): only a row in
   * the expected source status transitions. `data` carries the target status
   * AND any fields updated in the same write. Returns the affected row count
   * so the service can fail closed on a concurrent transition.
   */
  async updateGuarded(
    tx: Prisma.TransactionClient,
    storeId: string,
    pageId: string,
    fromStatus: PageStatus,
    data: { status: PageStatus } & UpdatePageInput,
  ): Promise<{ count: number }> {
    return tx.page.updateMany({
      where: { id: pageId, storeId, status: fromStatus },
      data,
    });
  }

  /** Store-scoped slug existence check (used to resolve slug collisions). */
  async existsBySlug(
    tx: Prisma.TransactionClient,
    storeId: string,
    slug: string,
  ): Promise<boolean> {
    const found = await tx.page.findFirst({
      where: { storeId, slug },
      select: { id: true },
    });
    return found !== null;
  }

  async findById(storeId: string, pageId: string): Promise<PageWithSections | null> {
    return this.prisma.page.findUnique({
      where: { storeId_id: { storeId, id: pageId } },
      include: this.sectionsInclude(),
    });
  }

  async findMany(storeId: string, filter: PageListFilter): Promise<PageWithSections[]> {
    return this.prisma.page.findMany({
      where: { storeId },
      skip: filter.skip,
      take: filter.take,
      orderBy: filter.orderBy,
      include: this.sectionsInclude(),
    });
  }

  async count(storeId: string): Promise<number> {
    return this.prisma.page.count({ where: { storeId } });
  }

  private sectionsInclude() {
    return {
      sections: { orderBy: { sortOrder: 'asc' as const } },
    };
  }
}
