import { ConfigService } from '@nestjs/config';
import { CartService } from '../cart/services/cart.service';
import { InventoryReservationService } from '../inventory/services/inventory-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { SweepLeaseService } from './sweep-lease.service';

describe('ReservationExpiryJob', () => {
  let prisma: { store: { findMany: jest.Mock } };
  let carts: { expireDueCartsForStore: jest.Mock };
  let reservations: { expireDueReservationsForStore: jest.Mock };
  let configService: { get: jest.Mock };
  let leases: { tryAcquire: jest.Mock; release: jest.Mock };
  let job: ReservationExpiryJob;

  beforeEach(() => {
    prisma = { store: { findMany: jest.fn() } };
    carts = { expireDueCartsForStore: jest.fn().mockResolvedValue({ scanned: 1, expired: 1 }) };
    reservations = {
      expireDueReservationsForStore: jest
        .fn()
        .mockResolvedValue({ scanned: 1, released: 1 }),
    };
    configService = { get: jest.fn().mockReturnValue(100) };
    leases = { tryAcquire: jest.fn().mockResolvedValue(true), release: jest.fn().mockResolvedValue(undefined) };
    job = new ReservationExpiryJob(
      prisma as unknown as PrismaService,
      carts as unknown as CartService,
      reservations as unknown as InventoryReservationService,
      configService as unknown as ConfigService,
      leases as unknown as SweepLeaseService,
    );
  });

  afterEach(() => {
    job.onModuleDestroy();
  });

  it('acquires the lease, runs the sweep for every store and releases it', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 'store-1' }, { id: 'store-2' }]);

    const result = await job.runSweep();

    expect(leases.tryAcquire).toHaveBeenCalledWith(
      'reservation-expiry-sweep',
      100,
      expect.any(String),
    );
    expect(carts.expireDueCartsForStore).toHaveBeenCalledTimes(2);
    expect(carts.expireDueCartsForStore).toHaveBeenCalledWith('store-1', 100);
    expect(carts.expireDueCartsForStore).toHaveBeenCalledWith('store-2', 100);
    expect(reservations.expireDueReservationsForStore).toHaveBeenCalledTimes(2);
    expect(leases.release).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ stores: 2, cartsExpired: 2, reservationsReleased: 2 });
  });

  it('skips the whole pass (without touching stores) when another node holds the lease', async () => {
    leases.tryAcquire.mockResolvedValue(false);
    prisma.store.findMany.mockResolvedValue([{ id: 'store-1' }]);

    const result = await job.runSweep();

    expect(prisma.store.findMany).not.toHaveBeenCalled();
    expect(carts.expireDueCartsForStore).not.toHaveBeenCalled();
    expect(reservations.expireDueReservationsForStore).not.toHaveBeenCalled();
    expect(leases.release).not.toHaveBeenCalled();
    expect(result).toEqual({ stores: 0, cartsExpired: 0, reservationsReleased: 0 });
  });

  it('keeps sweeping other stores when one store fails', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 'store-1' }, { id: 'store-2' }]);
    carts.expireDueCartsForStore.mockRejectedValueOnce(new Error('db down'));

    const result = await job.runSweep();

    // store-1 failed before either sweep ran; store-2 swept both units.
    expect(result).toEqual({ stores: 2, cartsExpired: 1, reservationsReleased: 1 });
  });

  it('is idempotent: a second run releases nothing when nothing is due', async () => {
    prisma.store.findMany.mockResolvedValue([{ id: 'store-1' }]);
    carts.expireDueCartsForStore.mockResolvedValue({ scanned: 0, expired: 0 });
    reservations.expireDueReservationsForStore.mockResolvedValue({ scanned: 0, released: 0 });

    const first = await job.runSweep();
    const second = await job.runSweep();

    expect(first).toEqual({ stores: 1, cartsExpired: 0, reservationsReleased: 0 });
    expect(second).toEqual({ stores: 1, cartsExpired: 0, reservationsReleased: 0 });
  });

  it('does not schedule a timer when the sweep is disabled', () => {
    configService.get.mockReturnValue(false);
    const spy = jest.spyOn(global, 'setInterval');

    job.onModuleInit();

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('schedules a timer with the configured interval when enabled', () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'expiry.sweepEnabled') return true;
      if (key === 'expiry.sweepIntervalMs') return 60_000;
      return 100;
    });
    const spy = jest.spyOn(global, 'setInterval').mockImplementation(() => ({ unref() {} }) as never);

    job.onModuleInit();

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    spy.mockRestore();
  });
});
