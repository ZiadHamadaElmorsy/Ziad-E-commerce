/**
 * Browser verification against the LIVE production deployment.
 *
 *   node scripts/verify-prod-browser.mjs
 *
 * Asserts the registration page on https://ziad-e-commerce-web-sigma.vercel.app
 * has: password visibility toggles (independent, default hidden, type=button),
 * the customer support message instead of internal Supabase messaging, and no
 * console errors / localhost requests.
 */
import { chromium } from '@playwright/test';

const BASE = 'https://ziad-e-commerce-web-sigma.vercel.app';
const failures = [];
const consoleErrors = [];
const localhostRequests = [];

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('request', (req) => {
  if (/localhost:3000|localhost:4000/.test(req.url())) localhostRequests.push(req.url());
});

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle', timeout: 60_000 });

check('signup page loads on production', (await page.title()).length > 0);
check('heading present', await page.getByRole('heading', { name: 'Create your account' }).isVisible());

const password = page.locator('#password');
const confirm = page.locator('#confirm-password');
check('password hidden by default', (await password.getAttribute('type')) === 'password');
check('confirm hidden by default', (await confirm.getAttribute('type')) === 'password');

const showPw = page.getByRole('button', { name: 'Show password' });
const showConfirm = page.getByRole('button', { name: 'Show confirm password' });
check('Show password button present', await showPw.isVisible());
check('Show confirm password button present', await showConfirm.isVisible());
check('visibility buttons are type=button', (await showPw.getAttribute('type')) === 'button');

await password.fill('secret123');
await confirm.fill('secret123');

await showPw.click();
check('password becomes visible', (await password.getAttribute('type')) === 'text');
check('confirm stays hidden while password visible', (await confirm.getAttribute('type')) === 'password');
check('password value preserved', (await password.inputValue()) === 'secret123');
await page.getByRole('button', { name: 'Hide password' }).click();
check('password hidden again', (await password.getAttribute('type')) === 'password');

await showConfirm.click();
check('confirm becomes visible', (await confirm.getAttribute('type')) === 'text');
check('password stays hidden while confirm visible', (await password.getAttribute('type')) === 'password');
await page.getByRole('button', { name: 'Hide confirm password' }).click();
check('confirm hidden again', (await confirm.getAttribute('type')) === 'password');

// Support message instead of internal Supabase messaging.
check('support message present (EN)', await page.getByText('Need help? Contact support at:').isVisible());
const phoneLink = page.getByRole('link', { name: '+20 100 000 0000' });
check('support phone is a tel: link', (await phoneLink.getAttribute('href')) === 'tel:+201000000000');
check('no "Session created by Supabase" text', (await page.getByText('Session created by Supabase').count()) === 0);
check('no "Supabase" text on signup', (await page.getByText('Supabase', { exact: false }).count()) === 0);

// Arabic / RTL.
await page.selectOption('.language-switch', 'ar');
await page.waitForTimeout(400);
check('Arabic applies RTL to <html>', (await page.locator('html').getAttribute('dir')) === 'rtl');
check('Arabic heading present', await page.getByRole('heading', { name: 'أنشئ حسابك' }).isVisible());
check('Arabic show-confirm button', await page.getByRole('button', { name: 'إظهار تأكيد كلمة المرور' }).isVisible());
check('Arabic support message', await page.getByText('محتاج مساعدة؟ تواصل مع الدعم على:').isVisible());

// Network / console health.
check('no localhost network requests', localhostRequests.length === 0, localhostRequests.join(' | '));
const fatal = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
check('no console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

await browser.close();

console.log('\n--- Summary ---');
console.log(failures.length === 0 ? 'ALL PRODUCTION CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
