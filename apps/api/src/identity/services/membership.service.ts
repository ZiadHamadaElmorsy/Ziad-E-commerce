import { Injectable } from '@nestjs/common';
import { StoreMembership } from '@prisma/client';
import { ForbiddenError } from '../../common/errors/domain-exceptions';
import { StoreMembershipRepository } from '../repositories/store-membership.repository';

export interface ResolvedMembershipResult {
  /** The ACTIVE membership and its role, resolved from the database. */
  membership: StoreMembership;
}

/**
 * Domain abstraction for membership resolution.
 *
 *   resolveMembership(userId, storeId) -> ACTIVE membership + role
 *
 * Behavior (fail closed):
 *   - No membership row          -> FORBIDDEN
 *   - Inactive membership        -> FORBIDDEN (only ACTIVE rows can resolve)
 *   - Valid ACTIVE membership    -> returned with its role
 *
 * The role ALWAYS comes from the `store_memberships` row — never from the
 * client. The ambiguous "multiple possible stores without enough context"
 * case belongs to the request-level tenant resolution
 * (TenantContextService.resolveForUser) and is NOT duplicated here, because
 * this abstraction is always given an explicit `storeId`.
 */
@Injectable()
export class MembershipService {
  constructor(private readonly memberships: StoreMembershipRepository) {}

  async resolveMembership(userId: string, storeId: string): Promise<ResolvedMembershipResult> {
    const membership = await this.memberships.findActiveMembership(userId, storeId);
    if (!membership) {
      throw new ForbiddenError('No active membership grants access to this store.');
    }
    return { membership };
  }
}
