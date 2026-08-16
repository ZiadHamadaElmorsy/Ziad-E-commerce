/**
 * Verifies the LIVE Vercel deployment contains the registration/auth fixes.
 *
 *   node scripts/verify-prod-deploy.mjs
 *
 * Polls the production signup page until the freshly-built JS bundles appear,
 * then asserts:
 *   1. The bundle embeds the canonical production app URL
 *      (https://ziad-e-commerce-web-sigma.vercel.app) used for the
 *      email-confirmation redirect.
 *   2. The support-contact configuration marker is present.
 *   3. No localhost:3000 auth URL is embedded in production bundles.
 */
const BASE = 'https://ziad-e-commerce-web-sigma.vercel.app';
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (Vercel build can take a while)
const POLL_INTERVAL_MS = 15_000;

async function fetchText(url, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function buildMarkers(html) {
  const srcs = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1]);
  return [...new Set(srcs.map((s) => (s.startsWith('http') ? s : new URL(s, BASE).toString())))];
}

async function scanBundles() {
  const html = await fetchText(`${BASE}/signup`);
  const scriptUrls = buildMarkers(html);
  let allJs = '';
  for (const url of scriptUrls) {
    try {
      allJs += await fetchText(url);
    } catch {
      // chunk may 404 between deployments; ignore and retry next poll
    }
  }
  return {
    html,
    allJs,
    hasAppUrl: allJs.includes('ziad-e-commerce-web-sigma.vercel.app'),
    hasSupportMarker: allJs.includes('supportPhone'),
    hasLocalhostAuth: allJs.includes('http://localhost:3000'),
  };
}

const deadline = Date.now() + POLL_TIMEOUT_MS;
let result = null;
while (Date.now() < deadline) {
  try {
    result = await scanBundles();
    if (result.hasAppUrl && result.hasSupportMarker) break;
  } catch (err) {
    console.log(`poll error (${new Date().toISOString()}): ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
}

if (!result) {
  console.error('FAIL  could not fetch production site at all');
  process.exit(1);
}

console.log('production app url embedded in bundles:', result.hasAppUrl);
console.log('support-phone config marker embedded:', result.hasSupportMarker);
console.log('localhost:3000 anywhere in bundles:', result.hasLocalhostAuth);

const ok = result.hasAppUrl && result.hasSupportMarker && !result.hasLocalhostAuth;
console.log(ok ? '\nPRODUCTION BUNDLE VERIFICATION: PASS' : '\nPRODUCTION BUNDLE VERIFICATION: FAIL');
process.exit(ok ? 0 : 1);
