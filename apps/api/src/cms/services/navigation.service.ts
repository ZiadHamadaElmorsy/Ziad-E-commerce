import { Injectable } from '@nestjs/common';
import { Prisma, Navigation } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { NotFoundError } from '../../common/errors/domain-exceptions';
import { requireStoreId } from '../../catalog/domain/catalog-tenant';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { assertValidNavigationItems } from '../domain/cms-navigation';
import { UpdateNavigationDto } from '../dto/update-navigation.dto';
import { NavigationRepository } from '../repositories/navigation.repository';
import { NavigationView, toNavigationView } from '../cms.types';
import { CmsAuditService } from './cms-audit.service';

/** Audit action for navigation configuration changes (DATABASE §21.3). */
const AUDIT_ACTION_NAVIGATION_UPDATED = 'navigation.updated';

/** Default menu label for the singleton storefront navigation. */
export const DEFAULT_NAVIGATION_NAME = 'Main';

/**
 * Navigation application service (docs/API-SPEC.md §27, docs/DOMAIN-MODEL.md
 * §14.3, docs/DATABASE.md §7.23/§21.2).
 *
 * Business rules implemented here:
 *
 * - The API contract treats navigation as a SINGLETON store resource
 *   (GET/PUT /api/v1/navigation). The `navigations` table has no UNIQUE
 *   (store_id) constraint, so the service resolves "the navigation" of the
 *   store and materializes a default row when none exists (get-or-create —
 *   same lazy-materialization approach as the default theme).
 * - Items reference Pages, Categories and Storefront destinations
 *   ({ label, type: PAGE|CATEGORY|DESTINATION, value } — DATABASE §7.23/
 *   §21.2). Items are validated for shape only: navigation is presentation
 *   configuration, NOT core commerce data (no referential integrity is
 *   defined by the source documents).
 * - PUT replaces the whole navigation (name + items) and the administrative
 *   change is audited (DATABASE §21.3/§25.1).
 * - Every read/write is store-scoped; writes are tenant-bound transactions.
 */
@Injectable()
export class NavigationService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly navigations: NavigationRepository,
    private readonly transaction: TransactionService,
    private readonly audit: CmsAuditService,
  ) {}

  /**
   * GET /api/v1/navigation — the store's navigation (default when absent).
   *
   * `storeId` is optional: the merchant path resolves it from the trusted
   * tenant context; the public storefront path passes the store resolved
   * SERVER-SIDE by the StorefrontStoreResolver (never client input).
   */
  async getNavigation(storeId?: string): Promise<NavigationView> {
    const resolvedStoreId = storeId ?? requireStoreId(this.requestContext);

    const existing = await this.navigations.findForStore(resolvedStoreId);
    if (existing) {
      return toNavigationView(existing);
    }

    const created = await this.transaction.runWithTenant(resolvedStoreId, (tx) =>
      this.navigations.create(tx, {
        storeId: resolvedStoreId,
        name: DEFAULT_NAVIGATION_NAME,
        items: [],
      }),
    );
    return toNavigationView(created);
  }

  /**
   * PUT /api/v1/navigation — replaces the store's navigation (name + items)
   * and audits the administrative change.
   */
  async updateNavigation(dto: UpdateNavigationDto): Promise<NavigationView> {
    const storeId = requireStoreId(this.requestContext);

    // Domain-layer defense in depth: the JSONB `items` must always be shaped.
    assertValidNavigationItems(dto.items);

    const updated = await this.transaction.runWithTenant(storeId, async (tx) => {
      const existing = await this.navigations.findForStoreTx(tx, storeId);
      const navigation = await this.resolveRow(tx, storeId, existing, dto);
      await this.audit.write(
        tx,
        storeId,
        AUDIT_ACTION_NAVIGATION_UPDATED,
        'navigation',
        navigation.id,
        { name: navigation.name, itemCount: dto.items.length },
      );
      return navigation;
    });

    return toNavigationView(updated);
  }

  private async resolveRow(
    tx: Prisma.TransactionClient,
    storeId: string,
    existing: Navigation | null,
    dto: UpdateNavigationDto,
  ): Promise<Navigation> {
    if (existing) {
      const result = await this.navigations.update(tx, storeId, existing.id, {
        name: dto.name,
        items: dto.items as unknown as Prisma.InputJsonValue,
      });
      if (result.count === 0) {
        // The row vanished mid-request (impossible via the API — never
        // physically deleted) — fail closed.
        throw new NotFoundError('The navigation was not found.');
      }
      return {
        ...existing,
        name: dto.name,
        items: dto.items as unknown as Prisma.JsonValue,
      };
    }
    return this.navigations.create(tx, {
      storeId,
      name: dto.name,
      items: dto.items as unknown as Prisma.InputJsonValue,
    });
  }
}
