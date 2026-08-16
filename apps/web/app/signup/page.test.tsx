import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const signUpMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { signUp: signUpMock } }),
}));

// Deterministic auth-redirect + support config (independent of the runner env).
vi.mock('@/lib/config', () => ({
  appConfig: { supportPhone: '+20 100 000 0000' },
  emailConfirmationRedirectUrl: () => 'http://localhost:3000/login',
  supportPhoneHref: (phone: string) =>
    `tel:${phone.trim().startsWith('+') ? '+' : ''}${phone.replace(/\D/g, '')}`,
}));

import SignUpPage from './page';

function renderSignUp() {
  return render(
    <I18nProvider>
      <SignUpPage />
    </I18nProvider>,
  );
}

// Labels include a trailing required "*" (aria-hidden), so use regex matchers.
function firstNameInput() {
  return screen.getByLabelText(/^First name/);
}

function lastNameInput() {
  return screen.getByLabelText(/^Last name/);
}

function storeNameInput() {
  return screen.getByLabelText(/^Store name/);
}

function emailInput() {
  return screen.getByLabelText(/^Email/);
}

function passwordInput() {
  return screen.getByLabelText(/^Password/);
}

function confirmPasswordInput() {
  return screen.getByLabelText(/^Confirm password/);
}

function fillValidForm() {
  fireEvent.change(firstNameInput(), { target: { value: 'Ziad' } });
  fireEvent.change(lastNameInput(), { target: { value: 'Owner' } });
  fireEvent.change(storeNameInput(), { target: { value: 'My Store' } });
  fireEvent.change(emailInput(), { target: { value: 'merchant@example.com' } });
  fireEvent.change(passwordInput(), { target: { value: 'secret123' } });
  fireEvent.change(confirmPasswordInput(), { target: { value: 'secret123' } });
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
}

describe('SignUp page', () => {
  beforeEach(() => {
    signUpMock.mockReset();
    replaceMock.mockClear();
    window.sessionStorage.clear();
  });

  it('validates required fields and never calls the API when invalid', async () => {
    renderSignUp();
    submit();

    expect(await screen.findByText('First name is required.')).toBeInTheDocument();
    expect(screen.getByText('Last name is required.')).toBeInTheDocument();
    expect(screen.getByText('Store name is required.')).toBeInTheDocument();
    expect(screen.getByText('Email is required.')).toBeInTheDocument();
    expect(screen.getByText('Password is required.')).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than six characters', async () => {
    renderSignUp();

    fillValidForm();
    fireEvent.change(passwordInput(), { target: { value: 'short' } });
    fireEvent.change(confirmPasswordInput(), { target: { value: 'short' } });
    submit();

    expect(await screen.findByText('Password must be at least 6 characters.')).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('rejects mismatched password confirmation', async () => {
    renderSignUp();

    fillValidForm();
    fireEvent.change(confirmPasswordInput(), { target: { value: 'different1' } });
    submit();

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('shows a confirmation state when no session is returned by Supabase', async () => {
    signUpMock.mockResolvedValue({ data: { session: null, user: { id: 'u-1' } }, error: null });
    renderSignUp();

    fillValidForm();
    submit();

    await waitFor(() =>
      expect(signUpMock).toHaveBeenCalledWith({
        email: 'merchant@example.com',
        password: 'secret123',
        options: {
          data: { first_name: 'Ziad', last_name: 'Owner' },
          // Environment-aware email-confirmation redirect (single source of truth).
          emailRedirectTo: 'http://localhost:3000/login',
        },
      }),
    );
    expect(await screen.findByText('Check your email')).toBeInTheDocument();
  });

  it('routes to onboarding when a session is returned immediately', async () => {
    signUpMock.mockResolvedValue({
      data: { session: { access_token: 'token' }, user: { id: 'u-1' } },
      error: null,
    });
    renderSignUp();

    fillValidForm();
    submit();

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/onboarding'));
    // The store name is carried across to the onboarding step.
    expect(window.sessionStorage.getItem('ziad.onboarding.storeName')).toBe('My Store');
  });

  it('localizes a duplicate-email signup error', async () => {
    signUpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'User already registered' },
    });
    renderSignUp();

    fillValidForm();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists. Try signing in instead.',
    );
  });

  it('surfaces an unknown Supabase error message verbatim', async () => {
    signUpMock.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Email provider is unreachable' },
    });
    renderSignUp();

    fillValidForm();
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent('Email provider is unreachable');
  });

  describe('password visibility', () => {
    it('hides both password fields by default', () => {
      renderSignUp();

      expect(passwordInput()).toHaveAttribute('type', 'password');
      expect(confirmPasswordInput()).toHaveAttribute('type', 'password');
      expect(
        screen.getByRole('button', { name: 'Show password' }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Show confirm password' }),
      ).toBeInTheDocument();
    });

    it('shows then hides the password without touching confirm password', () => {
      renderSignUp();

      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(passwordInput()).toHaveAttribute('type', 'text');
      expect(confirmPasswordInput()).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(passwordInput()).toHaveAttribute('type', 'password');
    });

    it('shows then hides the confirm password independently', () => {
      renderSignUp();

      fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
      expect(confirmPasswordInput()).toHaveAttribute('type', 'text');
      expect(passwordInput()).toHaveAttribute('type', 'password');
      expect(
        screen.getByRole('button', { name: 'Hide confirm password' }),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Hide confirm password' }));
      expect(confirmPasswordInput()).toHaveAttribute('type', 'password');
    });

    it('toggling visibility never clears or resets the field value', () => {
      renderSignUp();

      fireEvent.change(passwordInput(), { target: { value: 'secret123' } });
      fireEvent.change(confirmPasswordInput(), { target: { value: 'secret123' } });

      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(passwordInput()).toHaveValue('secret123');

      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(passwordInput()).toHaveValue('secret123');

      fireEvent.click(screen.getByRole('button', { name: 'Show confirm password' }));
      expect(confirmPasswordInput()).toHaveValue('secret123');
    });

    it('visibility buttons are type="button" and never submit the form', () => {
      renderSignUp();

      const passwordToggle = screen.getByRole('button', { name: 'Show password' });
      expect(passwordToggle).toHaveAttribute('type', 'button');

      fireEvent.click(passwordToggle);
      expect(signUpMock).not.toHaveBeenCalled();
    });
  });

  it('replaces the internal Supabase footnote with a customer support contact', async () => {
    signUpMock.mockResolvedValue({ data: { session: null, user: { id: 'u-1' } }, error: null });
    renderSignUp();

    fillValidForm();
    submit();

    expect(await screen.findByText('Check your email')).toBeInTheDocument();
    // Customer-facing support line (single configuration value).
    expect(screen.getByText(/Need help\? Contact support at:/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+20 100 000 0000' })).toHaveAttribute(
      'href',
      'tel:+201000000000',
    );
    // The internal provider/session detail is gone from the UI.
    expect(screen.queryByText(/Session created by Supabase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Supabase Auth/i)).not.toBeInTheDocument();
  });

  it('links back to the existing login page', () => {
    renderSignUp();

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });
});
