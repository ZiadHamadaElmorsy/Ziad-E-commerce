import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../common/errors/domain-exceptions';
import { BostaShippingProvider } from './bosta-shipping-provider';

describe('BostaShippingProvider (Phase 27 — Part 8)', () => {
  function provider(config: Record<string, unknown> = {}): BostaShippingProvider {
    return new BostaShippingProvider(
      new ConfigService({ bosta: { apiUrl: 'https://api.bosta.co', ...config } }),
    );
  }

  describe('parseWebhookEvent', () => {
    it('parses a delivery event with data.shipmentId + status', () => {
      const parsed = provider().parseWebhookEvent(
        JSON.stringify({
          eventId: 'evt-42',
          data: { _id: 'bosta-1', status: 'OUT_FOR_DELIVERY' },
        }),
      );
      expect(parsed).toEqual({
        providerEventId: 'evt-42',
        providerShipmentId: 'bosta-1',
        providerStatus: 'OUT_FOR_DELIVERY',
        occurredAt: undefined,
      });
    });

    it('falls back to body-level shipment id/status', () => {
      const parsed = provider().parseWebhookEvent(
        JSON.stringify({ shipmentId: 'bosta-2', status: 'DELIVERED' }),
      );
      expect(parsed?.providerShipmentId).toBe('bosta-2');
      expect(parsed?.providerStatus).toBe('DELIVERED');
    });

    it('derives a stable providerEventId when the payload carries none', () => {
      const parsed = provider().parseWebhookEvent(JSON.stringify({ shipmentId: 'bosta-3' }));
      expect(parsed?.providerEventId).toMatch(/^bosta-3:/);
    });

    it('returns null for non-JSON or shipment-less payloads', () => {
      expect(provider().parseWebhookEvent('not-json')).toBeNull();
      expect(provider().parseWebhookEvent(JSON.stringify({ hello: 'world' }))).toBeNull();
    });
  });

  describe('createShipment fail-closed + COD conversion', () => {
    it('throws a safe ConflictError when credentials are missing (never leaks)', async () => {
      const configService = new ConfigService({ bosta: {} });
      const unconfigured = new BostaShippingProvider(configService);
      await expect(
        unconfigured.createShipment({
          storeId: 'store-1',
          orderId: 'order-1',
          orderNumber: 'ORD-1',
          customer: { name: 'Ahmed', phone: '0100', email: null },
          address: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
          codAmount: 75000n,
          shippingCost: 0n,
          items: [],
        }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('rejects a COD amount smaller than EGP 1 (minor-units boundary)', async () => {
      const configured = provider({ apiKey: 'secret-key' });
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ data: { _id: 'b-1' } }), { status: 200 }));
      try {
        await expect(
          configured.createShipment({
            storeId: 'store-1',
            orderId: 'order-1',
            orderNumber: 'ORD-1',
            customer: { name: 'Ahmed', phone: '0100', email: null },
            address: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
            codAmount: 50n,
            shippingCost: 0n,
            items: [],
          }),
        ).rejects.toBeInstanceOf(ConflictError);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('converts minor-unit COD to EGP units in the provider payload (75000 → 750)', async () => {
      const configured = provider({ apiKey: 'secret-key' });
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response(JSON.stringify({ data: { _id: 'b-1' } }), { status: 200 }));
      try {
        const created = await configured.createShipment({
          storeId: 'store-1',
          orderId: 'order-1',
          orderNumber: 'ORD-2026-000001',
          customer: { name: 'Ahmed Ali', phone: '0100', email: null },
          address: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1', building: '5' },
          codAmount: 75000n,
          shippingCost: 0n,
          items: [{ name: 'T-Shirt', quantity: 1, unitPrice: 75000n }],
        });
        expect(created.providerShipmentId).toBe('b-1');

        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        expect(body.cod).toBe(750);
        expect(body.businessReference).toBe('order-1');
        expect(body.notes).toBe('Order ORD-2026-000001');
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
