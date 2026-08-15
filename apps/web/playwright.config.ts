import { defineConfig, devices } from '@playwright/test';

/**
 * Real browser E2E tests for the admin dashboard.
 *
 * Prerequisites:
 *   - API running on http://localhost:4000 (npm run dev:api)
 *   - Web dev server running on http://localhost:3000 (npm run dev:web)
 *   - A real Supabase merchant (E2E_EMAIL / E2E_PASSWORD env vars,
 *     defaults to the local e2e merchant used during development)
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    // The hosted Supabase database (transaction pooler) adds ~1–3s per write
    // round-trip, so the Playwright default of 5s is too tight for
    // mutation-to-toast assertions (e.g. publish/archive). 15s keeps the
    // suite reliable on real infrastructure without masking genuine failures.
    timeout: 15_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
