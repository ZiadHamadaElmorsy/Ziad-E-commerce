import { expect, test } from '@playwright/test';
import { createProduct, signIn, uniqueSuffix } from './helpers';

/**
 * E2E coverage for the newly completed merchant modules:
 * Orders, Customers, Settings, Store edit, Media, Inventory and the
 * English/Arabic + LTR/RTL internationalization. Everything runs against the
 * real backend — no mocks.
 */

test.describe('Orders module', () => {
  test('orders list page renders with real data controls', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/orders');

    await expect(page.getByRole('heading', { level: 1, name: 'Orders' })).toBeVisible();
    await expect(page.getByLabel('Search by order number, email, or phone…')).toBeVisible();
    await expect(page.getByLabel('Filter by status')).toBeVisible();
    // Either an empty state or a table row appears.
    await expect(page.locator('.table, .empty-state').first()).toBeVisible();
  });

  test('order details show a real not-found error for an unknown id', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/orders/00000000-0000-4000-8000-000000000000');

    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Customers module', () => {
  test('customers list page renders with real data controls', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/customers');

    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible();
    await expect(page.getByLabel('Search by name, email, or phone…')).toBeVisible();
    await expect(page.locator('.table, .empty-state').first()).toBeVisible();
  });
});

test.describe('Store editing', () => {
  test('the store name can be edited and restored through the real API', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/settings');

    const nameInput = page.getByLabel('Store name');
    await expect(nameInput).toBeVisible();
    const original = await nameInput.inputValue();
    const suffix = uniqueSuffix();

    // Rename through PATCH /stores/current.
    await nameInput.fill(`${original} ${suffix}`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Store updated.')).toBeVisible();

    // The topbar reflects the new store name immediately.
    await expect(page.locator('.topbar__store-name')).toContainText(suffix);

    // Restore the original name.
    await nameInput.fill(original);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Store updated.')).toBeVisible();
  });
});

test.describe('Media module', () => {
  test('the media page renders the upload flow', async ({ page }) => {
    await signIn(page);
    await page.goto('/dashboard/media');

    await expect(page.getByRole('heading', { level: 1, name: 'Media' })).toBeVisible();
    await expect(page.getByText('Choose a file')).toBeVisible();
    await expect(page.getByText('Alt text')).toBeVisible();
  });
});

test.describe('Inventory', () => {
  test('inventory adjustment writes real stock levels', async ({ page }) => {
    await signIn(page);
    const productName = `Inventory Product ${uniqueSuffix()}`;
    await createProduct(page, productName);

    // The default variant starts with no inventory row (—). Adjust it.
    await page.getByRole('button', { name: 'Adjust inventory' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('spinbutton', { name: 'Quantity' }).fill('5');
    await dialog.getByLabel('Reason').fill('INITIAL_STOCK');
    await dialog.getByRole('button', { name: 'Apply adjustment' }).click();

    await expect(page.getByText('Inventory adjusted.')).toBeVisible();
    // The variant row in the INVENTORY table (it has the Adjust button) now
    // shows the real on-hand value 5.
    const inventoryRow = page
      .getByRole('row')
      .filter({ hasText: productName })
      .filter({ has: page.getByRole('button', { name: 'Adjust inventory' }) });
    await expect(inventoryRow).toContainText('5');
  });
});

test.describe('Internationalization', () => {
  test('switching to Arabic flips the layout direction and labels', async ({ page }) => {
    await page.goto('/login');

    // Default English (LTR).
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in to your store' })).toBeVisible();

    // Switch to العربية -> RTL + translated labels.
    await page.getByLabel('Language / اللغة').selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.getByRole('heading', { name: 'سجّل الدخول إلى متجرك' })).toBeVisible();

    // Switch back to English (LTR).
    await page.getByLabel('Language / اللغة').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { name: 'Sign in to your store' })).toBeVisible();
  });

  test('the dashboard renders Arabic navigation in RTL mode', async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();

    await page.getByLabel('Language / اللغة').selectOption('ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('link', { name: 'المنتجات' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'الطلبات' })).toBeVisible();

    await page.getByLabel('Language / اللغة').selectOption('en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
