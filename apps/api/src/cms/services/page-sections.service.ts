import { Injectable } from '@nestjs/common';
import { PageSection, Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { ValidationError, NotFoundError } from '../../common/errors/domain-exceptions';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { assertValidSectionContent, toDbSectionType } from '../domain/cms-section';
import { CreatePageSectionDto } from '../dto/create-page-section.dto';
import { ReorderPageSectionsDto } from '../dto/reorder-page-sections.dto';
import { UpdatePageSectionDto } from '../dto/update-page-section.dto';
import { PageRepository } from '../repositories/page.repository';
import { PageSectionRepository, SectionOrder } from '../repositories/page-section.repository';
import { PageSectionView, toPageSectionView } from '../cms.types';

/**
 * Page Section application service (docs/API-SPEC.md §26, docs/DOMAIN-MODEL.md
 * §14.2, docs/DATABASE.md §7.22/§21.2).
 *
 * Business rules implemented here:
 *
 * - Sections are store-scoped through their Page; every operation first
 *   resolves the page from the trusted tenant context and fails closed with
 *   NOT_FOUND when the page does not exist in the current store.
 * - Section types are exactly the documented set (hero / banner /
 *   featured_products / category_grid / text / image). Content is a free-form
 *   JSON object (no per-type content schema is documented — DATABASE §33 #11).
 * - Sections have a DEFINED order (US-CMS-002/003): new sections insert at
 *   `position` and shift the following sections down; the reorder endpoint
 *   replaces the full order (the API-SPEC §26 `sectionIds` list must be a
 *   permutation of the page's sections).
 */

/** Reorders a dense section list after moving `movedId` to `newPosition`. */
export function orderedAfterMove(
  sections: Array<{ id: string; sortOrder: number }>,
  movedId: string,
  newPosition: number,
): SectionOrder[] {
  const sorted = [...sections].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
  );
  const without = sorted.filter((section) => section.id !== movedId);
  const clamped = Math.max(0, Math.min(newPosition, without.length));
  const reordered = [
    ...without.slice(0, clamped),
    { id: movedId, sortOrder: 0 },
    ...without.slice(clamped),
  ];
  return reordered.map((section, index) => ({ id: section.id, sortOrder: index }));
}

@Injectable()
export class PageSectionsService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly pages: PageRepository,
    private readonly sections: PageSectionRepository,
    private readonly transaction: TransactionService,
  ) {}

  /** POST /api/v1/pages/:pageId/sections — insert a section at `position`. */
  async addSection(pageId: string, dto: CreatePageSectionDto): Promise<PageSectionView> {
    const storeId = requireStoreId(this.requestContext);

    await this.assertPageExists(storeId, pageId);

    const sectionType = toDbSectionType(dto.type);
    assertValidSectionContent(dto.content);
    const position = dto.position ?? 0;

    const section = await this.transaction.runWithTenant(storeId, async (tx) => {
      // Keep the defined order dense: shift the existing sections at/after the
      // insertion point up by one, then insert the new section at `position`.
      await this.sections.shiftUpFrom(tx, storeId, pageId, position);
      return this.sections.create(tx, {
        storeId,
        pageId,
        sectionType,
        content: dto.content as Prisma.InputJsonValue,
        sortOrder: position,
      });
    });

    return toPageSectionView(section);
  }

  /**
   * PATCH /api/v1/pages/:pageId/sections/:sectionId — partial section update.
   * When `position` is provided the section is MOVED there and the other
   * sections shift so the order stays dense (0..n-1).
   */
  async updateSection(
    pageId: string,
    sectionId: string,
    dto: UpdatePageSectionDto,
  ): Promise<PageSectionView> {
    const storeId = requireStoreId(this.requestContext);

    await this.assertPageExists(storeId, pageId);

    const section = await this.sections.findById(storeId, pageId, sectionId);
    if (!section) {
      throw new NotFoundError('The section was not found.');
    }

    if (dto.content !== undefined) {
      assertValidSectionContent(dto.content);
    }

    const fieldData: { sectionType?: string; content?: Prisma.InputJsonValue } = {
      ...(dto.type !== undefined ? { sectionType: toDbSectionType(dto.type) } : {}),
      ...(dto.content !== undefined ? { content: dto.content as Prisma.InputJsonValue } : {}),
    };

    await this.transaction.runWithTenant(storeId, async (tx) => {
      if (Object.keys(fieldData).length > 0) {
        const result = await this.sections.updateGuarded(tx, storeId, pageId, sectionId, fieldData);
        if (result.count === 0) {
          throw new NotFoundError('The section was not found.');
        }
      }
      if (dto.position !== undefined) {
        const current = await this.sections.findByPage(storeId, pageId);
        const orders = orderedAfterMove(current, sectionId, dto.position);
        await this.sections.applyOrders(tx, storeId, pageId, orders);
      }
    });

    const updated = await this.sections.findById(storeId, pageId, sectionId);
    if (!updated) {
      throw new NotFoundError('The section was not found.');
    }
    return toPageSectionView(updated);
  }

  /** DELETE /api/v1/pages/:pageId/sections/:sectionId — removes the section. */
  async deleteSection(pageId: string, sectionId: string): Promise<void> {
    const storeId = requireStoreId(this.requestContext);

    await this.assertPageExists(storeId, pageId);

    const result = await this.transaction.runWithTenant(storeId, (tx) =>
      this.sections.delete(tx, storeId, pageId, sectionId),
    );

    if (result.count === 0) {
      throw new NotFoundError('The section was not found.');
    }
  }

  /**
   * POST /api/v1/pages/:pageId/sections/reorder — replaces the full section
   * order. `sectionIds` must be a permutation of the page's current section
   * ids (complete reorder per the API-SPEC example).
   */
  async reorderSections(pageId: string, dto: ReorderPageSectionsDto): Promise<PageSectionView[]> {
    const storeId = requireStoreId(this.requestContext);

    await this.assertPageExists(storeId, pageId);

    const current = await this.sections.findByPage(storeId, pageId);
    this.assertCompleteReorder(current, dto.sectionIds);

    const orders: SectionOrder[] = dto.sectionIds.map((id, index) => ({
      id,
      sortOrder: index,
    }));

    await this.transaction.runWithTenant(storeId, (tx) =>
      this.sections.applyOrders(tx, storeId, pageId, orders),
    );

    const updated = await this.sections.findByPage(storeId, pageId);
    return updated.map(toPageSectionView);
  }

  private async assertPageExists(storeId: string, pageId: string): Promise<void> {
    const page = await this.pages.findById(storeId, pageId);
    if (!page) {
      throw new NotFoundError('The page was not found.');
    }
  }

  private assertCompleteReorder(current: PageSection[], requested: string[]): void {
    if (new Set(requested).size !== requested.length) {
      throw new ValidationError('sectionIds must not contain duplicates.');
    }
    const currentIds = current.map((section) => section.id);
    const requestedSet = new Set(requested);
    if (currentIds.length !== requested.length || !currentIds.every((id) => requestedSet.has(id))) {
      throw new ValidationError(
        'sectionIds must contain exactly the page sections, in the new order.',
      );
    }
  }
}
