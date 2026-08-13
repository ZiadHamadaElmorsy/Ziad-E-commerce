import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end test of the complete merchant workflow through the real UI and
 * the real backend API (Supabase auth -> NestJS API -> Postgres).
 *
 * No mocks: everything runs against the live servers.
 */

const EMAIL = process.env.E2E_EMAIL ?? 'e2e.merchant@ziad.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Ziad@E2E2026!';

async function signIn(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Landing on the dashboard proves /auth/me resolved a store + membership.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
}

test.describe('Admin end-to-end workflow', () => {
  test('login → dashboard → catalog CRUD → publish → archive', async ({ page }) => {
    const suffix = Date.now().toString().slice(-6);
    const categoryName = `E2E Category ${suffix}`;
    const productName = `E2E Product ${suffix}`;
    const editedName = `${productName} (Edited)`;
    const sku = `E2E-${suffix}-M`;

    // 1. Real Supabase login through the UI.
    await signIn(page);

    // 2. /auth/me data is displayed: welcome message, store name, role badge.
    await expect(page.getByText('Welcome back', { exact: false })).toBeVisible();
    await expect(page.getByText('Ziad Store').first()).toBeVisible();
    await page.locator('.user-menu__trigger').click();
    await expect(page.getByRole('button', { name: /Log out/ })).toBeVisible();
    await page.keyboard.press('Escape');

    // 3. Create a category.
    await page.goto('/dashboard/categories/new');
    await page.getByLabel('Name').fill(categoryName);
    await page.getByLabel('Description').fill('Created by Playwright E2E');
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page).toHaveURL(/\/dashboard\/categories\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Category created.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: categoryName })).toBeVisible();

    // 4. Create a product (auto-creates the default draft variant).
    await page.goto('/dashboard/products/new');
    await page.getByLabel('Name').fill(productName);
    await page.getByLabel('Description').fill('Created by Playwright E2E');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
    await expect(page.getByText('Product created.')).toBeVisible();
    await expect(page.getByText('Draft')).toBeVisible();

    // 5. Create a variant through the modal.
    await page.getByRole('button', { name: 'Add variant' }).click();
    const createVariantDialog = page.getByRole('dialog');
    await createVariantDialog.getByLabel('Name').fill('Black / Medium');
    await createVariantDialog.getByLabel('SKU').fill(sku);
    await createVariantDialog
      .getByRole('spinbutton', { name: 'Price (EGP)', exact: true })
      .fill('500.00');
    await createVariantDialog
      .getByRole('spinbutton', { name: 'Compare-at price (EGP)', exact: true })
      .fill('600.00');
    await createVariantDialog.getByRole('button', { name: 'Add variant' }).click();
    await expect(page.getByText('Variant created.')).toBeVisible();
    await expect(page.getByText('Black / Medium')).toBeVisible();

    // 6. Assign the product to the category.
    await page.getByLabel('Assign a category').selectOption({ label: categoryName });
    await expect(page.getByText('Category assigned.')).toBeVisible();
    await expect(page.getByText(categoryName)).toBeVisible();

    // 7. Edit the product.
    await page.getByLabel('Name').fill(editedName);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Product updated.')).toBeVisible();

    // 8. Edit the variant.
    await page.getByRole('button', { name: 'Edit' }).first().click();
    const editVariantDialog = page.getByRole('dialog');
    await editVariantDialog
      .getByRole('spinbutton', { name: 'Price (EGP)', exact: true })
      .fill('450.00');
    await editVariantDialog.getByRole('button', { name: 'Save variant' }).click();
    await expect(page.getByText('Variant updated.')).toBeVisible();
    await expect(page.getByText(/EGP\s*450\.00/)).toBeVisible();

    // 9. Publish the product (through the confirmation dialog).
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    const publishDialog = page.getByRole('dialog');
    await publishDialog.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Product published.')).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

    // 10. The updated product is visible in the products list.
    await page.goto('/dashboard/products');
    await expect(page.getByText(editedName)).toBeVisible();

    // 11. Filter by category from the list page.
    await page.getByLabel('Filter by category').selectOption({ label: categoryName });
    await expect(page.getByText(editedName)).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();

    // 12. Archive the product (destructive action needs confirmation).
    await page.getByText(editedName).click();
    await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);
    await page.getByRole('button', { name: 'Archive', exact: true }).first().click();
    const archiveDialog = page.getByRole('dialog');
    await archiveDialog.getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Product archived.')).toBeVisible();
    await expect(page.getByText('Archived', { exact: true })).toBeVisible();

    // 13. Unpublish is not available for archived products (terminal state).
    await expect(page.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);
  });

  test('API errors are displayed in the UI', async ({ page }) => {
    await signIn(page);

    // Create a product and a variant with a known SKU.
    await page.goto('/dashboard/products/new');
    const suffix = Date.now().toString().slice(-6);
    await page.getByLabel('Name').fill(`E2E Error Product ${suffix}`);
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page).toHaveURL(/\/dashboard\/products\/[0-9a-f-]{36}$/);

    await page.getByRole('button', { name: 'Add variant' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('Duplicate SKU');
    await dialog.getByLabel('SKU').fill(`E2E-DUP-${suffix}`);
    await dialog.getByRole('spinbutton', { name: 'Price (EGP)', exact: true }).fill('100.00');
    await dialog.getByRole('button', { name: 'Add variant' }).click();
    await expect(page.getByText('Variant created.')).toBeVisible();

    // Attempt a second variant with the same SKU -> the backend returns
    // CONFLICT and the UI must render the real API error message.
    await page.getByRole('button', { name: 'Add variant' }).click();
    const secondDialog = page.getByRole('dialog');
    await secondDialog.getByLabel('Name').fill('Duplicate SKU Again');
    await secondDialog.getByLabel('SKU').fill(`E2E-DUP-${suffix}`);
    await secondDialog.getByRole('spinbutton', { name: 'Price (EGP)', exact: true }).fill('120.00');
    await secondDialog.getByRole('button', { name: 'Add variant' }).click();

    await expect(
      page.getByText('A variant with this SKU already exists in this store.'),
    ).toBeVisible();
  });

  test('protected routes redirect to /login', async ({ page }) => {
    await page.goto('/dashboard/products');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
