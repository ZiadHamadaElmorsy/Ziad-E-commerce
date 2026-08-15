/**
 * WhatsApp order message builder (Phase 22).
 *
 * Builds a human-readable, plain-text order summary that is URL-encoded by
 * the caller into the wa.me link. Only purchase-time snapshots are used
 * (order number, item names/quantities/totals, customer contact and the
 * shipping address snapshot) — never internal ids, auth/session data or
 * secrets.
 */

export type WhatsappMessageLocale = 'en' | 'ar';

export interface WhatsappMessageItem {
  productName: string;
  variantName: string | null;
  quantity: number;
  /** Integer minor units (EGP piastres). */
  lineTotal: bigint;
}

export interface WhatsappMessageOrderData {
  orderNumber: string;
  items: WhatsappMessageItem[];
  currency: string;
  subtotal: bigint;
  shippingTotal: bigint;
  grandTotal: bigint;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  /** Purchase-time shipping snapshot (governorate/city/addressLine/...). */
  shippingAddress: Record<string, unknown> | null;
}

const TEMPLATES = {
  en: {
    hello: 'Hello, I would like to place an order.',
    orderLabel: 'Order',
    itemsLabel: 'Items',
    subtotalLabel: 'Subtotal',
    shippingLabel: 'Shipping',
    totalLabel: 'Total',
    customerLabel: 'Customer',
    addressLabel: 'Address',
    footer: 'Please confirm my order and payment instructions.',
  },
  ar: {
    hello: 'مرحبًا، أود تقديم طلب.',
    orderLabel: 'رقم الطلب',
    itemsLabel: 'المنتجات',
    subtotalLabel: 'المجموع الفرعي',
    shippingLabel: 'الشحن',
    totalLabel: 'الإجمالي',
    customerLabel: 'العميل',
    addressLabel: 'العنوان',
    footer: 'يرجى تأكيد طلبي وإبلاغي بتعليمات الدفع.',
  },
} as const;

/** Formats minor-unit money as `<currency> <formatted amount>` (no decimals). */
function formatMoney(amount: bigint, currency: string, locale: WhatsappMessageLocale): string {
  const value = Number(amount) / 100;
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  return `${currency} ${formatted}`;
}

function itemLabel(
  item: WhatsappMessageItem,
  currency: string,
  locale: WhatsappMessageLocale,
): string {
  const name = item.variantName && item.variantName !== item.productName
    ? `${item.productName} / ${item.variantName}`
    : item.productName;
  return `- ${name} × ${item.quantity} — ${formatMoney(item.lineTotal, currency, locale)}`;
}

/** Renders the shipping snapshot into a readable list of lines. */
function addressLines(address: Record<string, unknown> | null): string[] {
  if (!address) {
    return [];
  }
  const order: string[] = ['country', 'governorate', 'city', 'addressLine', 'building', 'apartment'];
  const lines: string[] = [];
  for (const key of order) {
    const value = address[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      lines.push(value.trim());
    }
  }
  return lines;
}

/**
 * Builds the WhatsApp order message. Line-based plain text, safe to URL-encode
 * and safe for Arabic content.
 */
export function buildWhatsAppOrderMessage(
  data: WhatsappMessageOrderData,
  locale: WhatsappMessageLocale,
): string {
  const t = TEMPLATES[locale];
  const lines: string[] = [];

  lines.push(t.hello);
  lines.push('');
  lines.push(`${t.orderLabel}: ${data.orderNumber}`);
  lines.push('');

  if (data.items.length > 0) {
    lines.push(`${t.itemsLabel}:`);
    lines.push(...data.items.map((item) => itemLabel(item, data.currency, locale)));
    lines.push('');
  }

  lines.push(`${t.subtotalLabel}: ${formatMoney(data.subtotal, data.currency, locale)}`);
  lines.push(`${t.shippingLabel}: ${formatMoney(data.shippingTotal, data.currency, locale)}`);
  lines.push(`${t.totalLabel}: ${formatMoney(data.grandTotal, data.currency, locale)}`);
  lines.push('');

  lines.push(`${t.customerLabel}:`);
  lines.push(data.customerName);
  if (data.customerPhone) {
    lines.push(data.customerPhone);
  }
  if (data.customerEmail) {
    lines.push(data.customerEmail);
  }
  lines.push('');

  const address = addressLines(data.shippingAddress);
  if (address.length > 0) {
    lines.push(`${t.addressLabel}:`);
    lines.push(...address);
    lines.push('');
  }

  lines.push(t.footer);
  return lines.join('\n');
}
