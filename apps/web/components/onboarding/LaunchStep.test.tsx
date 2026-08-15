import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const { replaceMock } = vi.hoisted(() => ({ replaceMock: vi.fn() }));
const { listProductsMock } = vi.hoisted(() => ({ listProductsMock: vi.fn() }));

const { authState } = vi.hoisted(() => ({
  authState: {
    store: { id: 'store-1', name: 'My Store', slug: 'my-store', status: 'ACTIVE' },
    membership: { id: 'm-1', storeId: 'store-1', role: 'OWNER', status: 'ACTIVE' },
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('@/lib/api/catalog', () => ({
  catalogApi: { listProducts: listProductsMock },
}));

import { LaunchStep } from './LaunchStep';

function renderLaunch() {
  return render(
    <I18nProvider>
      <LaunchStep />
    </I18nProvider>,
  );
}

describe('LaunchStep', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    listProductsMock.mockReset();
    listProductsMock.mockResolvedValue({ data: [], meta: { page: 1, limit: 1, total: 0, totalPages: 0 } });
  });

  it('shows the launch checklist, store details, and the dashboard/storefront roles', async () => {
    renderLaunch();

    expect(
      await screen.findByRole('heading', { name: 'Your store is ready' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Launch checklist')).toBeInTheDocument();
    expect(screen.getByText('My Store')).toBeInTheDocument();
    expect(screen.getByText('/my-store')).toBeInTheDocument();
    expect(screen.getByText('Dashboard and storefront')).toBeInTheDocument();
  });

  it('detects the first product created during onboarding', async () => {
    listProductsMock.mockResolvedValue({
      data: [{ id: 'product-1', name: 'Tee', slug: 'tee', description: null, status: 'DRAFT', variants: [] }],
      meta: { page: 1, limit: 1, total: 1, totalPages: 1 },
    });
    renderLaunch();

    await waitFor(() => expect(listProductsMock).toHaveBeenCalled());
  });

  it('launches the merchant into the dashboard', async () => {
    renderLaunch();

    // Wait for the checklist product check to finish so the button is usable.
    const button = await screen.findByRole('button', { name: 'Go to dashboard' });
    button.click();

    expect(replaceMock).toHaveBeenCalledWith('/dashboard');
  });
});
