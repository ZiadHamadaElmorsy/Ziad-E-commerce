import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';
import { ApiError } from '@/lib/api/client';

const { createProductMock, updateVariantMock } = vi.hoisted(() => ({
  createProductMock: vi.fn(),
  updateVariantMock: vi.fn(),
}));

const { toastSuccessMock } = vi.hoisted(() => ({ toastSuccessMock: vi.fn() }));

vi.mock('@/lib/api/catalog', () => ({
  catalogApi: { createProduct: createProductMock, updateVariant: updateVariantMock },
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccessMock, error: vi.fn(), info: vi.fn() }),
}));

import { FirstProductStep } from './FirstProductStep';

const PRODUCT = {
  data: {
    id: 'product-1',
    name: 'Classic T-Shirt',
    slug: 'classic-t-shirt',
    description: null,
    status: 'DRAFT',
    variants: [
      { id: 'variant-1', productId: 'product-1', name: 'Default', sku: null, price: 0, compareAtPrice: null, status: 'ACTIVE' },
    ],
  },
};

function renderStep(onDone = vi.fn(), onSkip = vi.fn()) {
  return {
    onDone,
    onSkip,
    ...render(
      <I18nProvider>
        <FirstProductStep onDone={onDone} onSkip={onSkip} />
      </I18nProvider>,
    ),
  };
}

describe('FirstProductStep', () => {
  beforeEach(() => {
    createProductMock.mockReset();
    updateVariantMock.mockReset();
    toastSuccessMock.mockReset();
  });

  it('creates the first product and prices its default variant', async () => {
    createProductMock.mockResolvedValue(PRODUCT);
    updateVariantMock.mockResolvedValue({
      data: { id: 'variant-1', productId: 'product-1', name: 'Classic T-Shirt', sku: null, price: 25000, compareAtPrice: null, status: 'ACTIVE' },
    });
    const { onDone } = renderStep();

    fireEvent.change(screen.getByLabelText(/^Product name/), { target: { value: 'Classic T-Shirt' } });
    fireEvent.change(screen.getByLabelText(/^Description/), { target: { value: 'A soft cotton tee' } });
    fireEvent.change(screen.getByLabelText(/^Price \(EGP\)/), { target: { value: '250.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));

    await waitFor(() => expect(createProductMock).toHaveBeenCalledWith({
      name: 'Classic T-Shirt',
      description: 'A soft cotton tee',
    }));
    await waitFor(() =>
      expect(updateVariantMock).toHaveBeenCalledWith('variant-1', {
        name: 'Classic T-Shirt',
        price: 25000,
      }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(toastSuccessMock).toHaveBeenCalled();
  });

  it('requires a product name before calling the API', async () => {
    renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByText('Product name is required.')).toBeInTheDocument();
    expect(createProductMock).not.toHaveBeenCalled();
  });

  it('surfaces a catalog API error and keeps the merchant on the step', async () => {
    createProductMock.mockRejectedValue(
      new ApiError('The request was not valid.', { code: 'BAD_REQUEST', status: 400 }),
    );
    const { onDone } = renderStep();

    fireEvent.change(screen.getByLabelText(/^Product name/), { target: { value: 'Broken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create product' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The request was not valid.');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('skips the product step without creating anything', async () => {
    const { onSkip } = renderStep();

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));

    expect(onSkip).toHaveBeenCalled();
    expect(createProductMock).not.toHaveBeenCalled();
  });
});
