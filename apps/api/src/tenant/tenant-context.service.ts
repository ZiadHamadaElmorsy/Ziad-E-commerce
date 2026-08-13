import { Injectable } from '@nestjs/common';
import { MembershipStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenError, TenantContextRequiredError } from '../common/errors/domain-exceptions';
import type { TenantContext } from './tenant-context';

/**
 * Resolves the trusted tenant identity for an authenticated user.
 *
 * The ONLY allowed resolution chain:
 *
 *   Authenticated User -> ACTIVE StoreMembership -> Store
 *
 * A candidate store identifier supplied by the client (X-Store-Id header or
 * `:storeId` route parameter) is used strictly as a *lookup key* to select the
 * membership; it is NEVER treated as an authorization source. If the user has
 * no matching ACTIVE membership the resolution fails closed.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * @param authUserId        verified identity (from the authentication boundary)
   * @param candidateStoreId  optional client-selected store (lookup key only)
   * @throws ForbiddenError             no membership / no access to the store
   * @throws TenantContextRequiredError multiple stores, none selected
   */
  async resolveForUser(authUserId: string, candidateStoreId?: string): Promise<TenantContext> {
    const activeMemberships = await this.prisma.storeMembership.findMany({
      where: {
        status: MembershipStatus.ACTIVE,
        user: { authUserId },
      },
      include: { store: true },
    });

    let membership = activeMemberships[0];

    if (candidateStoreId) {
      const match = activeMemberships.find((m) => m.storeId === candidateStoreId);
      if (!match) {
        throw new ForbiddenError('You do not have access to the requested store.');
      }
      membership = match;
    } else if (activeMemberships.length === 0) {
      throw new ForbiddenError('No active store membership for this user.');
    } else if (activeMemberships.length > 1) {
      throw new TenantContextRequiredError(
        'Multiple stores are available; a store must be selected.',
      );
    }

    return {
      membership: {
        id: membership.id,
        storeId: membership.storeId,
        role: membership.role,
        status: membership.status,
      },
      store: {
        id: membership.store.id,
        slug: membership.store.slug,
        name: membership.store.name,
        status: membership.store.status,
      },
    };
  }
}
