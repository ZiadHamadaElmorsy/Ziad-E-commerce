'use client';

import { useI18n } from '@/lib/i18n/i18n-context';
import { cn } from '@/lib/utils';
import { SectionHeading } from './SectionHeading';
import { MockTable, StatusPill, StorefrontProduct, StorefrontWindow } from './mockups';

function ProductVisual() {
  return (
    <MockTable
      head={['Product', 'Status', 'Price']}
      rows={[
        [
          'Classic T-Shirt',
          <StatusPill tone="green" key="s1">
            Active
          </StatusPill>,
          'EGP 350',
        ],
        [
          'Slim Jeans',
          <StatusPill tone="green" key="s2">
            Active
          </StatusPill>,
          'EGP 720',
        ],
        [
          'Winter Jacket',
          <StatusPill tone="gray" key="s3">
            Draft
          </StatusPill>,
          'EGP 1,150',
        ],
      ]}
    />
  );
}

function InventoryVisual() {
  const rows = [
    { sku: 'TSH-M-BLK', stock: '42', pct: 70 },
    { sku: 'JNS-32-BLU', stock: '18', pct: 45 },
    { sku: 'JCK-L-GRN', stock: '5', pct: 20 },
  ];
  return (
    <div className="mk-visual-panel">
      {rows.map((row) => (
        <div className="mk-inv-row" key={row.sku}>
          <span className="mk-inv-row__meta">
            <strong>{row.sku}</strong>
            <small>{row.stock} in stock</small>
          </span>
          <span className="mk-inv-row__bar">
            <i style={{ width: `${row.pct}%` }} />
          </span>
        </div>
      ))}
      <p className="mk-visual-caption">Stock levels per variant</p>
    </div>
  );
}

function OrdersVisual() {
  const steps = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered'];
  return (
    <div className="mk-visual-panel">
      <div className="mk-order-timeline">
        {steps.map((step, index) => (
          <span className="mk-order-step" key={step}>
            <i className={cn(index < 4 && 'mk-order-step--done')} />
            <small>{step}</small>
          </span>
        ))}
      </div>
      <p className="mk-visual-caption">Order #1001 · Delivered</p>
    </div>
  );
}

function CustomersVisual() {
  const customers = [
    { name: 'Sara M.', orders: '3 orders', email: 'sara@example.com' },
    { name: 'Omar K.', orders: '1 order', email: 'omar@example.com' },
    { name: 'Lina A.', orders: '7 orders', email: 'lina@example.com' },
  ];
  return (
    <div className="mk-visual-panel">
      {customers.map((customer) => (
        <div className="mk-customer-row" key={customer.name}>
          <span className="mk-customer-row__avatar">{customer.name.charAt(0)}</span>
          <span className="mk-customer-row__meta">
            <strong>{customer.name}</strong>
            <small>{customer.email}</small>
          </span>
          <span className="mk-customer-row__orders">{customer.orders}</span>
        </div>
      ))}
      <p className="mk-visual-caption">Customer profiles with order history</p>
    </div>
  );
}

function PaymentsVisual() {
  return (
    <div className="mk-checkout-card">
      <div className="mk-checkout-card__head">
        <strong>Order #1001</strong>
        <span>EGP 1,250</span>
      </div>
      <div className="mk-checkout-card__body">
        <span className="mk-checkout-card__label">Secure checkout</span>
        <span className="mk-checkout-card__paymob">
          <i aria-hidden="true">P</i> Paymob
        </span>
        <span className="mk-checkout-card__button">Pay with Paymob</span>
      </div>
    </div>
  );
}

function StorefrontVisual() {
  return (
    <StorefrontWindow brand="My Store">
      <div className="mk-sf-products">
        <StorefrontProduct title="Classic T-Shirt" price="EGP 350" />
        <StorefrontProduct title="Slim Jeans" price="EGP 720" tone="gray" />
        <StorefrontProduct title="Winter Jacket" price="EGP 1,150" />
      </div>
    </StorefrontWindow>
  );
}

function CmsVisual() {
  const colors = ['#008060', '#1a56db', '#916b00', '#d82c0d'];
  const sections = ['Hero', 'Banner', 'Featured Products', 'Text'];
  return (
    <div className="mk-visual-panel">
      <div className="mk-theme-row">
        <span className="mk-theme-row__label">Colors</span>
        <span className="mk-theme-row__swatches">
          {colors.map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
        </span>
      </div>
      <div className="mk-theme-row">
        <span className="mk-theme-row__label">Typography</span>
        <span className="mk-theme-row__value">System font · 16px</span>
      </div>
      <div className="mk-theme-row">
        <span className="mk-theme-row__label">Sections</span>
        <span className="mk-theme-row__chips">
          {sections.map((section) => (
            <span key={section}>{section}</span>
          ))}
        </span>
      </div>
      <p className="mk-visual-caption">Theme & page configuration</p>
    </div>
  );
}

const FEATURES = [
  { key: 'products', visual: <ProductVisual /> },
  { key: 'inventory', visual: <InventoryVisual /> },
  { key: 'orders', visual: <OrdersVisual /> },
  { key: 'customers', visual: <CustomersVisual /> },
  { key: 'payments', visual: <PaymentsVisual /> },
  { key: 'storefront', visual: <StorefrontVisual /> },
  { key: 'cms', visual: <CmsVisual /> },
] as const;

/**
 * Feature showcase — seven core capabilities with a small visual mockup each.
 */
export function FeaturesSection() {
  const { t } = useI18n();

  return (
    <section className="mk-section" id="features" aria-labelledby="features-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.features.eyebrow')}
          title={t('marketing.features.title')}
          description={t('marketing.features.desc')}
        />

        <div className="mk-features">
          {FEATURES.map((feature, index) => (
            <article
              className={cn('mk-feature', index % 2 === 1 && 'mk-feature--reverse')}
              key={feature.key}
            >
              <div className="mk-feature__text">
                <h3 className="mk-feature__title">
                  {t(`marketing.features.${feature.key}.title`)}
                </h3>
                <p className="mk-feature__desc">{t(`marketing.features.${feature.key}.desc`)}</p>
                <ul className="mk-feature__bullets">
                  {([1, 2, 3] as const).map((bullet) => (
                    <li key={bullet}>{t(`marketing.features.${feature.key}.b${bullet}`)}</li>
                  ))}
                </ul>
              </div>
              <div className="mk-feature__visual" aria-hidden="true">
                {feature.visual}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
