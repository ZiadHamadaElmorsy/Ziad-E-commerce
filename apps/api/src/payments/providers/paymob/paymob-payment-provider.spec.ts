import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { ConflictError } from '../../../common/errors/domain-exceptions';
import { PaymobPaymentProvider } from './paymob-payment-provider';

describe('PaymobPaymentProvider', () => {
  const configService = { get: jest.fn() };
  let provider: PaymobPaymentProvider;
  let fetchMock: jest.SpyInstance;

  const paymobConfig = {
    apiUrl: 'https://accept.paymob.test',
    apiKey: 'api-key',
    integrationId: '424242',
    iframeId: '7777',
    hmacSecret: 'hmac-secret',
  };

  beforeEach(() => {
    configService.get.mockReset();
    configService.get.mockReturnValue(paymobConfig);
    provider = new PaymobPaymentProvider(configService as unknown as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  describe('initiatePayment', () => {
    const input = {
      paymentId: 'payment-1',
      orderId: 'order-1',
      orderNumber: 'ORD-2026-000001',
      amount: 1000n,
      currency: 'EGP',
      billingData: {
        email: 'a@b.com',
        phone: '01000000000',
        city: 'Tanta',
        governorate: 'Gharbia',
        addressLine: 'St 5',
      },
    };

    it('fails closed when Paymob is not configured', async () => {
      configService.get.mockReturnValue({ apiUrl: 'https://accept.paymob.com' });

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('performs auth -> order register -> payment key and returns the iframe URL', async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'auth-token' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 112233, merchant_order_id: 'payment-1' }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'payment-key-token' }),
        } as Response);

      const result = await provider.initiatePayment(input);

      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://accept.paymob.test/api/auth/tokens',
        expect.objectContaining({ body: JSON.stringify({ api_key: 'api-key' }) }),
      );
      // Order registration: merchant_order_id is the globally-unique payment id
      // and amount stays integer minor units (never a float).
      const registerCall = fetchMock.mock.calls[1];
      expect(registerCall[0]).toBe('https://accept.paymob.test/api/ecommerce/orders/register');
      const registerBody = JSON.parse(String(registerCall[1].body));
      expect(registerBody).toMatchObject({
        auth_token: 'auth-token',
        amount_cents: '1000',
        currency: 'EGP',
        merchant_order_id: 'payment-1',
      });
      // Payment key request carries the integration id + billing data.
      const keyCall = fetchMock.mock.calls[2];
      expect(keyCall[0]).toBe('https://accept.paymob.test/api/acceptance/payment_keys');
      const keyBody = JSON.parse(String(keyCall[1].body));
      expect(keyBody.integration_id).toBe('424242');
      expect(keyBody.billing_data.email).toBe('a@b.com');
      expect(keyBody.billing_data.state).toBe('Gharbia');

      expect(result).toEqual({
        providerReference: '112233',
        providerCheckoutUrl:
          'https://accept.paymob.test/api/acceptance/iframes/7777?payment_token=payment-key-token',
      });
    });

    it('throws a safe ConflictError when a provider call returns an HTTP error', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);

      await expect(provider.initiatePayment(input)).rejects.toThrow('Payment initiation failed.');
    });

    it('throws a safe ConflictError when a required token is missing', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('verifyWebhookSignature', () => {
    function signedPayload(overrides: Record<string, unknown> = {}) {
      const obj = {
        amount_cents: 1000,
        created_at: '2026-08-12T10:00:00.000000',
        currency: 'EGP',
        error_occurred: false,
        has_source_management: false,
        id: 88131,
        is_3d_secure: false,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_refunded_partial: false,
        is_standalone_payment: false,
        is_voided: false,
        order: { id: 112233, merchant_order_id: 'payment-1', amount_cents: 1000 },
        owner: 3,
        pending: false,
        refunded_amount_cents: 0,
        source_data: { pan: '5123', sub_type: 'MasterCard', type: 'card' },
        success: true,
        token: 'x',
        transaction_id: 77123,
        ...overrides,
      };
      const hmac = sign(obj, 'hmac-secret');
      return { type: 'transaction', obj, hmac };
    }

    it('accepts a valid signature from the body', () => {
      expect(provider.verifyWebhookSignature(signedPayload())).toBe(true);
    });

    it('accepts a valid signature passed via the query fallback', () => {
      const payload = signedPayload();
      const { hmac, ...rest } = payload;
      expect(provider.verifyWebhookSignature(rest, hmac)).toBe(true);
    });

    it('fails closed when the HMAC secret is unconfigured', () => {
      configService.get.mockReturnValue({ ...paymobConfig, hmacSecret: undefined });
      expect(provider.verifyWebhookSignature(signedPayload())).toBe(false);
    });

    it('rejects a forged/tampered callback', () => {
      const forged = signedPayload({ success: false });
      forged.obj.success = true; // tamper AFTER signing
      expect(provider.verifyWebhookSignature(forged)).toBe(false);
    });

    it('rejects payloads without an obj/hmac', () => {
      expect(provider.verifyWebhookSignature({ type: 'transaction' })).toBe(false);
      expect(provider.verifyWebhookSignature(null)).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('maps a successful transaction callback into the provider-agnostic view', () => {
      const event = provider.parseWebhookEvent({
        type: 'transaction',
        obj: {
          id: 'txn-1',
          success: true,
          pending: false,
          order: { merchant_order_id: 'payment-1' },
          data: { message: 'Approved' },
        },
      });

      expect(event).toEqual({
        providerEventId: 'txn-1',
        eventType: 'transaction',
        paymentReference: 'payment-1',
        success: true,
        pending: false,
        failureCode: null,
        failureMessage: null,
      });
    });

    it('maps a failed callback with a safe failure message', () => {
      const event = provider.parseWebhookEvent({
        type: 'transaction',
        obj: {
          id: 'txn-2',
          success: false,
          error_occurred: true,
          order: { merchant_order_id: 'payment-2' },
          data: { message: 'Insufficient funds' },
        },
      });

      expect(event).toMatchObject({
        providerEventId: 'txn-2',
        success: false,
        paymentReference: 'payment-2',
        failureMessage: 'Insufficient funds',
      });
    });

    it('returns null for malformed payloads or missing transaction id', () => {
      expect(provider.parseWebhookEvent(null)).toBeNull();
      expect(provider.parseWebhookEvent({ type: 'transaction', obj: {} })).toBeNull();
      expect(
        provider.parseWebhookEvent({ type: 'transaction', obj: { success: true } }),
      ).toBeNull();
    });
  });
});

/** Reproduces the documented Paymob signing algorithm for test fixtures. */
function sign(obj: Record<string, unknown>, secret: string): string {
  const fields = [
    'amount_cents',
    'created_at',
    'currency',
    'error_occurred',
    'has_source_management',
    'id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_refunded_partial',
    'is_standalone_payment',
    'is_voided',
    'order',
    'owner',
    'pending',
    'refunded_amount_cents',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
    'token',
    'transaction_id',
  ] as const;

  let raw = '';
  for (const field of fields) {
    raw += resolveField(obj, field);
  }
  raw += secret;
  return createHmac('sha512', secret).update(raw, 'utf8').digest('hex');
}

function resolveField(obj: Record<string, unknown>, field: string): string {
  const segments = field.split('.');
  let value: unknown = obj;
  for (const segment of segments) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return '';
    }
    value = (value as Record<string, unknown>)[segment];
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}
