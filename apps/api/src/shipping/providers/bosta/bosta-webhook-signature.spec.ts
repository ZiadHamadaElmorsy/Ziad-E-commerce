import { createHmac } from 'node:crypto';
import { verifyBostaWebhookSignature } from './bosta-webhook-signature';

describe('Bosta webhook signature verification (Phase 27 — Part 15)', () => {
  const secret = 'webhook-secret';
  const body = JSON.stringify({ eventId: 'evt-1', shipmentId: 'bosta-1', status: 'DELIVERED' });
  const sign = (raw: string, key: string): string =>
    createHmac('sha256', key).update(raw, 'utf8').digest('hex');

  it('accepts a valid HMAC-SHA256 over the raw body', () => {
    expect(verifyBostaWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it('fails closed on a mismatched signature', () => {
    expect(verifyBostaWebhookSignature(body, sign(body, 'wrong-secret'), secret)).toBe(false);
  });

  it('fails closed when the secret is unconfigured', () => {
    expect(verifyBostaWebhookSignature(body, sign(body, secret), undefined)).toBe(false);
    expect(verifyBostaWebhookSignature(body, sign(body, secret), '')).toBe(false);
  });

  it('fails closed when the signature header is missing/empty', () => {
    expect(verifyBostaWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyBostaWebhookSignature(body, '', secret)).toBe(false);
  });

  it('fails closed on an empty raw body', () => {
    expect(verifyBostaWebhookSignature('', sign(body, secret), secret)).toBe(false);
  });

  it('normalizes the received signature case', () => {
    expect(verifyBostaWebhookSignature(body, sign(body, secret).toUpperCase(), secret)).toBe(true);
  });
});
