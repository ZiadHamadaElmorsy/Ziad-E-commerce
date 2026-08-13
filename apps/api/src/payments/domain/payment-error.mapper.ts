import { Prisma } from '@prisma/client';
import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
} from '../../common/errors/domain-exceptions';

/**
 * Maps Prisma write errors to the domain error taxonomy for the Payments
 * module, mirroring the Catalog/Inventory/Customer/Checkout/Orders mappers.
 * The FINAL database constraints are the last safety boundary:
 *
 *   - P2025 : a row disappeared mid-operation -> NOT_FOUND.
 *   - P2002 : a UNIQUE constraint collision. For payment creation this is
 *             almost always the idempotency-key or provider_reference unique
 *             index -> IDEMPOTENCY_CONFLICT. Webhook-event claims handle their
 *             own P2002 (provider_event_id dedup) BEFORE reaching this mapper.
 *   - P2003 : a referenced parent (order) is missing -> NOT_FOUND.
 *
 * Anything unrecognized is rethrown untouched and rendered as a generic
 * INTERNAL_SERVER_ERROR by AllExceptionsFilter. Domain errors thrown before
 * Prisma is reached (NOT_FOUND / STATE_TRANSITION / CONFLICT) pass through
 * untouched.
 */
export function mapPaymentWriteError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2025') {
      return new NotFoundError('The requested resource was not found.');
    }
    if (error.code === 'P2002') {
      return new IdempotencyConflictError(
        'A payment with this idempotency key has already been created.',
      );
    }
    if (error.code === 'P2003') {
      return new NotFoundError('A referenced resource could not be found.');
    }
  }
  return error;
}

/**
 * Detects the provider-event dedup collision (UNIQUE provider +
 * provider_event_id on payment_events — DATABASE §7.20/§16.5). Used by the
 * webhook claim step so duplicate deliveries are re-claimed instead of
 * rejected.
 */
export function isWebhookDuplicate(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002' &&
    Array.isArray(error.meta?.target) &&
    (error.meta.target as string[]).includes('provider_event_id')
  );
}

/**
 * Maps an unrecognized collision into a generic CONFLICT (used when the
 * payment_events claim hits a non-dedup unique constraint, which should not
 * happen for the webhook path).
 */
export function mapWebhookClaimError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ConflictError('The payment event could not be recorded.');
  }
  return error;
}
