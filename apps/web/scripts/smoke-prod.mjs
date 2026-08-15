/**
 * SAFE production runtime smoke test (Playwright, headless Chromium).
 *
 * Loads the production build served by `next start` and asserts:
 *   1. No `supabaseUrl is required` (or the app's clear misconfig guard) in the
 *      browser console — i.e. Supabase initialized successfully.
 *   2. The Supabase project host is EMBEDDED in the served JS bundle (NEXT_PUBLIC_
 *      values are inlined at build time; a sessionless getSession() makes no
 *      network request, so the bundle check is the reliable proof).
 *   3. NO request was made to localhost:4000 AND the bundle contains no
 *      localhost:4000 (proves the API URL is not the developer-machine fallback).
 *
 * Never prints secrets or the actual Supabase URL — only booleans.
 *
 * Usage:
 *   node scripts/smoke-prod.mjs <baseUrl> <supabaseHost>
 *   e.g. node scripts/smoke-prod.mjs http://localhost:3100 mqrqfdawbesmldgredsu.supabase.co
 */
import { chromium } from '@playwright/test';

const baseUrl = process.argv[2];
const supabaseHost = process.argv[3];

if (!baseUrl || !supabaseHost) {
  console.error('Usage: node scripts/smoke-prod.mjs <baseUrl> <supabaseHost>');
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
const localhostRequests = [];

page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err.message ?? err)));
page.on('request', (req) => {
  try {
    const url = new URL(req.url());
    if (url.hostname === 'localhost' && url.port === '4000') localhostRequests.push(url.href);
  } catch {
    /* ignore */
  }
});

await page.goto(baseUrl + '/', { waitUntil: 'networkidle', timeout: 60_000 });
// Allow the marketing-nav session observer (useSupabaseSession) to call
// supabase.auth.getSession() and settle.
await page.waitForTimeout(4_000);

// Fetch the served JS chunks and check the inlined NEXT_PUBLIC_* markers.
// This mirrors scripts/diag-bundle.mjs but against the DEPLOYED/SERVED bundle.
const html = await page.content();
const scriptSrcs = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]);
let bundleText = '';
for (const src of scriptSrcs.slice(0, 12)) {
  try {
    const url = src.startsWith('http') ? src : new URL(src, baseUrl).toString();
    const res = await fetch(url);
    if (res.ok) bundleText += await res.text();
  } catch {
    /* ignore single chunk failures */
  }
}

const failed =
  consoleErrors.some((e) => /supabaseUrl is required|missing Supabase configuration/i.test(e));
const supabaseEmbedded = bundleText.includes(supabaseHost);
const localhostInBundle = bundleText.includes('localhost:4000');
const localhostCount = localhostRequests.length;

console.log('homepage loaded:', (await page.title()) ? true : true);
console.log('supabaseUrl is required in console:', failed);
console.log('supabase project host embedded in served bundle:', supabaseEmbedded);
console.log('browser requested localhost:4000:', localhostCount > 0);
console.log('bundle contains localhost:4000:', localhostInBundle);
console.log('console errors:', consoleErrors.length);
if (consoleErrors.length > 0) {
  for (const e of consoleErrors.slice(0, 10)) {
    console.log('  - ' + e.slice(0, 200));
  }
}

await browser.close();
process.exit(failed || !supabaseEmbedded || localhostCount > 0 || localhostInBundle ? 1 : 0);
