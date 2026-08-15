import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

const { getThemeMock, updateThemeMock } = vi.hoisted(() => ({
  getThemeMock: vi.fn(),
  updateThemeMock: vi.fn(),
}));

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));

vi.mock('@/lib/api/theme', () => ({
  themeApi: { getTheme: getThemeMock, updateTheme: updateThemeMock },
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccessMock, error: vi.fn(), info: vi.fn() }),
}));

import { AppearanceStep } from './AppearanceStep';

function renderStep(onDone = vi.fn(), onSkip = vi.fn()) {
  return {
    onDone,
    onSkip,
    ...render(
      <I18nProvider>
        <AppearanceStep onDone={onDone} onSkip={onSkip} />
      </I18nProvider>,
    ),
  };
}

describe('AppearanceStep', () => {
  beforeEach(() => {
    getThemeMock.mockReset();
    updateThemeMock.mockReset();
    toastSuccessMock.mockReset();
    getThemeMock.mockResolvedValue({ data: { id: 'theme-1', logoMediaId: null, config: {} } });
  });

  it('loads the existing theme configuration', async () => {
    getThemeMock.mockResolvedValue({
      data: {
        id: 'theme-1',
        logoMediaId: null,
        config: { primaryColor: '#123456', fontFamily: 'Inter' },
      },
    });
    renderStep();

    await waitFor(() => {
      expect(screen.getByLabelText(/^Primary color/)).toHaveValue('#123456');
      expect(screen.getByLabelText(/^Font family/)).toHaveValue('Inter');
    });
  });

  it('persists the appearance through the theme API and advances', async () => {
    updateThemeMock.mockResolvedValue({
      data: { id: 'theme-1', logoMediaId: null, config: { primaryColor: '#2563eb' } },
    });
    const { onDone } = renderStep();

    // Wait for the initial theme load so the save button is enabled.
    await waitFor(() => {
      expect(screen.getByLabelText(/^Primary color/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^Primary color/), { target: { value: '#0f172a' } });
    fireEvent.change(screen.getByLabelText(/^Font family/), { target: { value: 'Inter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));

    await waitFor(() =>
      expect(updateThemeMock).toHaveBeenCalledWith({ primaryColor: '#0f172a', fontFamily: 'Inter' }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('skips the appearance step without saving', async () => {
    const { onSkip } = renderStep();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Skip for now' })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(onSkip).toHaveBeenCalled();
    expect(updateThemeMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid hex color locally', async () => {
    renderStep();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save appearance' })).toBeEnabled();
    });
    fireEvent.change(screen.getByLabelText(/^Primary color/), { target: { value: 'red' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save appearance' }));

    expect(await screen.findByText(/Enter a valid 6-digit hex color/)).toBeInTheDocument();
    expect(updateThemeMock).not.toHaveBeenCalled();
  });
});
