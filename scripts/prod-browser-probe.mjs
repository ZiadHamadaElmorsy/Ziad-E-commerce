/**
 * Phase 25 — production browser probe (Playwright).
 *
 * Signs into the PRODUCTION web as the Phase 25 perf test merchant and
 * captures:
 *   - every API request the dashboard/products/media pages fire
 *   - request counts per page
 *   - console errors
 *   - the visible page state (loading / empty / error)
 *
 * Usage:
 *   node scripts/prod-browser-probe.mjs [--pages dashboard,products,media]
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EMAIL = process.env.PROBE_EMAIL ?? '';
const PASSWORD = process.env.PROBE_PASSWORD ?? '';
const API_ORIGIN = 'https://ziad-e-commerce-api.onrender.com';
const WEB = 'https://ziad-e-commerce-web-sigma.vercel.app';

const want = new Set(
  (process.argv[2] ?? 'dashboard,products,media')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

function log(msg) {
  process.stdout.write(msg + '\n');
}

async function probePage(browser, page, path) {
  log(`\n=== ${path} ===`);
  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(API_ORIGIN)) {
      requests.push({ url: url.replace(API_ORIGIN, ''), time: Date.now() });
    }
  });
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 200)}`));

  await page.goto(WEB + path, { waitUntil: 'networkidle', timeout: 60_000 }).catch((e) => {
    log(`  goto error: ${e.message.split('\n')[0]}`);
  });
  // Allow client-side fetches to settle.
  await page.waitForTimeout(3000);

  // Dedupe consecutive identical requests (count once per unique URL path).
  const seen = new Map();
  for (const r of requests) {
    const key = r.url;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  log(`  API requests: ${requests.length} (unique paths: ${seen.size})`);
  for (const [u, c] of seen) {
    log(`    ${c > 1 ? `[x${c}] ` : ''}${u}`);
  }
  log(`  console errors: ${consoleErrors.length}`);
  for (const e of consoleErrors.slice(0, 8)) log(`    - ${e}`);

  const state = await page
    .locator('body')
    .innerText()
    .then((t) => t.slice(0, 400).replace(/\s+/g, ' '))
    .catch(() => 'n/a');
  log(`  page text: ${state}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// --- Sign in ----------------------------------------------------------------
log('Signing in to production web…');
await page.goto(WEB + '/login', { waitUntil: 'networkidle', timeout: 60_000 });
await page.getByLabel('Email').fill(EMAIL);
await page.getByLabel('Password').fill(PASSWORD);
await page.getByRole('button', { name: /sign in/i }).click();
try {
  await page.waitForURL(/\/dashboard/, { timeout: 25_000 });
  log('Signed in → /dashboard');
} catch {
  log('Sign-in navigation did not reach /dashboard within 25s.');
  log(`  current URL: ${page.url()}`);
  const text = await page.locator('body').innerText().catch(() => '');
  log(`  page text: ${text.slice(0, 300)}`);
}

if (want.has('dashboard')) await probePage(browser, page, '/dashboard');
if (want.has('products')) await probePage(browser, page, '/dashboard/products');
if (want.has('media')) await probePage(browser, page, '/dashboard/media');
if (want.has('orders')) await probePage(browser, page, '/dashboard/orders');
if (want.has('customers')) await probePage(browser, page, '/dashboard/customers');

await browser.close();
log('\nprobe complete');
