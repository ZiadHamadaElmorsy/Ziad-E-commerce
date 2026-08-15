import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ApiError } from '@/lib/api/client';

const { createMerchantMock, getUserMock } = vi.hoisted(() => ({
  createMerchantMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@/lib/api/onboarding', () => ({
  onboardingApi: { createMerchant: createMerchantMock },
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock('@/app/signup/page', () => ({
  ONBOARDING_STORE_NAME_KEY: 'ziad.onboarding.storeName',
}));

import { StoreInfoStep } from './StoreInfoStep';

function renderStep(onCreated = vi.fn()) {
  return {
    onCreated,
    ...render(
      <I18nProvider>
        <StoreInfoStep onCreated={onCreated} />
      </I18nProvider>,
    ),
  };
}

describe('StoreInfoStep', () => {
  beforeEach(() => {
    createMerchantMock.mockReset();
    getUserMock.mockReset();
    window.sessionStorage.clear();
    getUserMock.mockResolvedValue({
      data: {
        user: {
          user_metadata: { first_name: 'Ziad', last_name: 'Owner' },
        },
      },
    });
  });

  it('prefills the name from the Supabase session metadata', async () => {
    renderStep();

    await waitFor(() => {
      expect(screen.getByLabelText(/^First name/)).toHaveValue('Ziad');
      expect(screen.getByLabelText(/^Last name/)).toHaveValue('Owner');
    });
  });

  it('prefills the store name and slug from the signup step', async () => {
    window.sessionStorage.setItem('ziad.onboarding.storeName', 'My Store');
    renderStep();

    await waitFor(() => {
      expect(screen.getByLabelText(/^Store name/)).toHaveValue('My Store');
      expect(screen.getByLabelText(/^Store slug/)).toHaveValue('my-store');
    });
  });

  it('creates the merchant through the onboarding API and reports success', async () => {
    createMerchantMock.mockResolvedValue({ data: { store: {}, membership: {} } });
    const { onCreated } = renderStep();

    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Ziad' } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'Owner' } });
    fireEvent.change(screen.getByLabelText(/^Store name/), { target: { value: 'Ziad Boutique' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create store' }));

    await waitFor(() =>
      expect(createMerchantMock).toHaveBeenCalledWith({
        firstName: 'Ziad',
        lastName: 'Owner',
        storeName: 'Ziad Boutique',
        slug: 'ziad-boutique',
        currency: 'EGP',
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it('surfaces a slug conflict error from the API', async () => {
    createMerchantMock.mockRejectedValue(
      new ApiError('A store with this slug already exists.', {
        code: 'CONFLICT',
        status: 409,
      }),
    );
    renderStep();

    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Ziad' } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'Owner' } });
    fireEvent.change(screen.getByLabelText(/^Store name/), { target: { value: 'Ziad Boutique' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create store' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A store with this slug already exists.',
    );
  });

  it('validates an empty (invalid) slug before submitting', async () => {
    renderStep();

    fireEvent.change(screen.getByLabelText(/^First name/), { target: { value: 'Ziad' } });
    fireEvent.change(screen.getByLabelText(/^Last name/), { target: { value: 'Owner' } });
    fireEvent.change(screen.getByLabelText(/^Store name/), { target: { value: 'My Store' } });
    fireEvent.change(screen.getByLabelText(/^Store slug/), { target: { value: '!!!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create store' }));

    expect(await screen.findByText(/The slug must be/)).toBeInTheDocument();
    expect(createMerchantMock).not.toHaveBeenCalled();
  });
});
