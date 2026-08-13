import { RequestContextService } from '../../common/context/request-context.service';
import { TenantContextRequiredError } from '../../common/errors/domain-exceptions';

/**
 * Resolves the trusted tenant store id for a Catalog operation.
 *
 * The store id ALWAYS comes from the resolved tenant context
 * (Authenticated User -> ACTIVE StoreMembership -> Store), never from client
 * input. All Catalog repositories additionally scope every query by this
 * storeId, and RLS policies are the final defense boundary.
 */
export function requireStoreId(context: RequestContextService): string {
  const storeId = context.getCurrent()?.store?.id;
  if (!storeId) {
    throw new TenantContextRequiredError('A store tenant context is required.');
  }
  return storeId;
}
