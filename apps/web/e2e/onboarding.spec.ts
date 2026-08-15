import { expect, test } from '@playwright/test';
import {
  confirmSupabaseUserByEmail,
  deleteSupabaseUserByEmail,
  provisionSupabaseUser,
  uniqueEmail,
  uniqueSuffix,
} from './helpers';

/**
 * Phase 17 — realistic end-to-end merchant journey:
 *
 *   Open /  ->  Start Selling  ->  Signup  ->  Create Store (onboarding)
 *   ->  Dashboard  ->  Verify merchant/store context  ->  Create first product
 *   ->  Verify the product belongs to the created store.
 *
 * PREREQUISITES:
 *   - API running on http://localhost:4000 (npm run dev:api)
 *   - Web dev server running on http://localhost:3000 (npm run dev:web)
 *   - A real Supabase project configured (NEXT_PUBLIC_SUPABASE_URL /
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY / DATABASE_URL / DIRECT_URL ...)
 *
 * Phase 24 (deterministic setup): the shared Supabase project may (a) have
 * "Confirm email" ENABLED — the public signup then shows a "Check your email"
 * screen and the throwaway user is confirmed through the admin API; and/or
 * (b) rate-limit public signups ("Too many attempts") — the test then
 * provisions the user pre-confirmed via the admin API (never a production auth
 * change) and continues through the real login flow. The created Auth user is
 * deleted after the run (admin API, best effort) so repeated runs do not
 * accumulate users.
 */
test('a new merchant signs up, creates a store, and publishes their first product', async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const email = uniqueEmail();
  const password = 'Ziad@E2E2026!';
  const storeName = `Journey Store ${suffix}`;
  const productName = `Journey Product ${suffix}`;

  try {
    // 1. Public marketing site -> Start Selling.
    await page.goto('/');
    await page.getByRole('link', { name: 'Start Selling' }).first().click();
    await expect(page).toHaveURL(/\/signup$/);

    // 2. Signup (Supabase Auth account) — the real UI journey.
    await page.getByLabel(/^First name/).fill('Journey');
    await page.getByLabel(/^Last name/).fill('Merchant');
    await page.getByLabel(/^Store name/).fill(storeName);
    await page.getByLabel(/^Email/).fill(email);
    await page.getByLabel(/^Password/).fill(password);
    await page.getByLabel(/^Confirm password/).fill(password);
    await page.getByRole('button', { name: 'Sign up' }).click();

    // 2b. Deterministic post-signup handling (outcomes run in parallel):
    //     (a) session returned -> /onboarding directly;
    //     (b) "Confirm email" enabled -> "Check your email" -> confirm + login;
    //     (c) signup RATE-LIMITED -> provision via admin API + login.
    const urlResult = page
      .waitForURL(/\/onboarding$/, { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const checkEmailResult = page
      .getByRole('heading', { name: 'Check your email' })
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const [onboardingReached, checkEmailShown] = await Promise.all([
      urlResult,
      checkEmailResult,
    ]);

    let storeNamePrefilled = false;
    if (onboardingReached) {
      // (a) Session returned directly — the store name was carried over.
      storeNamePrefilled = true;
    } else if (checkEmailShown) {
      // (b) Email confirmation required — confirm the throwaway user.
      const confirmed = await confirmSupabaseUserByEmail(email);
      expect(confirmed, 'admin API must confirm the throwaway user').toBe(true);
      await page.getByRole('link', { name: 'Sign in instead' }).click();
      await expect(page).toHaveURL(/\/login$/);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
      // The signup UI ran, so the store name is still carried over.
      storeNamePrefilled = true;
    } else {
      // (c) Rate-limited ("Too many attempts") or another visible error:
      //     surface the page text for an honest failure, OR fall back to
      //     admin provisioning when the message is the Supabase rate limit.
      const bodyText = await page.locator('body').innerText();
      const rateLimited = /too many attempts/i.test(bodyText);
      if (!rateLimited) {
        throw new Error(
          `Signup did not reach onboarding or the confirmation screen. Page text: ${bodyText.slice(0, 400)}`,
        );
      }
      const provisioned = await provisionSupabaseUser(email, password, {
        first_name: 'Journey',
        last_name: 'Merchant',
      });
      expect(provisioned, 'admin API must provision the fallback user').toBe(true);
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password').fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/onboarding$/, { timeout: 30_000 });
      // The admin-provisioned path did NOT run the signup UI, so the store
      // name must be typed manually in onboarding.
      storeNamePrefilled = false;
    }

    // 3. Onboarding -> create the Store/Tenant.
    await expect(page.getByRole('heading', { name: 'Create your store' })).toBeVisible();
    // Fill the identity fields explicitly: the prefill from Supabase user
    // metadata is async and can race the click (especially on the
    // admin-provisioned fallback path). Filling is idempotent for the
    // UI-signup path too (same values).
    await page.getByLabel(/^First name/).fill('Journey');
    await page.getByLabel(/^Last name/).fill('Merchant');
    if (storeNamePrefilled) {
      await expect(page.getByLabel(/^Store name/)).toHaveValue(storeName);
    } else {
      await page.getByLabel(/^Store name/).fill(storeName);
    }
    await page.getByRole('button', { name: 'Create store' }).click();

    // The backend provisioned the User + Store + OWNER membership; onboarding
    // advances to the appearance step.
    await expect(page.getByRole('heading', { name: 'Make it yours' })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: 'Skip for now' }).click();

    // 4. First product (optional onboarding step).
    await expect(page.getByRole('heading', { name: 'Add your first product' })).toBeVisible();
    await page.getByLabel(/^Product name/).fill(productName);
    await page.getByLabel(/^Price \(EGP\)/).fill('250.00');
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText('Product created.')).toBeVisible();

    // 5. Launch step -> dashboard.
    await expect(page.getByRole('heading', { name: 'Your store is ready' })).toBeVisible();
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
    await expect(page.getByText('Welcome back', { exact: false })).toBeVisible();

    // 6. The dashboard resolves the NEW merchant's store context (never a
    // hardcoded tenant): the topbar shows the store name and the slug.
    await expect(page.locator('.topbar__store-name')).toContainText(storeName);
    await expect(page.locator('.topbar__store-slug')).toContainText('/journey-store');

    // 7. The product belongs to the created store: it is listed in the dashboard.
    await page.goto('/dashboard/products');
    await expect(page.getByRole('link', { name: productName })).toBeVisible({ timeout: 30_000 });
  } finally {
    // Best-effort cleanup: delete the throwaway Auth user so repeated runs do
    // not accumulate users in the shared Supabase project.
    await deleteSupabaseUserByEmail(email);
  }
});
