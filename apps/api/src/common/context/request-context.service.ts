import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthenticatedUser } from '../../auth/authenticated-user';
import type { TenantContext } from '../../tenant/tenant-context';
import type { RequestContextData } from './request-context';

/**
 * Request/tenant context carrier.
 *
 * Implemented with Node's AsyncLocalStorage so every async callback of a
 * request sees exactly that request's context. There is NO module-level
 * mutable state: two requests processed concurrently can never observe each
 * other's context, which is verified by unit tests.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  /** Runs `fn` with `context` bound to the current async flow. */
  runWithContext<T>(context: RequestContextData, fn: () => T): T {
    return this.storage.run(context, fn);
  }

  /** The current request context, or undefined outside a request. */
  getCurrent(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  get requestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /** Sets the verified authenticated user for the current request. */
  setUser(user: AuthenticatedUser): void {
    this.update({ user });
  }

  /** Sets the resolved tenant (membership + store) for the current request. */
  setTenant(tenant: TenantContext): void {
    this.update({ membership: tenant.membership, store: tenant.store });
  }

  private update(patch: Partial<RequestContextData>): void {
    const current = this.storage.getStore();
    // Fail closed: never silently drop context updates.
    if (!current) {
      throw new Error('RequestContextService: no active request context.');
    }
    Object.assign(current, patch);
  }
}
