import { ShipmentStatus } from '@prisma/client';
import {
  buildCustomerTimeline,
  customerFriendlyStatusKey,
  mapProviderStatusToInternal,
} from './shipment-status-mapper';

describe('Bosta → internal → customer-friendly status mapper (Phase 27 — Part 13)', () => {
  it('maps known Bosta statuses to the normalized internal statuses', () => {
    expect(mapProviderStatusToInternal('PENDING')).toBe(ShipmentStatus.CREATED);
    expect(mapProviderStatusToInternal('PROCESSING')).toBe(ShipmentStatus.HANDED_TO_COURIER);
    expect(mapProviderStatusToInternal('AT_WAREHOUSE')).toBe(ShipmentStatus.AT_DELIVERY_CENTER);
    expect(mapProviderStatusToInternal('OUT_FOR_DELIVERY')).toBe(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(mapProviderStatusToInternal('DELIVERED')).toBe(ShipmentStatus.DELIVERED);
    expect(mapProviderStatusToInternal('REJECTED')).toBe(ShipmentStatus.REJECTED);
    expect(mapProviderStatusToInternal('FAILED')).toBe(ShipmentStatus.DELIVERY_FAILED);
    expect(mapProviderStatusToInternal('RETURNED')).toBe(ShipmentStatus.RETURNED);
    expect(mapProviderStatusToInternal('CANCELLED')).toBe(ShipmentStatus.CANCELLED);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(mapProviderStatusToInternal('  out_for_delivery ')).toBe(
      ShipmentStatus.OUT_FOR_DELIVERY,
    );
  });

  it('returns null for an unrecognized provider status (caller keeps current status)', () => {
    expect(mapProviderStatusToInternal('CUSTOM_STATUS_XYZ')).toBeNull();
    expect(mapProviderStatusToInternal('')).toBeNull();
    expect(mapProviderStatusToInternal(null)).toBeNull();
  });

  it('maps every internal status to a customer-friendly key that is never a raw Bosta status', () => {
    const statuses = Object.values(ShipmentStatus);
    for (const status of statuses) {
      const key = customerFriendlyStatusKey(status);
      expect(key).toBeDefined();
      // The customer-facing key is a safe label, never a provider status string.
      expect(key).not.toBe('AT_WAREHOUSE');
      expect(key).not.toBe('RIDER_ASSIGNED');
    }
    // CREATED maps to the "Order confirmed" step (Part 13 step 1).
    expect(customerFriendlyStatusKey(ShipmentStatus.CREATED)).toBe('ORDER_CONFIRMED');
    expect(customerFriendlyStatusKey(ShipmentStatus.DELIVERED)).toBe('DELIVERED');
  });

  it('builds the ordered delivery timeline with done/current/upcoming states', () => {
    const timeline = buildCustomerTimeline(ShipmentStatus.OUT_FOR_DELIVERY);
    expect(timeline.map((entry) => entry.step)).toEqual([
      'ORDER_CONFIRMED',
      'HANDED_TO_COURIER',
      'AT_DELIVERY_CENTER',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
    ]);
    expect(timeline.map((entry) => entry.state)).toEqual([
      'done',
      'done',
      'done',
      'current',
      'upcoming',
    ]);
  });

  it('builds an all-upcoming timeline when no shipment exists yet', () => {
    const timeline = buildCustomerTimeline(null);
    expect(timeline.every((entry) => entry.state === 'upcoming')).toBe(true);
  });
});
