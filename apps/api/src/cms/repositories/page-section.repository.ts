import { Injectable } from '@nestjs/common';
import { PageSection, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Minimal write input for creating a PageSection (docs/DATABASE.md §7.22). */
export interface CreatePageSectionInput {
  storeId: string;
  pageId: string;
  sectionType: string;
  content: Prisma.InputJsonValue;
  sortOrder: number;
}

/** Minimal write input for updating a PageSection. */
export interface UpdatePageSectionInput {
  sectionType?: string;
  content?: Prisma.InputJsonValue;
}

/** A single section order assignment (id -> new sort_order). */
export interface SectionOrder {
  id: string;
  sortOrder: number;
}

/**
 * Persistence access for the `page_sections` table.
 *
 * Encapsulates Prisma access only — no business rules. Every write is scoped
 * by (storeId, pageId) so a section can never be touched outside its owning
 * Page/Store (the composite store-scoped FK is the final DB defense).
 * Reads return sections in defined order (sort_order asc).
 */
@Injectable()
export class PageSectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(tx: Prisma.TransactionClient, data: CreatePageSectionInput): Promise<PageSection> {
    return tx.pageSection.create({ data: { ...data } });
  }

  /**
   * Shifts sections at `fromPosition` and below up by one (used when a new
   * section is inserted at `position`). Keeps the section order dense.
   */
  async shiftUpFrom(
    tx: Prisma.TransactionClient,
    storeId: string,
    pageId: string,
    fromPosition: number,
  ): Promise<{ count: number }> {
    return tx.pageSection.updateMany({
      where: { storeId, pageId, sortOrder: { gte: fromPosition } },
      data: { sortOrder: { increment: 1 } },
    });
  }

  /** Store-scoped, page-scoped guarded UPDATE (0 rows = section not found). */
  async updateGuarded(
    tx: Prisma.TransactionClient,
    storeId: string,
    pageId: string,
    sectionId: string,
    data: UpdatePageSectionInput,
  ): Promise<{ count: number }> {
    return tx.pageSection.updateMany({
      where: { id: sectionId, storeId, pageId },
      data,
    });
  }

  /** Store-scoped, page-scoped delete (0 rows = section not found). */
  async delete(
    tx: Prisma.TransactionClient,
    storeId: string,
    pageId: string,
    sectionId: string,
  ): Promise<{ count: number }> {
    return tx.pageSection.deleteMany({
      where: { id: sectionId, storeId, pageId },
    });
  }

  /** All sections of a page in defined order. */
  async findByPage(storeId: string, pageId: string): Promise<PageSection[]> {
    return this.prisma.pageSection.findMany({
      where: { storeId, pageId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** One section of a page (store-scoped, page-scoped). */
  async findById(storeId: string, pageId: string, sectionId: string): Promise<PageSection | null> {
    return this.prisma.pageSection.findFirst({
      where: { id: sectionId, storeId, pageId },
    });
  }

  /** Applies the new order assignments inside the caller's transaction. */
  async applyOrders(
    tx: Prisma.TransactionClient,
    storeId: string,
    pageId: string,
    orders: SectionOrder[],
  ): Promise<void> {
    for (const order of orders) {
      await tx.pageSection.updateMany({
        where: { id: order.id, storeId, pageId },
        data: { sortOrder: order.sortOrder },
      });
    }
  }
}
