import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Home from './page';

describe('Home page', () => {
  it('renders the application shell brand', () => {
    render(<Home />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ziad E-commerce');
  });

  it('references the configured API base URL', () => {
    render(<Home />);
    expect(screen.getByText(/\/api\/v1/)).toBeInTheDocument();
  });
});
