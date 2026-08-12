import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Vitest runs without `globals`, so React Testing Library's automatic cleanup
// (which relies on a global `afterEach`) does not register on its own.
afterEach(() => {
  cleanup();
});
