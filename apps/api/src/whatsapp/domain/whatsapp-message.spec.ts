import { buildWhatsAppOrderMessage, WhatsappMessageOrderData } from './whatsapp-message';

const baseData: WhatsappMessageOrderData = {
  orderNumber: 'ORD-2026-000001',
  items: [
    {
      productName: 'Classic T-Shirt',
      variantName: 'Black / Medium',
      quantity: 2,
      lineTotal: 100000n,
    },
    { productName: 'Cap', variantName: null, quantity: 1, lineTotal: 55000n },
  ],
  currency: 'EGP',
  subtotal: 155000n,
  shippingTotal: 10000n,
  grandTotal: 165000n,
  customerName: 'Ziad Hamada',
  customerPhone: '01012345678',
  customerEmail: 'ziad@example.com',
  shippingAddress: { governorate: 'Cairo', city: 'Cairo', addressLine: 'St 1' },
};

describe('buildWhatsAppOrderMessage (Phase 22)', () => {
  it('builds the documented English order message', () => {
    const message = buildWhatsAppOrderMessage(baseData, 'en');
    expect(message).toContain('Hello, I would like to place an order.');
    expect(message).toContain('Order: ORD-2026-000001');
    expect(message).toContain('Items:');
    expect(message).toContain('- Classic T-Shirt / Black / Medium × 2 — EGP 1,000');
    expect(message).toContain('- Cap × 1 — EGP 550');
    expect(message).toContain('Subtotal: EGP 1,550');
    expect(message).toContain('Shipping: EGP 100');
    expect(message).toContain('Total: EGP 1,650');
    expect(message).toContain('Customer:');
    expect(message).toContain('Ziad Hamada');
    expect(message).toContain('01012345678');
    expect(message).toContain('Address:');
    expect(message).toContain('Cairo');
    expect(message).toContain('Please confirm my order and payment instructions.');
  });

  it('builds an Arabic message with the order number and totals', () => {
    const message = buildWhatsAppOrderMessage(baseData, 'ar');
    expect(message).toContain('مرحبًا، أود تقديم طلب.');
    expect(message).toContain('رقم الطلب: ORD-2026-000001');
    expect(message).toContain('الإجمالي');
    expect(message).toContain('يرجى تأكيد طلبي وإبلاغي بتعليمات الدفع.');
  });

  it('does not expose internal ids, secrets or auth data', () => {
    const message = buildWhatsAppOrderMessage(
      {
        ...baseData,
        items: [{ productName: 'Classic T-Shirt', variantName: null, quantity: 1, lineTotal: 500n }],
      },
      'en',
    );
    expect(message).not.toContain('store-1');
    expect(message).not.toContain('order-1');
    expect(message).not.toContain('PAYMOB');
    expect(message).not.toContain('token');
  });

  it('formats line items without repeating the product name when the variant is the same', () => {
    const message = buildWhatsAppOrderMessage(
      {
        ...baseData,
        items: [
          {
            productName: 'Classic T-Shirt',
            variantName: 'Classic T-Shirt',
            quantity: 1,
            lineTotal: 50000n,
          },
        ],
      },
      'en',
    );
    expect(message).toContain('- Classic T-Shirt × 1 — EGP 500');
  });
});
