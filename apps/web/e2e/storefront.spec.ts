import { expect, test } from '@playwright/test';
import { signIn, uniqueSuffix } from './helpers';

/**
 * Phase 19 — end-to-end merchant-to-customer storefront journey:
 *
 *   Sign in  ->  Dashboard (derive the store slug)  ->  Create + publish a
 *   product  ->  Open the storefront  ->  Browse product  ->  Product details
 *   ->  Add to cart  ->  Cart  ->  Checkout form  ->  Order placed.
 *
 * The PAYMENT leg (Paymob iframe -> webhook -> order confirmation) is
 * ENVIRONMENT-BLOCKED when PAYMOB_API_KEY / PAYMOB_INTEGRATION_ID /
 * PAYMOB_IFRAME_ID are placeholders (the backend refuses to initiate and the
 * merchant must provide real credentials). The `checkout with live Paymob`
 * test is explicitly skipped in that case — it is never silently faked.
 *
 * PREREQUISITES: API (:4000) + web dev server (:3000) + a real Supabase
 * project with a merchant (E2E_EMAIL / E2E_PASSWORD, default
 * e2e.merchant@ziad.test).
 */

function paymobConfigured(): boolean {
  const key = process.env.PAYMOB_API_KEY ?? '';
  const integration = process.env.PAYMOB_INTEGRATION_ID ?? '';
  // Phase 22: the Intention flow needs the public key, not an iframe id.
  const publicKey = process.env.PAYMOB_PUBLIC_KEY ?? '';
  const placeholders = /YOUR|REPLACE|placeholder/i;
  return (
    key.length > 0 && !placeholders.test(key) &&
    integration.length > 0 && !placeholders.test(integration) &&
    publicKey.length > 0 && !placeholders.test(publicKey)
  );
}

test('merchant opens the storefront, customer browses and adds to cart', async ({ page }) => {
  const suffix = uniqueSuffix();
  const productName = `Storefront Product ${suffix}`;

  // 1. Sign in as the merchant (real Supabase session -> /auth/me -> dashboard).
  await signIn(page);

  // 2. Derive the store slug from the dashboard topbar (never hardcoded).
  const slugText = (await page.locator('.topbar__store-slug').innerText()).trim();
  const storeSlug = slugText.replace(/^\//, '');
  expect(storeSlug.length).toBeGreaterThan(0);

  // 3. Create + publish a product through the dashboard UI.
  await page.goto('/dashboard/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByText('Product created.')).toBeVisible();

  // 3b. The default variant starts with no inventory row. Add stock so the
  // product is purchasable on the storefront (docs/PRODUCT-AUDIT-PHASE20 §7:
  // Set Inventory is only available via the per-variant modal).
  await page.getByRole('button', { name: 'Adjust inventory' }).click();
  const inventoryDialog = page.getByRole('dialog');
  await inventoryDialog.getByRole('spinbutton', { name: 'Quantity' }).fill('5');
  await inventoryDialog.getByLabel('Reason').fill('INITIAL_STOCK');
  await inventoryDialog.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText('Inventory adjusted.')).toBeVisible();

  await page.getByRole('button', { name: 'Publish' }).click();
  // The details page confirms the lifecycle transition in a dialog.
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Product published.')).toBeVisible();

  // 4. View Store -> the storefront renders the REAL store (branding).
  await page.goto(`/store/${storeSlug}`);
  await expect(page).toHaveURL(new RegExp(`/store/${storeSlug}$`));
  // Store branding from the backend store config.
  await expect(page.locator('.sf-brand__name')).not.toBeEmpty();

  // 5. The published product appears in the storefront product listing.
  await page.goto(`/store/${storeSlug}/products`);
  await expect(page.getByRole('link', { name: productName }).first()).toBeVisible({
    timeout: 20_000,
  });

  // 6. Product details page.
  await page.getByRole('link', { name: productName }).first().click();
  await expect(page.getByRole('heading', { name: productName })).toBeVisible();

  // 7. Add to cart (single variant auto-selected; the cart is guest-based).
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to your cart.')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('[data-testid="cart-count"]')).toContainText('1');

  // 8. Cart page shows the item with a line total.
  await page.goto(`/store/${storeSlug}/cart`);
  await expect(page.locator('[data-testid="cart-item"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="cart-subtotal"]')).not.toBeEmpty();
});

// The PAYMENT leg requires REAL Paymob credentials. When the environment has
// placeholder credentials (this repo's default), the backend refuses to
// initiate a payment and the full card-payment leg cannot run — it is
// explicitly SKIPPED rather than faked. The skip must be declared INSIDE the
// test body: a module-level `test.skip(condition)` in Playwright skips the
// whole file, which would silently hide the storefront journey above. See
// docs/IMPLEMENTATION-PHASE21-CRITICAL-PRODUCTION-FIXES.md §11.
test('customer completes checkout with the live Paymob flow (environment-blocked)', async ({
  page,
}) => {
  test.skip(!paymobConfigured(), 'Paymob credentials are not configured');
  const suffix = uniqueSuffix();
  const productName = `Paymob Product ${suffix}`;

  await signIn(page);
  const slugText = (await page.locator('.topbar__store-slug').innerText()).trim();
  const storeSlug = slugText.replace(/^\//, '');

  await page.goto('/dashboard/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByRole('button', { name: 'Create product' }).click();
  await page.getByRole('button', { name: 'Adjust inventory' }).click();
  const inventoryDialog = page.getByRole('dialog');
  await inventoryDialog.getByRole('spinbutton', { name: 'Quantity' }).fill('5');
  await inventoryDialog.getByLabel('Reason').fill('INITIAL_STOCK');
  await inventoryDialog.getByRole('button', { name: 'Apply adjustment' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Product published.')).toBeVisible();

  await page.goto(`/store/${storeSlug}/products`);
  await page.getByRole('link', { name: productName }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await page.goto(`/store/${storeSlug}/checkout`);

  await page.getByLabel('Full name').fill('Ahmed Ali');
  await page.getByLabel('Phone').fill('01000000000');
  await page.getByLabel('Governorate').fill('Cairo');
  await page.getByLabel('City').fill('Cairo');
  await page.getByLabel('Street address').fill('123 Main St');
  await page.getByRole('button', { name: 'Pay Online' }).click();

  // The Paymob unified checkout is rendered from the provider checkout URL.
  await expect(page.locator('[data-testid="payment-iframe"]')).toBeVisible({ timeout: 20_000 });
});

/**
 * Phase 22 — the WhatsApp fallback DOES NOT need Paymob: the merchant enables
 * WhatsApp orders, the customer checks out via "Order via WhatsApp", a REAL
 * order is created server-side and WhatsApp opens with the prepared message.
 * The merchant then sees the order with channel = WhatsApp in the dashboard.
 */
test('customer places an order via WhatsApp (real order, no Paymob required)', async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const productName = `WhatsApp Product ${suffix}`;

  await signIn(page);
  const slugText = (await page.locator('.topbar__store-slug').innerText()).trim();
  const storeSlug = slugText.replace(/^\//, '');

  // 1. Enable WhatsApp ordering in the dashboard settings.
  await page.goto('/dashboard/settings');
  await page.getByRole('checkbox', { name: 'Enable WhatsApp Orders' }).check();
  await page.getByLabel('WhatsApp Number').fill('+201012345678');
  await page
    .locator('form')
    .filter({ hasText: 'WhatsApp Number' })
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(page.getByText('WhatsApp settings updated.')).toBeVisible();

  // 2. Create + publish a product with stock.
  await page.goto('/dashboard/products/new');
  await page.getByLabel('Name').fill(productName);
  await page.getByRole('button', { name: 'Create product' }).click();
  await expect(page.getByText('Product created.')).toBeVisible();
  await page.getByRole('button', { name: 'Adjust inventory' }).click();
  const inventoryDialog = page.getByRole('dialog');
  await inventoryDialog.getByRole('spinbutton', { name: 'Quantity' }).fill('5');
  await inventoryDialog.getByLabel('Reason').fill('INITIAL_STOCK');
  await inventoryDialog.getByRole('button', { name: 'Apply adjustment' }).click();
  await expect(page.getByText('Inventory adjusted.')).toBeVisible();
  await page.getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByText('Product published.')).toBeVisible();

  // 3. Storefront: product -> cart -> checkout.
  await page.goto(`/store/${storeSlug}/products`);
  await page.getByRole('link', { name: productName }).first().click();
  await page.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Added to your cart.')).toBeVisible({ timeout: 10_000 });
  await page.goto(`/store/${storeSlug}/checkout`);

  await page.getByLabel('Full name').fill('Ahmed Ali');
  await page.getByLabel('Phone').fill('01000000000');
  await page.getByLabel('Governorate').fill('Cairo');
  await page.getByLabel('City').fill('Cairo');
  await page.getByLabel('Street address').fill('123 Main St');

  // 4. Choose "Order via WhatsApp" — a real order is created + WhatsApp opens.
  await page.getByRole('button', { name: 'Order via WhatsApp' }).click();
  await expect(page.getByText('Your order is ready to send on WhatsApp.')).toBeVisible({
    timeout: 20_000,
  });
  const whatsappLink = page.locator('[data-testid="open-whatsapp"]');
  await expect(whatsappLink).toBeVisible();
  await expect(whatsappLink).toHaveAttribute('href', /^https:\/\/wa\.me\/201012345678\?text=/);

  // 5. The merchant sees the WhatsApp order in the dashboard Orders list.
  await page.goto('/dashboard/orders');
  await expect(page.getByRole('link', { name: /ORD-/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('[data-testid^="order-channel-"]').first()).toHaveText('WhatsApp');
});

test('the storefront is reachable without any merchant session (guest access)', async ({
  page,
}) => {
  // Anonymous browsing must never require authentication — the storefront is
  // a @Public() surface. Visiting an unknown store fails closed with 404.
  await page.goto('/store/this-store-does-not-exist');
  await expect(page.getByText('The store could not be loaded.')).toBeVisible({
    timeout: 20_000,
  });
});
