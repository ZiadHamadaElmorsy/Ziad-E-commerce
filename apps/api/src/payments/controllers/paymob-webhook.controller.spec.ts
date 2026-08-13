import 'reflect-metadata';
import { PaymobWebhookService } from '../services/paymob-webhook.service';
import { PaymobWebhookController } from './paymob-webhook.controller';

describe('PaymobWebhookController', () => {
  let webhook: { processWebhook: jest.Mock };
  let controller: PaymobWebhookController;

  beforeEach(() => {
    webhook = { processWebhook: jest.fn() };
    controller = new PaymobWebhookController(webhook as unknown as PaymobWebhookService);
  });

  it('POST /webhooks/paymob delegates body + query hmac and wraps the result', async () => {
    webhook.processWebhook.mockResolvedValue({ status: 'processed' });

    const result = await controller.handle({ type: 'transaction' }, 'hmac-value');

    expect(webhook.processWebhook).toHaveBeenCalledWith({ type: 'transaction' }, 'hmac-value');
    expect(result).toEqual({ data: { status: 'processed' } });
  });

  it('passes undefined hmac when the query parameter is absent', async () => {
    webhook.processWebhook.mockResolvedValue({ status: 'already_processed' });

    const result = await controller.handle({ type: 'transaction' }, undefined);

    expect(webhook.processWebhook).toHaveBeenCalledWith({ type: 'transaction' }, undefined);
    expect(result).toEqual({ data: { status: 'already_processed' } });
  });
});
