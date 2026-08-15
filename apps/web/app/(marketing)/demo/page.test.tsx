import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n/i18n-context';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import DemoPage from './page';

function renderDemo() {
  return render(
    <I18nProvider>
      <DemoPage />
    </I18nProvider>,
  );
}

describe('Demo page', () => {
  it('renders the demo heading and leads to signup', () => {
    renderDemo();

    expect(
      screen.getByRole('heading', { name: 'See Ziad E-commerce in action' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create your account' })).toHaveAttribute(
      'href',
      '/signup',
    );
    expect(screen.getByRole('link', { name: 'Back to homepage' })).toHaveAttribute('href', '/');
  });

  it('reuses the dashboard showcase', () => {
    renderDemo();

    expect(
      screen.getByRole('heading', { name: 'The merchant dashboard you will actually use' }),
    ).toBeInTheDocument();
  });

  it('is honest about illustrative numbers', () => {
    renderDemo();

    expect(
      screen.getByText(
        'These are visual previews of the real product UI. Any numbers shown are illustrative.',
      ),
    ).toBeInTheDocument();
  });
});
