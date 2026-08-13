import { SetMetadata } from '@nestjs/common';
import type { MembershipRole } from '@prisma/client';

/** Metadata key carrying the roles required for a handler/controller. */
export const ROLES_KEY = 'ziad:roles';

/**
 * Declares the fixed membership roles allowed to reach a handler:
 *
 *   @Roles('OWNER')
 *   @Roles('OWNER', 'ADMIN')
 *
 * Roles are exactly the MVP fixed boundary: OWNER | ADMIN | STAFF.
 *
 * Granular permissions (e.g. `products.create`, `orders.refund`) are OUT of
 * scope until docs/AUTHORIZATION.md is created; this phase implements only the
 * minimum role boundary.
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
