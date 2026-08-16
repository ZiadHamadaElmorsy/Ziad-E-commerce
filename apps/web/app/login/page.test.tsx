import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { I18nProvider } from '@/lib/i18n/i18n-context';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: 'unauthenticated',
    user: null,
    store: null,
    membership: null,
    me: null,
    error: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    refreshMe: vi.fn(),
  }),
}));

// Deterministic support configuration (single source of truth).
vi.mock('@/lib/config', () => ({
  appConfig: { supportPhone: '+20 100 000 0000' },
  emailConfirmationRedirectUrl: () => 'http://localhost:3000/login',
  supportPhoneHref: (phone: string) =>
    `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`,
}));

import LoginPage from './page';

function renderLogin() {
  return render(
    <I18nProvider>
      <LoginPage />
    </I18nProvider>,
  );
}

describe('Login page', () => {
  it('shows the customer support contact and no internal Supabase messaging', () => {
    renderLogin();

    // Customer-facing support line with the configured phone as a tel: link.
    expect(screen.getByText(/Need help\? Contact support at:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+20 100 000 0000' })).toHaveAttribute(
      'href',
      'tel:+201000000000',
    );

    // Internal provider/session terminology must never surface.
    expect(screen.queryByText(/Session created by Supabase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Supabase Auth/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Supabase credentials/i)).not.toBeInTheDocument();
  });
});
