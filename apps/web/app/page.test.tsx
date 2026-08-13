import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const sessionMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession: sessionMock },
  }),
}));

import Home from './page';

function renderHome() {
  return render(
    <I18nProvider>
      <Home />
    </I18nProvider>,
  );
}

describe('Home page', () => {
  beforeEach(() => {
    replaceMock.mockClear();
    sessionMock.mockReset();
  });

  it('redirects unauthenticated visitors to /login', async () => {
    sessionMock.mockResolvedValue({ data: { session: null } });

    renderHome();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'));
  });

  it('redirects authenticated merchants to /dashboard', async () => {
    sessionMock.mockResolvedValue({ data: { session: { access_token: 'token' } } });

    renderHome();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('shows a loading state while resolving the session', () => {
    sessionMock.mockImplementation(() => new Promise(() => {}));

    renderHome();

    expect(screen.getByRole('status')).toHaveTextContent('Redirecting');
  });
});
