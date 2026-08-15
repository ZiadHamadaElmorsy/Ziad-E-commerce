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
    publicKey: 'pub-key',
    hmacSecret: 'hmac-secret',
    webhookUrl: 'https://api.example.com/api/v1/webhooks/paymob',
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

  describe('onModuleInit diagnostics (Phase 21/22)', () => {
    it('warns with the exact missing variable names when credentials are absent', () => {
      configService.get.mockReturnValue({ apiUrl: 'https://accept.paymob.com' });
      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      provider.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PAYMOB_API_KEY'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PAYMOB_INTEGRATION_ID'));
      // Phase 22: iframe id is NOT required anymore; public key is.
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PAYMOB_PUBLIC_KEY'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('PAYMOB_HMAC_SECRET'));
      warnSpy.mockRestore();
    });

    it('logs configured when every credential is present', () => {
      const logSpy = jest.spyOn(provider['logger'], 'log').mockImplementation(() => undefined);

      provider.onModuleInit();

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('configured'));
      logSpy.mockRestore();
    });

    it('warns when PAYMOB_API_KEY is a legacy JWT that the Intention API rejects (Phase 24)', () => {
      configService.get.mockReturnValue({
        ...paymobConfig,
        apiKey: 'ZXlKaGJHY2lPaUpJVXpVeE1pSXNJblI1Y0NJNklrcFhWQ0o5',
      });
      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      provider.onModuleInit();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('LEGACY JWT'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('egy_sk_test_'),
      );
      warnSpy.mockRestore();
    });
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

    it('fails closed when the public key is missing (Intention flow requirement)', async () => {
      configService.get.mockReturnValue({
        apiUrl: 'https://accept.paymob.test',
        apiKey: 'api-key',
        integrationId: '424242',
        hmacSecret: 'hmac-secret',
      });

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('creates an Intention and returns the Unified Checkout URL (Phase 22/24)', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 556677, client_secret: 'sec_client_123' }),
      } as Response);

      const result = await provider.initiatePayment({ ...input, returnUrl: 'https://store.example.com/return' });

      // A single Intention API call to /v1/intention with the secret key in
      // the Authorization header (current contract).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://accept.paymob.test/v1/intention',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer api-key',
          }),
          body: expect.stringContaining('"special_reference":"payment-1"'),
        }),
      );

      const sentBody = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      ) as Record<string, unknown>;

      expect(sentBody).toMatchObject({
        amount: 1000,
        currency: 'EGP',
        payment_methods: [424242],
        special_reference: 'payment-1',
        notification_url: 'https://api.example.com/api/v1/webhooks/paymob',
        redirection_url: 'https://store.example.com/return',
        expiration: 600,
      });
      // The secret is carried ONLY in the Authorization header, never in the body.
      expect(sentBody.api_key).toBeUndefined();
      expect(sentBody.redirect_url).toBeUndefined();
      expect(sentBody.expires_in).toBeUndefined();
      expect((sentBody.billing_data as Record<string, string>).email).toBe('a@b.com');

      // providerReference = intention id; checkout URL carries client_secret.
      expect(result.providerReference).toBe('556677');
      expect(result.providerCheckoutUrl).toBe(
        'https://accept.paymob.test/unifiedcheckout/?publicKey=pub-key&clientSecret=sec_client_123',
      );
    });

    it('supports the documented Token auth scheme via PAYMOB_AUTH_SCHEME', async () => {
      configService.get.mockReturnValue({ ...paymobConfig, authScheme: 'Token' });
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1, client_secret: 'sec_client_token' }),
      } as Response);

      const result = await provider.initiatePayment(input);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://accept.paymob.test/v1/intention',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Token api-key' }),
        }),
      );
      expect(result.providerCheckoutUrl).toContain('clientSecret=sec_client_token');
    });

    it('falls back to client_secret as the provider reference when no intention id is returned', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ client_secret: 'sec_client_456' }),
      } as Response);

      const result = await provider.initiatePayment(input);

      expect(result.providerReference).toBe('sec_client_456');
      expect(result.providerCheckoutUrl).toContain('clientSecret=sec_client_456');
    });

    it('fails closed when the Intention response lacks a client_secret', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 1 }),
      } as Response);

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);
    });

    it('fails closed when the Intention API call fails', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400 } as Response);

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);
    });

    it('logs the legacy-key remediation hint on a 401 (Intention auth rejection)', async () => {
      fetchMock.mockResolvedValueOnce({ ok: false, status: 401 } as Response);
      const warnSpy = jest.spyOn(provider['logger'], 'warn').mockImplementation(() => undefined);

      await expect(provider.initiatePayment(input)).rejects.toBeInstanceOf(ConflictError);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('egy_sk_test_'),
      );
      warnSpy.mockRestore();
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

    it('accepts a valid signature computed with the CURRENT 20-field list (Phase 24)', () => {
      const obj = {
        amount_cents: 1000,
        created_at: '2026-08-12T10:00:00.000000',
        currency: 'EGP',
        error_occured: false,
        has_parent_transaction: false,
        id: 88131,
        integration_id: 424242,
        is_3d_secure: false,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: false,
        is_voided: false,
        order: { id: 112233, merchant_order_id: 'payment-1', amount_cents: 1000 },
        owner: 3,
        pending: false,
        source_data: { pan: '5123', sub_type: 'MasterCard', type: 'card' },
        success: true,
      };
      const hmac = signCurrent(obj, 'hmac-secret');
      expect(provider.verifyWebhookSignature({ type: 'transaction', obj, hmac })).toBe(true);
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

/** Signs with the CURRENT (20-field) Paymob concatenation order (Phase 24). */
function signCurrent(obj: Record<string, unknown>, secret: string): string {
  const fields = [
    'amount_cents',
    'created_at',
    'currency',
    'error_occured',
    'has_parent_transaction',
    'id',
    'integration_id',
    'is_3d_secure',
    'is_auth',
    'is_capture',
    'is_refunded',
    'is_standalone_payment',
    'is_voided',
    'order.id',
    'owner',
    'pending',
    'source_data.pan',
    'source_data.sub_type',
    'source_data.type',
    'success',
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
