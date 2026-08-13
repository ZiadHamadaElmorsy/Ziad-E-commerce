import { MembershipRole, MembershipStatus, StoreStatus } from '@prisma/client';

/**
 * A StoreMembership resolved from the database for the authenticated user.
 *
 * The role and status here are authoritative (loaded from `store_memberships`)
 * and are NEVER taken from client input.
 */
export interface ResolvedMembership {
  id: string;
  storeId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

/**
 * The Store resolved *from* the ACTIVE membership — never from a client
 * supplied store_id as an authorization source.
 */
export interface ResolvedStore {
  id: string;
  slug: string;
  name: string;
  status: StoreStatus;
}

/**
 * The trusted tenant identity consumed by future repositories/services.
 *
 * Resolution chain (mandatory):
 *
 *   Authenticated User -> ACTIVE StoreMembership -> Store
 *
 * A tenant context is never built from a bare client-supplied store_id.
 */
export interface TenantContext {
  membership: ResolvedMembership;
  store: ResolvedStore;
}
