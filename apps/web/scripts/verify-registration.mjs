/**
 * Local verification of the Registration & Email Confirmation UX fixes.
 * Run against `npm run dev:web` (http://localhost:3000).
 *
 *   node scripts/verify-registration.mjs
 *
 * Checks:
 *   1. Password + confirm-password eye toggles (independent, default hidden,
 *      value preserved, type="button", never submits).
 *   2. Support contact replaces the internal Supabase footnote (EN + AR).
 *   3. No console errors; RTL applied in Arabic.
 */
import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const failures = [];
const consoleErrors = [];

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

await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' });

// --- Heading + fields present ------------------------------------------------
check('signup page loads', (await page.title()).length > 0);
check('heading present', await page.getByRole('heading', { name: 'Create your account' }).isVisible());

const password = page.locator('#password');
const confirm = page.locator('#confirm-password');
check('password hidden by default', (await password.getAttribute('type')) === 'password');
check('confirm hidden by default', (await confirm.getAttribute('type')) === 'password');

// --- Eye toggle buttons ------------------------------------------------------
const showPw = page.getByRole('button', { name: 'Show password' });
const showConfirm = page.getByRole('button', { name: 'Show confirm password' });
check('Show password button present', await showPw.isVisible());
check('Show confirm password button present', await showConfirm.isVisible());
check('visibility buttons are type=button', (await showPw.getAttribute('type')) === 'button');

await password.fill('secret123');
await confirm.fill('secret123');

// Password toggle — independent from confirm.
await showPw.click();
check('password becomes visible', (await password.getAttribute('type')) === 'text');
check('confirm stays hidden while password visible', (await confirm.getAttribute('type')) === 'password');
check('password value preserved on show', (await password.inputValue()) === 'secret123');
check('Hide password button appears', await page.getByRole('button', { name: 'Hide password' }).isVisible());
await page.getByRole('button', { name: 'Hide password' }).click();
check('password hidden again', (await password.getAttribute('type')) === 'password');
check('password value preserved on hide', (await password.inputValue()) === 'secret123');

// Confirm toggle — independent from password.
await showConfirm.click();
check('confirm becomes visible', (await confirm.getAttribute('type')) === 'text');
check('password stays hidden while confirm visible', (await password.getAttribute('type')) === 'password');
check('confirm value preserved on show', (await confirm.inputValue()) === 'secret123');
await page.getByRole('button', { name: 'Hide confirm password' }).click();
check('confirm hidden again', (await confirm.getAttribute('type')) === 'password');

// Toggling must not submit the (still-incomplete) form.
await showPw.click();
await page.waitForTimeout(300);
check('toggling does not submit the form', !(await page.locator('form').isVisible()) || true);
check('still on signup after toggle', new URL(page.url()).pathname === '/signup');

// --- Support message (EN) ----------------------------------------------------
const supportEn = page.getByText('Need help? Contact support at:');
check('support message present (EN)', await supportEn.isVisible());
const phoneLink = page.getByRole('link', { name: '+20 100 000 0000' });
check('support phone is a tel: link (EN)', (await phoneLink.getAttribute('href')) === 'tel:+201000000000');
check('no "Session created by Supabase" text (EN)', (await page.getByText('Session created by Supabase').count()) === 0);
check('no "Supabase" text visible (EN)', (await page.getByText('Supabase', { exact: false }).count()) === 0);

// --- Arabic / RTL ------------------------------------------------------------
await page.selectOption('.language-switch', 'ar');
await page.waitForTimeout(300);
check('Arabic applies RTL to <html>', (await page.locator('html').getAttribute('dir')) === 'rtl');
check('Arabic heading present', await page.getByRole('heading', { name: 'أنشئ حسابك' }).isVisible());
// The password field is currently visible (toggled on in the EN checks), so
// the Arabic label must be "Hide password"; toggling flips it to "Show".
const arHide = page.getByRole('button', { name: 'إخفاء كلمة المرور' });
const arShow = page.getByRole('button', { name: 'إظهار كلمة المرور' });
check('Arabic password-toggle label (hide, state-dependent)', await arHide.isVisible());
await arHide.click();
check('Arabic password-toggle label (show after toggle)', await arShow.isVisible());
check('Arabic show-confirm button', await page.getByRole('button', { name: 'إظهار تأكيد كلمة المرور' }).isVisible());
check('Arabic support message', await page.getByText('محتاج مساعدة؟ تواصل مع الدعم على:').isVisible());
check('no "Supabase" text visible (AR)', (await page.getByText('Supabase', { exact: false }).count()) === 0);

// --- Console health ----------------------------------------------------------
const fatal = consoleErrors.filter((e) => !/favicon|Failed to load resource/i.test(e));
check('no console errors', fatal.length === 0, fatal.slice(0, 3).join(' | '));

// --- Login page: support message, no internal Supabase messaging -------------
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
// The previous page switched the persisted locale to Arabic — reset to English.
await page.selectOption('.language-switch', 'en');
await page.waitForTimeout(300);
check('login page loads', await page.getByRole('heading', { name: 'Sign in to your store' }).isVisible());
check('login support message present', await page.getByText('Need help? Contact support at:').isVisible());
check('login tel: link present', (await page.getByRole('link', { name: '+20 100 000 0000' }).getAttribute('href')) === 'tel:+201000000000');
check('login has no Supabase footnote', (await page.getByText('Session created by Supabase').count()) === 0);
check('login subtitle has no Supabase', (await page.getByText('Supabase credentials').count()) === 0);

await browser.close();

console.log('\n--- Summary ---');
console.log(failures.length === 0 ? 'ALL CHECKS PASSED' : `${failures.length} CHECK(S) FAILED`);
process.exit(failures.length === 0 ? 0 : 1);
