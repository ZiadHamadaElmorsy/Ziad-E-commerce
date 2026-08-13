import { Prisma } from '@prisma/client';
import {
  ConflictError,
  IdempotencyConflictError,
  NotFoundError,
} from '../../common/errors/domain-exceptions';
import {
  isWebhookDuplicate,
  mapPaymentWriteError,
  mapWebhookClaimError,
} from './payment-error.mapper';

function knownError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('prisma error', {
    code,
    clientVersion: 'test',
    meta,
  });
}

describe('payment-error.mapper', () => {
  describe('mapPaymentWriteError', () => {
    it('maps P2025 (row disappeared) to NOT_FOUND', () => {
      const mapped = mapPaymentWriteError(knownError('P2025'));
      expect(mapped).toBeInstanceOf(NotFoundError);
    });

    it('maps P2002 (idempotency/provider_reference unique collision) to IDEMPOTENCY_CONFLICT', () => {
      const mapped = mapPaymentWriteError(
        knownError('P2002', { target: ['store_id', 'idempotency_key'] }),
      );
      expect(mapped).toBeInstanceOf(IdempotencyConflictError);
    });

    it('maps P2003 (missing referenced order) to NOT_FOUND', () => {
      const mapped = mapPaymentWriteError(knownError('P2003'));
      expect(mapped).toBeInstanceOf(NotFoundError);
    });

    it('passes domain errors and unknown errors through untouched', () => {
      const domain = new ConflictError('state conflict');
      expect(mapPaymentWriteError(domain)).toBe(domain);

      const unknown = new Error('boom');
      expect(mapPaymentWriteError(unknown)).toBe(unknown);
    });
  });

  describe('isWebhookDuplicate', () => {
    it('detects the provider_event_id dedup collision', () => {
      expect(isWebhookDuplicate(knownError('P2002', { target: ['provider_event_id'] }))).toBe(true);
    });

    it('rejects other errors and non-unique targets', () => {
      expect(isWebhookDuplicate(knownError('P2025'))).toBe(false);
      expect(isWebhookDuplicate(knownError('P2002', { target: ['idempotency_key'] }))).toBe(false);
      expect(isWebhookDuplicate(new Error('boom'))).toBe(false);
    });
  });

  describe('mapWebhookClaimError', () => {
    it('maps an unexpected unique collision to CONFLICT', () => {
      const mapped = mapWebhookClaimError(knownError('P2002'));
      expect(mapped).toBeInstanceOf(ConflictError);
    });

    it('passes unknown errors through', () => {
      const error = new Error('boom');
      expect(mapWebhookClaimError(error)).toBe(error);
    });
  });
});
