import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { RequestContextService } from '../../common/context/request-context.service';
import { UserRepository } from '../../identity/repositories/user.repository';
import { AuditLogRepository } from '../../orders/repositories/audit-log.repository';

/**
 * Writes the append-only audit trail for CMS administrative changes
 * (docs/DATABASE.md §7.18/§21.3/§25.1: navigation and theme configuration
 * changes are "Administrative changes audited").
 *
 * The actor is the authenticated merchant resolved to the application
 * users.id; it is stored as NULL when the actor cannot be resolved (the
 * column is nullable — DATABASE §7.18).
 */
@Injectable()
export class CmsAuditService {
  constructor(
    private readonly requestContext: RequestContextService,
    private readonly users: UserRepository,
    private readonly audit: AuditLogRepository,
  ) {}

  async write(
    tx: Prisma.TransactionClient,
    storeId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Prisma.InputJsonValue,
  ): Promise<void> {
    const authUserId = this.requestContext.getCurrent()?.user?.authUserId;
    const actor = authUserId ? await this.users.findByAuthUserIdTx(tx, authUserId) : null;

    await this.audit.create(tx, {
      storeId,
      userId: actor?.id ?? null,
      action,
      entityType,
      entityId,
      metadata,
    });
  }
}
