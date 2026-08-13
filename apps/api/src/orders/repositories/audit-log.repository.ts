import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Minimal write input for an audit_logs row (docs/DATABASE.md §7.18). */
export interface CreateAuditLogInput {
  storeId: string;
  /** Application User acting (actor); null when the actor cannot be resolved. */
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Prisma.InputJsonValue;
}

/**
 * Persistence access for the `audit_logs` table (docs/DATABASE.md §7.18).
 *
 * Append-only: audit rows are created inside the business transaction that
 * causes them and are never updated or deleted (DATABASE §25.2 — audit_logs
 * are retained forever). The Orders phase uses it for the documented
 * order-status-change audit trail ("Changes are audited", US-ORDER-003;
 * "order status change (incl. cancellation)", DATABASE §7.18/§28.4).
 */
@Injectable()
export class AuditLogRepository {
  /** Writes the audit row inside the caller's tenant-bound transaction. */
  async create(tx: Prisma.TransactionClient, data: CreateAuditLogInput): Promise<{ id: string }> {
    return tx.auditLog.create({
      data: {
        storeId: data.storeId,
        userId: data.userId,
        action: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: data.metadata,
      },
      select: { id: true },
    });
  }
}
