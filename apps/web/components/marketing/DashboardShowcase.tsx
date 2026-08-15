'use client';

import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { cn } from '@/lib/utils';
import { SectionHeading } from './SectionHeading';
import {
  BrowserChrome,
  DashboardWindow,
  MockStatCard,
  MockTable,
  StatusPill,
  type DashboardNavKey,
  type PillTone,
} from './mockups';

type ShowcaseTab = 'dashboard' | 'products' | 'orders' | 'customers' | 'inventory' | 'store';

const TABS: Array<{ key: ShowcaseTab; nav: DashboardNavKey }> = [
  { key: 'dashboard', nav: 'dashboard' },
  { key: 'products', nav: 'products' },
  { key: 'orders', nav: 'orders' },
  { key: 'customers', nav: 'customers' },
  { key: 'inventory', nav: 'products' },
  { key: 'store', nav: 'store' },
];

function OrderStatusPill({ children, tone }: { children: string; tone: PillTone }) {
  return <StatusPill tone={tone}>{children}</StatusPill>;
}

function DashboardScreen() {
  return (
    <div className="mk-dash-grid">
      <div className="mk-dash-stats">
        <MockStatCard label="Products" value="24" delta="+3" />
        <MockStatCard label="Total orders" value="187" delta="+12" />
        <MockStatCard label="Revenue" value="EGP 48k" delta="+8%" />
      </div>
      <MockTable
        head={['Recent products', 'Status', 'Price']}
        rows={[
          [
            'Classic T-Shirt',
            <OrderStatusPill key="1" tone="green">
              Active
            </OrderStatusPill>,
            'EGP 350',
          ],
          [
            'Slim Jeans',
            <OrderStatusPill key="2" tone="green">
              Active
            </OrderStatusPill>,
            'EGP 720',
          ],
          [
            'Winter Jacket',
            <OrderStatusPill key="3" tone="gray">
              Draft
            </OrderStatusPill>,
            'EGP 1,150',
          ],
        ]}
      />
    </div>
  );
}

function ProductsScreen() {
  return (
    <MockTable
      head={['Product', 'Variants', 'Status', 'Price']}
      rows={[
        [
          'Classic T-Shirt',
          '2',
          <OrderStatusPill key="1" tone="green">
            Active
          </OrderStatusPill>,
          'EGP 350',
        ],
        [
          'Slim Jeans',
          '3',
          <OrderStatusPill key="2" tone="green">
            Active
          </OrderStatusPill>,
          'EGP 720',
        ],
        [
          'Winter Jacket',
          '1',
          <OrderStatusPill key="3" tone="gray">
            Draft
          </OrderStatusPill>,
          'EGP 1,150',
        ],
      ]}
    />
  );
}

function OrdersScreen() {
  return (
    <MockTable
      head={['Order', 'Customer', 'Status', 'Total']}
      rows={[
        [
          '#1001',
          'customer@example.com',
          <OrderStatusPill key="1" tone="green">
            Delivered
          </OrderStatusPill>,
          'EGP 1,250',
        ],
        [
          '#1000',
          'buyer@example.com',
          <OrderStatusPill key="2" tone="amber">
            Processing
          </OrderStatusPill>,
          'EGP 640',
        ],
        [
          '#0999',
          'shop@example.com',
          <OrderStatusPill key="3" tone="green">
            Succeeded
          </OrderStatusPill>,
          'EGP 2,100',
        ],
      ]}
    />
  );
}

function CustomersScreen() {
  const customers = [
    { name: 'Sara M.', email: 'sara@example.com', orders: '3 orders' },
    { name: 'Omar K.', email: 'omar@example.com', orders: '1 order' },
    { name: 'Lina A.', email: 'lina@example.com', orders: '7 orders' },
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
    </div>
  );
}

function InventoryScreen() {
  return (
    <MockTable
      head={['SKU', 'Variant', 'Stock', 'Status']}
      rows={[
        [
          'TSH-M-BLK',
          'T-Shirt / M / Black',
          '42',
          <OrderStatusPill key="1" tone="green">
            In stock
          </OrderStatusPill>,
        ],
        [
          'JNS-32-BLU',
          'Jeans / 32 / Blue',
          '18',
          <OrderStatusPill key="2" tone="green">
            In stock
          </OrderStatusPill>,
        ],
        [
          'JCK-L-GRN',
          'Jacket / L / Green',
          '5',
          <OrderStatusPill key="3" tone="amber">
            Low stock
          </OrderStatusPill>,
        ],
      ]}
    />
  );
}

function StoreScreen() {
  const fields = [
    { label: 'Store name', value: 'My Store' },
    { label: 'Store slug', value: '/my-store' },
    { label: 'Currency', value: 'EGP' },
    { label: 'Timezone', value: 'Africa/Cairo' },
  ];
  return (
    <div className="mk-form-panel">
      {fields.map((field) => (
        <div className="mk-form-row" key={field.label}>
          <label>{field.label}</label>
          <span>{field.value}</span>
        </div>
      ))}
    </div>
  );
}

const SCREENS: Record<ShowcaseTab, () => ReactNode> = {
  dashboard: DashboardScreen,
  products: ProductsScreen,
  orders: OrdersScreen,
  customers: CustomersScreen,
  inventory: InventoryScreen,
  store: StoreScreen,
};

/**
 * Dashboard showcase — interactive tabs that preview the real admin screens a
 * merchant receives (dashboard, products, orders, customers, inventory, store).
 */
export function DashboardShowcase() {
  const { t } = useI18n();
  const [active, setActive] = useState<ShowcaseTab>('dashboard');
  const ActiveScreen = SCREENS[active];
  const tabConfig = TABS.find((tab) => tab.key === active) ?? TABS[0];

  return (
    <section className="mk-section mk-section--tint" aria-labelledby="showcase-title">
      <div className="mk-container">
        <SectionHeading
          eyebrow={t('marketing.showcase.eyebrow')}
          title={t('marketing.showcase.title')}
          description={t('marketing.showcase.desc')}
        />

        <div className="mk-showcase">
          <div
            className="mk-showcase__tabs"
            role="tablist"
            aria-label={t('marketing.showcase.eyebrow')}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active === tab.key}
                aria-controls="mk-showcase-panel"
                className={cn('mk-showcase__tab', active === tab.key && 'mk-showcase__tab--active')}
                onClick={() => setActive(tab.key)}
              >
                {t(`marketing.showcase.tab.${tab.key}`)}
              </button>
            ))}
          </div>

          <p className="mk-showcase__desc" id="mk-showcase-panel" role="tabpanel">
            {t(`marketing.showcase.${active}.desc`)}
          </p>

          <BrowserChrome url="app.ziad-ecommerce.com/dashboard">
            <DashboardWindow active={tabConfig.nav}>
              <ActiveScreen />
            </DashboardWindow>
          </BrowserChrome>

          <p className="mk-showcase__note">{t('marketing.showcase.note')}</p>
        </div>
      </div>
    </section>
  );
}
