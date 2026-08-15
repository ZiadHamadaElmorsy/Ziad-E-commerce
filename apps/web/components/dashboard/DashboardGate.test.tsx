import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const { authState, replaceMock } = vi.hoisted(() => ({
  authState: { status: 'loading' as 'loading' | 'authenticated' | 'unauthenticated', store: null as { id: string } | null },
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  useAuth: () => authState,
}));

vi.mock('./AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>AdminShell:{children}</div>,
}));

vi.mock('@/components/ui/Spinner', () => ({
  Spinner: () => <span>Spinner</span>,
}));

import { DashboardGate } from './DashboardGate';

function renderGate() {
  return render(
    <I18nProvider>
      <DashboardGate>
        <div>Protected content</div>
      </DashboardGate>
    </I18nProvider>,
  );
}

describe('DashboardGate (Phase 18 routing)', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    authState.status = 'loading';
    authState.store = null;
  });

  it('shows a loading state while the session resolves (no premature redirect)', () => {
    authState.status = 'loading';
    renderGate();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /login', () => {
    authState.status = 'unauthenticated';
    renderGate();

    expect(replaceMock).toHaveBeenCalledWith('/login');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects an authenticated merchant without a store to /onboarding', () => {
    authState.status = 'authenticated';
    authState.store = null;
    renderGate();

    expect(replaceMock).toHaveBeenCalledWith('/onboarding');
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('renders the admin shell for an authenticated merchant with a store', () => {
    authState.status = 'authenticated';
    authState.store = { id: 'store-1' };
    renderGate();

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByText(/AdminShell/)).toBeInTheDocument();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });
});
