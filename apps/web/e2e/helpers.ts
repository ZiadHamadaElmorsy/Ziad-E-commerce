import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Real Supabase merchant used by the E2E suite (override via env). */
export const E2E_EMAIL = process.env.E2E_EMAIL ?? 'e2e.merchant@ziad.test';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'Ziad@E2E2026!';

/**
 * Email domain used for NEW signups in the onboarding journey (override via
 * env). The configured Supabase project rejects `.test` and `example.com` as
 * "invalid" (its GoTrue email validation), so the default is a real provider
 * domain that passes validation. The shared project rate-limits signups —
 * run the suite when the signup rate limit has reset and avoid re-running it
 * more than necessary (each run creates one throwaway user that is deleted in
 * the cleanup step).
 */
export const E2E_EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? 'gmail.com';

/**
 * Unique email for a NEW signup. The suffix combines time + randomness so two
 * runs never collide, even in the same millisecond.
 */
export function uniqueEmail(): string {
  const suffix = `${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 900 + 100)}`;
  return `merchant.${suffix}@${E2E_EMAIL_DOMAIN}`;
}

/** Loads the Supabase admin credentials from the environment (server-side). */
function loadSupabaseAdmin(): { url?: string; serviceRoleKey?: string } {
  const read = (file: string): Record<string, string> => {
    try {
      return Object.fromEntries(
        readFileSync(file, 'utf8')
          .split(/\r?\n/)
          .filter((line) => line.includes('='))
          .map((line) => {
            const i = line.indexOf('=');
            return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, '')];
          }),
      );
    } catch {
      return {};
    }
  };
  const rootEnv = read(resolve(__dirname, '../../../.env'));
  const webEnv = read(resolve(__dirname, '../.env'));
  return {
    url:
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      rootEnv.SUPABASE_URL ??
      webEnv.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? rootEnv.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * Finds Supabase Auth user ids matching `email` via the admin API. Paginates
 * because GoTrue's `filter=email=eq.<email>` query does not match on this
 * project's GoTrue version (returns empty for every quoting form). The test
 * project is small, so pagination is deterministic and cheap.
 */
async function findSupabaseUserIdsByEmail(
  email: string,
): Promise<{ url: string; headers: Record<string, string>; ids: string[] } | null> {
  const { url, serviceRoleKey } = loadSupabaseAdmin();
  if (!url || !serviceRoleKey) {
    return null;
  }
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
  const ids: string[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const res = await fetch(
        `${url}/auth/v1/admin/users?page=${page}&per_page=200`,
        { headers },
      );
      if (!res.ok) {
        return null;
      }
      const body = (await res.json()) as {
        users?: Array<{ id: string; email?: string }>;
      };
      const users = body.users ?? [];
      for (const user of users) {
        if (user.email === email) {
          ids.push(user.id);
        }
      }
      if (users.length < 200) {
        break;
      }
    }
  } catch {
    return null;
  }
  return { url, headers, ids };
}

/**
 * Deletes every Supabase Auth user matching `email` via the admin API
 * (service-role). Best-effort test cleanup — returns false when the admin
 * credentials are not available or the call fails. The application `users`
 * row left behind is E2E residue handled by `scripts/pilot-cleanup.ts`.
 */
export async function deleteSupabaseUserByEmail(email: string): Promise<boolean> {
  const found = await findSupabaseUserIdsByEmail(email);
  if (!found || found.ids.length === 0) {
    return false;
  }
  try {
    for (const id of found.ids) {
      await fetch(`${found.url}/auth/v1/admin/users/${id}`, {
        method: 'DELETE',
        headers: found.headers,
      });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Confirms a Supabase Auth user's email via the admin API (service-role).
 * Deterministic test setup: the shared Supabase project may have "Confirm
 * email" enabled, which makes the public signup show a "Check your email"
 * screen instead of returning a session. Confirming through the admin API
 * (never a production auth change) lets the E2E journey continue through the
 * real login flow. Returns false when admin credentials are unavailable.
 */
export async function confirmSupabaseUserByEmail(email: string): Promise<boolean> {
  const found = await findSupabaseUserIdsByEmail(email);
  if (!found || found.ids.length === 0) {
    return false;
  }
  try {
    for (const id of found.ids) {
      const res = await fetch(`${found.url}/auth/v1/admin/users/${id}`, {
        method: 'PUT',
        headers: found.headers,
        body: JSON.stringify({ email_confirm: true }),
      });
      if (!res.ok) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Provisions a confirmed Supabase Auth user via the admin API (service-role).
 * Deterministic fallback when the shared project's PUBLIC signup endpoint is
 * rate-limited ("Too many attempts") — admin-created users do not consume the
 * signup rate-limit quota, and the user is created pre-confirmed so the E2E
 * journey continues through the real login → onboarding flow. Never a
 * production auth change.
 */
export async function provisionSupabaseUser(
  email: string,
  password: string,
  metadata: { first_name: string; last_name: string },
): Promise<boolean> {
  const { url, serviceRoleKey } = loadSupabaseAdmin();
  if (!url || !serviceRoleKey) {
    return false;
  }
  try {
    const res = await fetch(`${url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          store_name: undefined,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

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
