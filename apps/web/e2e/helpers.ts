import { expect, type Page } from '@playwright/test';

/** Real Supabase merchant used by the E2E suite (override via env). */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e.merchant@ziad.test';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Ziad@E2E2026!';

/** Signs in through the real login UI and waits for /auth/me to resolve. */
export async function signIn(
  page: Page,
  email = E2E_EMAIL,
  password = E2E_PASSWORD,
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Landing on the dashboard proves /auth/me resolved a store + membership.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

/** Unique suffix so every run creates fresh records (no collisions). */
export function uniqueSuffix(): string {
  return Date.now().toString().slice(-6);
}

/** Creates a product through the real UI and returns to its details page. */
export async function createProduct(page: Page, name: string): Promise<void> {
  await page.goto('/dashboard/products/new');
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Product created.')).toBeVisible();
}

/** Creates a category through the real UI and returns to its details page. */
export async function createCategory(
  page: Page,
  name: string,
  description?: string,
): Promise<void> {
  await page.goto('/dashboard/categories/new');
  await page.getByLabel('Name').fill(name);
  if (description) {
    await page.getByLabel('Description').fill(description);
  }
  await page.getByRole('button', { name: 'Create category' }).click();
  await expect(page).toHaveURL(/\/dashboard\/categories\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Category created.')).toBeVisible();
}

/** Adds a variant through the create-variant modal. */
export async function addVariant(
  page: Page,
  fields: { name: string; sku?: string; price: string; compareAtPrice?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'Add variant' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(fields.name);
  if (fields.sku) {
    await dialog.getByLabel('SKU').fill(fields.sku);
  }
  await dialog.getByRole('spinbutton', { name: 'Price (EGP)', exact: true }).fill(fields.price);
  if (fields.compareAtPrice !== undefined) {
    await dialog
      .getByRole('spinbutton', { name: 'Compare-at price (EGP)', exact: true })
      .fill(fields.compareAtPrice);
  }
  await dialog.getByRole('button', { name: 'Add variant' }).click();
  await expect(page.getByText('Variant created.')).toBeVisible();
}
