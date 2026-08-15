import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import type { ReactNode } from 'react';

const replaceMock = vi.fn();
let authState: {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  store: { id: string } | null;
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/auth/auth-context', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => ({
    status: authState.status,
    store: authState.store,
    refreshMe: vi.fn(async () => {
      // Simulates the post-store-creation refresh: /auth/me resolves the new
      // store once POST /onboarding/merchant has created it.
      authState = { ...authState, status: 'authenticated', store: { id: 'new-store' } };
    }),
  }),
}));

vi.mock('@/components/onboarding/StoreInfoStep', () => ({
  StoreInfoStep: ({ onCreated }: { onCreated: () => void }) => (
    <button type="button" onClick={onCreated}>
      StoreInfoStep
    </button>
  ),
}));
vi.mock('@/components/onboarding/AppearanceStep', () => ({
  AppearanceStep: () => <div>AppearanceStep</div>,
}));
vi.mock('@/components/onboarding/FirstProductStep', () => ({
  FirstProductStep: () => <div>FirstProductStep</div>,
}));
vi.mock('@/components/onboarding/LaunchStep', () => ({
  LaunchStep: () => <div>LaunchStep</div>,
}));

import OnboardingPage from './page';

function renderOnboarding() {
  return render(
    <I18nProvider>
      <OnboardingPage />
    </I18nProvider>,
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    authState = { status: 'loading', store: null };
  });

  it('shows a loading state while the session resolves', () => {
    authState = { status: 'loading', store: null };
    renderOnboarding();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('redirects unauthenticated visitors to /login', () => {
    authState = { status: 'unauthenticated', store: null };
    renderOnboarding();
    expect(replaceMock).toHaveBeenCalledWith('/login');
  });

  it('redirects already-onboarded merchants straight to /dashboard', () => {
    authState = { status: 'authenticated', store: { id: 'store-1' } };
    renderOnboarding();
    expect(replaceMock).toHaveBeenCalledWith('/dashboard');
  });

  it('shows step 1 (store information) for an authenticated merchant without a store', () => {
    authState = { status: 'authenticated', store: null };
    renderOnboarding();
    expect(screen.getByText('StoreInfoStep')).toBeInTheDocument();
  });

  it('continues to step 2 after the store is created during this session (Phase 24 regression)', async () => {
    authState = { status: 'authenticated', store: null };
    renderOnboarding();
    fireEvent.click(screen.getByText('StoreInfoStep'));
    // After refreshMe resolves the new store, the flow must NOT return null
    // (the old guard hid the whole onboarding once `store` was set) — it must
    // advance to the appearance step instead of redirecting to /dashboard.
    expect(await screen.findByText('AppearanceStep')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalledWith('/dashboard');
  });
});
