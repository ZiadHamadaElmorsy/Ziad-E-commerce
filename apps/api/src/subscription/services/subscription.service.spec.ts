import { SubscriptionStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RequestContextService } from '../../common/context/request-context.service';
import {
  ForbiddenError,
  NotFoundError,
  StateTransitionError,
  TenantContextRequiredError,
} from '../../common/errors/domain-exceptions';
import { TransactionService } from '../../infrastructure/database/transaction.service';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import {
  DEFAULT_TRIAL_DAYS,
  EXPIRED_WRITE_MESSAGE,
  SubscriptionService,
} from './subscription.service';

describe('SubscriptionService', () => {
  let requestContext: { getCurrent: jest.Mock };
  let subscriptions: {
    findByStoreId: jest.Mock;
    create: jest.Mock;
    updateGuarded: jest.Mock;
  };
  let transaction: { runWithTenant: jest.Mock; run: jest.Mock };
  let config: { get: jest.Mock };
  let service: SubscriptionService;

  const storeId = 'store-1';

  const trialRow = {
    id: 'sub-1',
    storeId,
    status: SubscriptionStatus.TRIAL,
    trialStartedAt: new Date('2026-08-12T00:00:00Z'),
    trialEndsAt: new Date('2026-08-26T00:00:00Z'),
    activatedAt: null,
    expiresAt: null,
    createdAt: new Date('2026-08-12T00:00:00Z'),
    updatedAt: new Date('2026-08-12T00:00:00Z'),
  };

  function row(status: SubscriptionStatus, overrides: Record<string, unknown> = {}) {
    return { ...trialRow, status, ...overrides };
  }

  beforeEach(() => {
    requestContext = {
      getCurrent: jest.fn().mockReturnValue({ store: { id: storeId } }),
    };
    subscriptions = {
      findByStoreId: jest.fn(),
      create: jest.fn(),
      updateGuarded: jest.fn().mockResolvedValue({ count: 1 }),
    };
    transaction = {
      runWithTenant: jest
        .fn()
        .mockImplementation(async (store: string, work: (tx: never) => unknown) =>
          work(tx as never),
        ),
      run: jest.fn(),
    };
    config = { get: jest.fn() };

    service = new SubscriptionService(
      requestContext as unknown as RequestContextService,
      subscriptions as unknown as SubscriptionRepository,
      transaction as unknown as TransactionService,
      config as unknown as ConfigService,
    );
  });

  describe('startTrial (US-SUB-001)', () => {
    it('creates a TRIAL row with start/end dates computed from the configured trial duration', async () => {
      config.get.mockReturnValue(30);
      const now = new Date('2026-08-12T00:00:00Z');

      await service.startTrial(tx, storeId, now);

      expect(subscriptions.create).toHaveBeenCalledWith(tx, {
        storeId,
        status: SubscriptionStatus.TRIAL,
        trialStartedAt: now,
        trialEndsAt: new Date('2026-09-11T00:00:00Z'),
      });
    });

    it('falls back to the default trial duration when not configured (configurable, not hard-coded)', async () => {
      config.get.mockReturnValue(undefined);
      const now = new Date('2026-08-12T00:00:00Z');

      await service.startTrial(tx, storeId, now);

      expect(subscriptions.create).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          status: SubscriptionStatus.TRIAL,
          trialEndsAt: new Date(now.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000),
        }),
      );
    });
  });

  describe('getCurrent (GET /api/v1/subscription)', () => {
    it('resolves the store from the trusted tenant context', async () => {
      subscriptions.findByStoreId.mockResolvedValue(trialRow);

      const view = await service.getCurrent(new Date('2026-08-20T00:00:00Z'));

      expect(subscriptions.findByStoreId).toHaveBeenCalledWith(storeId);
      expect(view.status).toBe(SubscriptionStatus.TRIAL);
      expect(view.id).toBe('sub-1');
    });

    it('fails with TENANT_CONTEXT_REQUIRED when no tenant context is present', async () => {
      requestContext.getCurrent.mockReturnValue({ store: undefined });

      await expect(service.getCurrent()).rejects.toBeInstanceOf(TenantContextRequiredError);
      expect(subscriptions.findByStoreId).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when no subscription row exists', async () => {
      subscriptions.findByStoreId.mockResolvedValue(null);

      await expect(service.getCurrentForStore(storeId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('lazily transitions an elapsed TRIAL to EXPIRED and reports it', async () => {
      const elapsed = row(SubscriptionStatus.TRIAL, {
        trialEndsAt: new Date('2026-08-01T00:00:00Z'),
      });
      subscriptions.findByStoreId.mockResolvedValue(elapsed);

      const view = await service.getCurrentForStore(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(transaction.runWithTenant).toHaveBeenCalledWith(storeId, expect.any(Function));
      expect(subscriptions.updateGuarded).toHaveBeenCalledWith(
        tx,
        storeId,
        SubscriptionStatus.TRIAL,
        expect.objectContaining({
          status: SubscriptionStatus.EXPIRED,
          expiresAt: new Date('2026-08-20T00:00:00Z'),
        }),
      );
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('is idempotent: repeated evaluation after the transition performs no second write', async () => {
      const alreadyExpired = row(SubscriptionStatus.EXPIRED, {
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });
      subscriptions.findByStoreId.mockResolvedValue(alreadyExpired);

      const view = await service.getCurrentForStore(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('does not transition when the trial end date is still in the future', async () => {
      subscriptions.findByStoreId.mockResolvedValue(trialRow);

      const view = await service.getCurrentForStore(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(view.status).toBe(SubscriptionStatus.TRIAL);
    });

    it('re-reads when a concurrent request already performed the transition (guarded count 0)', async () => {
      const elapsed = row(SubscriptionStatus.TRIAL, {
        trialEndsAt: new Date('2026-08-01T00:00:00Z'),
      });
      subscriptions.findByStoreId.mockResolvedValueOnce(elapsed);
      subscriptions.updateGuarded.mockResolvedValue({ count: 0 });
      subscriptions.findByStoreId.mockResolvedValueOnce(
        row(SubscriptionStatus.EXPIRED, { expiresAt: new Date('2026-08-20T00:00:00Z') }),
      );

      const view = await service.getCurrentForStore(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(subscriptions.findByStoreId).toHaveBeenCalledTimes(2);
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });
  });

  describe('assertMerchantWriteAllowed (read-only dashboard overlay)', () => {
    it('allows writes while the subscription is TRIAL (future trial end)', async () => {
      subscriptions.findByStoreId.mockResolvedValue(trialRow);

      await expect(service.assertMerchantWriteAllowed(storeId)).resolves.toBeUndefined();
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('allows writes while the subscription is ACTIVE', async () => {
      subscriptions.findByStoreId.mockResolvedValue(row(SubscriptionStatus.ACTIVE));

      await expect(service.assertMerchantWriteAllowed(storeId)).resolves.toBeUndefined();
    });

    it('blocks writes with FORBIDDEN when the subscription is EXPIRED', async () => {
      subscriptions.findByStoreId.mockResolvedValue(
        row(SubscriptionStatus.EXPIRED, { expiresAt: new Date('2026-08-01T00:00:00Z') }),
      );

      await expect(service.assertMerchantWriteAllowed(storeId)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(service.assertMerchantWriteAllowed(storeId)).rejects.toMatchObject({
        message: EXPIRED_WRITE_MESSAGE,
      });
    });

    it('blocks writes when an elapsed TRIAL is lazily expired', async () => {
      subscriptions.findByStoreId.mockResolvedValue(
        row(SubscriptionStatus.TRIAL, { trialEndsAt: new Date('2026-08-01T00:00:00Z') }),
      );

      await expect(
        service.assertMerchantWriteAllowed(storeId, new Date('2026-08-20T00:00:00Z')),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows writes for a store without a subscription row (DATABASE default TRIAL semantics)', async () => {
      subscriptions.findByStoreId.mockResolvedValue(null);

      await expect(service.assertMerchantWriteAllowed(storeId)).resolves.toBeUndefined();
    });
  });

  describe('resolveStorefrontStatus (read-only overlay for the public path)', () => {
    it('returns TRIAL when no subscription row exists', async () => {
      subscriptions.findByStoreId.mockResolvedValue(null);

      await expect(service.resolveStorefrontStatus(storeId)).resolves.toBe(
        SubscriptionStatus.TRIAL,
      );
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('returns the stored status for ACTIVE', async () => {
      subscriptions.findByStoreId.mockResolvedValue(row(SubscriptionStatus.ACTIVE));

      await expect(service.resolveStorefrontStatus(storeId)).resolves.toBe(
        SubscriptionStatus.ACTIVE,
      );
    });

    it('returns EXPIRED for an elapsed TRIAL WITHOUT performing any write', async () => {
      subscriptions.findByStoreId.mockResolvedValue(
        row(SubscriptionStatus.TRIAL, { trialEndsAt: new Date('2026-08-01T00:00:00Z') }),
      );

      await expect(
        service.resolveStorefrontStatus(storeId, new Date('2026-08-20T00:00:00Z')),
      ).resolves.toBe(SubscriptionStatus.EXPIRED);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(subscriptions.updateGuarded).not.toHaveBeenCalled();
    });

    it('returns EXPIRED for an EXPIRED row', async () => {
      subscriptions.findByStoreId.mockResolvedValue(row(SubscriptionStatus.EXPIRED));

      await expect(service.resolveStorefrontStatus(storeId)).resolves.toBe(
        SubscriptionStatus.EXPIRED,
      );
    });
  });

  describe('activate (TRIAL -> ACTIVE and reactivation EXPIRED -> ACTIVE)', () => {
    it('activates a TRIAL subscription and sets activated_at', async () => {
      subscriptions.findByStoreId.mockResolvedValue(trialRow);

      const view = await service.activate(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(transaction.runWithTenant).toHaveBeenCalledWith(storeId, expect.any(Function));
      expect(subscriptions.updateGuarded).toHaveBeenCalledWith(
        tx,
        storeId,
        SubscriptionStatus.TRIAL,
        expect.objectContaining({
          status: SubscriptionStatus.ACTIVE,
          activatedAt: new Date('2026-08-20T00:00:00Z'),
        }),
      );
      expect(view.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('reactivates an EXPIRED subscription (reactivation supported)', async () => {
      subscriptions.findByStoreId.mockResolvedValue(
        row(SubscriptionStatus.EXPIRED, { expiresAt: new Date('2026-08-01T00:00:00Z') }),
      );

      const view = await service.activate(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(subscriptions.updateGuarded).toHaveBeenCalledWith(
        tx,
        storeId,
        SubscriptionStatus.EXPIRED,
        expect.objectContaining({ status: SubscriptionStatus.ACTIVE }),
      );
      expect(view.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('rejects an ACTIVE -> ACTIVE attempt with STATE_TRANSITION', async () => {
      subscriptions.findByStoreId.mockResolvedValue(row(SubscriptionStatus.ACTIVE));

      await expect(service.activate(storeId)).rejects.toBeInstanceOf(StateTransitionError);
      expect(transaction.runWithTenant).not.toHaveBeenCalled();
    });

    it('fails with NOT_FOUND when no subscription row exists', async () => {
      subscriptions.findByStoreId.mockResolvedValue(null);

      await expect(service.activate(storeId)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('fails closed when a concurrent request already moved the row (guarded count 0, same status)', async () => {
      subscriptions.findByStoreId.mockResolvedValueOnce(trialRow);
      subscriptions.updateGuarded.mockResolvedValue({ count: 0 });
      subscriptions.findByStoreId.mockResolvedValueOnce(trialRow);

      await expect(service.activate(storeId)).rejects.toBeInstanceOf(StateTransitionError);
    });

    it('accepts a concurrent transition applied by another request (guarded count 0, fresh status)', async () => {
      subscriptions.findByStoreId.mockResolvedValueOnce(trialRow);
      subscriptions.updateGuarded.mockResolvedValue({ count: 0 });
      subscriptions.findByStoreId.mockResolvedValueOnce(
        row(SubscriptionStatus.ACTIVE, { activatedAt: new Date('2026-08-20T00:00:00Z') }),
      );

      const view = await service.activate(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(view.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('markExpired (TRIAL -> EXPIRED and ACTIVE -> EXPIRED)', () => {
    it('expires a TRIAL subscription and sets expires_at', async () => {
      subscriptions.findByStoreId.mockResolvedValue(trialRow);

      const view = await service.markExpired(storeId, new Date('2026-08-20T00:00:00Z'));

      expect(subscriptions.updateGuarded).toHaveBeenCalledWith(
        tx,
        storeId,
        SubscriptionStatus.TRIAL,
        expect.objectContaining({
          status: SubscriptionStatus.EXPIRED,
          expiresAt: new Date('2026-08-20T00:00:00Z'),
        }),
      );
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('expires an ACTIVE subscription', async () => {
      subscriptions.findByStoreId.mockResolvedValue(row(SubscriptionStatus.ACTIVE));

      const view = await service.markExpired(storeId);

      expect(subscriptions.updateGuarded).toHaveBeenCalledWith(
        tx,
        storeId,
        SubscriptionStatus.ACTIVE,
        expect.objectContaining({ status: SubscriptionStatus.EXPIRED }),
      );
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('is a no-op for an already-EXPIRED subscription (idempotent)', async () => {
      const expired = row(SubscriptionStatus.EXPIRED, {
        expiresAt: new Date('2026-08-01T00:00:00Z'),
      });
      subscriptions.findByStoreId.mockResolvedValue(expired);

      const view = await service.markExpired(storeId);

      expect(transaction.runWithTenant).not.toHaveBeenCalled();
      expect(view.status).toBe(SubscriptionStatus.EXPIRED);
    });

    it('fails with NOT_FOUND when no subscription row exists', async () => {
      subscriptions.findByStoreId.mockResolvedValue(null);

      await expect(service.markExpired(storeId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });
});

const tx = {} as never;
