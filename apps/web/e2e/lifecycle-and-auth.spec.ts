import { expect, test } from '@playwright/test';
import {
  E2E_EMAIL,
  addVariant,
  createCategory,
  createProduct,
  signIn,
  uniqueSuffix,
} from './helpers';

test.describe('Auth lifecycle', () => {
  test('logout clears the session and protects the dashboard again', async ({ page }) => {
    await signIn(page);

    await page.locator('.user-menu__trigger').click();
    await page.getByRole('button', { name: /Log out/ }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });

    // The session is gone — a protected route must bounce back to /login.
    await page.goto('/dashboard/products');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    await expect(page.getByLabel('Email')).toBeVisible();
  });

  test('the session persists across a full page reload', async ({ page }) => {
    await signIn(page);

    await page.reload();
    // Still authenticated after reload (no redirect to /login).
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(page.getByText('Welcome back', { exact: false })).toBeVisible();
  });

  test('a wrong password shows a real Supabase error and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(E2E_EMAIL);
    await page.getByLabel('Password').fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('Catalog lifecycle through the UI', () => {
  test('publish → unpublish → variant archive', async ({ page }) => {
    const suffix = uniqueSuffix();
    const productName = `Lifecycle Product ${suffix}`;
    await signIn(page);
    await createProduct(page, productName);

    // Extra variant to archive later (the default one stays active).
    await addVariant(page, {
      name: 'XL / Blue',
      sku: `LIFE-${suffix}-XL`,
      price: '700.00',
      compareAtPrice: '800.00',
    });

    // Publish.
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Product published.')).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();

    // Unpublish back to draft.
    await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Unpublish', exact: true }).click();
    await expect(page.getByText('Product unpublished.')).toBeVisible();
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();

    // Archive the extra variant (its row has exactly one Edit + Archive pair).
    const variantRow = page.getByRole('row').filter({ hasText: 'XL / Blue' });
    await variantRow.getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive variant' }).click();
    await expect(page.getByText('Variant archived.')).toBeVisible();
    await expect(variantRow.getByText('Archived')).toBeVisible();
  });

  test('category edit and archive', async ({ page }) => {
    const suffix = uniqueSuffix();
    const categoryName = `Editable Category ${suffix}`;
    await signIn(page);
    await createCategory(page, categoryName, 'Original description');

    // Edit the category.
    await page.getByLabel('Name').fill(`${categoryName} v2`);
    await page.getByLabel('Description').fill('Updated description');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Category updated.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: `${categoryName} v2` })).toBeVisible();

    // Archive it.
    await page.getByRole('button', { name: 'Archive', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Archive', exact: true }).click();
    await expect(page.getByText('Category archived.')).toBeVisible();
    await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();

    // It shows in the categories list as archived.
    await page.goto('/dashboard/categories');
    await expect(page.getByText(`${categoryName} v2`)).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: `${categoryName} v2` })).toContainText(
      'Archived',
    );
  });

  test('category details list the products assigned to it', async ({ page }) => {
    const suffix = uniqueSuffix();
    const categoryName = `Collection ${suffix}`;
    const productName = `Collection Product ${suffix}`;

    await signIn(page);
    await createCategory(page, categoryName);
    await createProduct(page, productName);

    // Assign the product to the category from the product page.
    await page.getByLabel('Assign a category').selectOption({ label: categoryName });
    await expect(page.getByText('Category assigned.')).toBeVisible();

    // The category details page lists the product.
    await page.goto('/dashboard/categories');
    const row = page.getByRole('row').filter({ hasText: categoryName });
    await row.getByRole('link', { name: categoryName }).click();
    await expect(page.getByText(productName)).toBeVisible();
  });
});

test.describe('Store information page', () => {
  test('renders store + account details from the real API', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/store');

    await expect(page.getByRole('heading', { level: 1, name: 'Store' })).toBeVisible();
    await expect(page.getByText('Ziad Store').first()).toBeVisible();
    await expect(page.getByText('ziad-store').first()).toBeVisible();
    await expect(page.getByText('EGP').first()).toBeVisible();
    await expect(page.getByText(E2E_EMAIL).first()).toBeVisible();
    await expect(page.locator('.detail-grid__side')).toContainText('Admin');
  });
});
