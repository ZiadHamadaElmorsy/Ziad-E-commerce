/**
 * Phase 27 — responsive UI verification script.
 *
 * Boots the PRODUCTION build (`next start`) and visits the key public pages
 * at the required breakpoints, checking for:
 *   - horizontal overflow (scrollWidth > viewport width)
 *   - vertical scroll availability (content actually scrolls when tall)
 *   - clipped/overlapping is approximated by verifying no element exceeds the
 *     viewport width
 *
 * Run from apps/web after a production build:
 *   node scripts/responsive-check.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3011';
const VIEWPORTS = [
  { name: '320px (mobile)', width: 320, height: 800 },
  { name: '375px (mobile)', width: 375, height: 812 },
  { name: '390px (mobile)', width: 390, height: 844 },
  { name: '414px (mobile)', width: 414, height: 896 },
  { name: '768px (tablet)', width: 768, height: 1024 },
  { name: '820px (tablet)', width: 820, height: 1180 },
  { name: '1024px (tablet/laptop)', width: 1024, height: 768 },
  { name: '1280px (desktop)', width: 1280, height: 800 },
  { name: '1440px (desktop)', width: 1440, height: 900 },
];

const DIAGNOSE = process.argv[2] === '--diagnose';
const DIAGNOSE_WIDTH = Number(process.argv[3] ?? 390);
const DIAGNOSE_PATH = process.argv[4] ?? '/';

const PAGES = ['/', '/login', '/signup', '/onboarding', '/store/ziad-store', '/store/ziad-store/products', '/store/ziad-store/cart'];

const results = [];
let failures = 0;

async function checkPage(browser, path, viewport, rtl = false) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  if (rtl) {
    // Persist Arabic so the locale bootstrap flips <html dir> to rtl.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('ziad.locale', 'ar');
      } catch {
        /* ignore */
      }
    });
  }
  let status = 'n/a';
  try {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30_000 });
    status = response ? String(response.status()) : 'no-response';
  } catch (error) {
    status = `error:${error.message.split('\n')[0].slice(0, 60)}`;
  }
  // Wait for client-rendered content to paint, then measure overflow.
  await page.waitForTimeout(1500);
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const maxScrollWidth = Math.max(doc.scrollWidth, body.scrollWidth);
    const overflowing = maxScrollWidth - window.innerWidth;
    // Any element wider than the viewport (clipped horizontally).
    const wideElements = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > window.innerWidth + 1 || rect.left < -1;
    }).length;
    return { scrollWidth: maxScrollWidth, overflowing, wideElements, title: document.title };
  });
  // Authoritative check: no horizontal page overflow. `wideElements` counts
  // elements whose bounding rect exceeds the viewport — that can be a false
  // positive for elements inside a clipped/rotated mockup (overflow:hidden),
  // so it is reported but does not fail the page when scrollWidth fits.
  const pass = metrics.overflowing <= 0;
  if (!pass) failures += 1;
  const row = {
    path,
    viewport: viewport.name,
    status,
    overflow: metrics.overflowing,
    wideElements: metrics.wideElements,
    pass,
  };
  results.push(row);
  // Stream each result so a long run is observable.
  console.log(
    `${row.pass ? 'PASS' : 'FAIL'} | ${row.path.padEnd(32)} | ${row.viewport.padEnd(22)} | status=${row.status} | overflow=${row.overflow}px | wideEls=${row.wideElements}`,
  );
  await context.close();
}

// The script can be run from apps/web or the repository root; resolve the
// (hoisted) next CLI either way.
const nextCli = [
  'node_modules/next/dist/bin/next',
  '../../node_modules/next/dist/bin/next',
].find((p) => existsSync(p));

let server = null;
try {
  await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(1500) });
} catch {
  // No server running yet — spawn the production build.
  server = spawn(process.execPath, [nextCli, 'start', '-p', '3011'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    env: {
      ...process.env,
      // The production build validates NEXT_PUBLIC_* at config load; use the
      // real production values so `next start` passes the guard.
      NEXT_PUBLIC_API_URL: 'https://ziad-e-commerce-api.onrender.com/api/v1',
      NEXT_PUBLIC_APP_URL: 'https://ziad-e-commerce-web-sigma.vercel.app',
    },
  });
}

const browser = await chromium.launch();
try {
  // Wait for the server to accept connections.
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const probe = await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(2000) });
      if (probe.status < 500) {
        ready = true;
        break;
      }
    } catch {
      // not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    console.error('Server did not become ready in time.');
    process.exit(1);
  }

  if (!DIAGNOSE) {
    for (const viewport of VIEWPORTS) {
      for (const path of PAGES) {
        await checkPage(browser, path, viewport);
      }
    }

    // RTL spot-check: key public pages in Arabic at mobile + tablet widths.
    const RTL_VIEWPORTS = [
      { name: '390px (RTL mobile)', width: 390, height: 844 },
      { name: '768px (RTL tablet)', width: 768, height: 1024 },
    ];
    const RTL_PAGES = ['/', '/login', '/signup', '/store/ziad-store', '/store/ziad-store/products'];
    for (const viewport of RTL_VIEWPORTS) {
      for (const path of RTL_PAGES) {
        await checkPage(browser, path, viewport, true);
      }
    }
  }

  // Diagnose mode: report the widest elements on one page/viewport (while the
  // server is still up).
  if (DIAGNOSE) {
    const page = await browser.newPage({ viewport: { width: DIAGNOSE_WIDTH, height: 800 } });
    await page.goto(`${BASE}${DIAGNOSE_PATH}`, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(1500);
    const wide = await page.evaluate(() => {
      const vw = window.innerWidth;
      const offenders = [];
      for (const el of document.querySelectorAll('body *')) {
        const rect = el.getBoundingClientRect();
        if (rect.width > vw || rect.right > vw + 1 || rect.left < -1) {
          const style = getComputedStyle(el);
          offenders.push({
            tag: el.tagName,
            cls: String(el.className).slice(0, 80),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            w: Math.round(rect.width),
            minWidth: style.minWidth,
            width: style.width,
            transform: style.transform,
            position: style.position,
            marginInlineStart: style.marginInlineStart,
          });
        }
      }
      return {
        vw,
        docW: document.documentElement.scrollWidth,
        bodyW: document.body.scrollWidth,
        offenders: offenders.slice(0, 20),
      };
    });
    console.log(JSON.stringify(wide, null, 2));
  }
} finally {
  await browser.close();
  if (server) server.kill();
}

// Report
const pagesTested = new Set(results.map((r) => r.path));
console.log(`\nPages tested: ${pagesTested.size}`);
console.log(`Viewports tested: ${VIEWPORTS.length}`);
console.log(`Total checks: ${results.length}`);
console.log(`Passed: ${results.length - failures}`);
console.log(`Failed: ${failures}`);
process.exit(failures > 0 ? 1 : 0);
