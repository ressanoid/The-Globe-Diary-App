// Diagnoses the Google sign-in popup flow by driving the real app in headless
// Chromium and capturing what the OAuth popup actually does.
//
// Run with: node scripts/diag-google-signin.mjs   (expects `npm run dev` on :5173)
//
// The popup lands on Google's own page. If the OAuth client is misconfigured,
// that page (or its URL) names the cause — e.g. `origin_mismatch`,
// `redirect_uri_mismatch`, `admin_policy_enforced`, `org_internal`.

import { chromium } from 'playwright';

const APP_URL = process.env.E2E_URL || 'http://localhost:5173/';

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const context = await browser.newContext();
const page = await context.newPage();

const consoleMsgs = [];
page.on('console', (m) => consoleMsgs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
page.on('pageerror', (e) => consoleMsgs.push(`pageerror: ${String(e).slice(0, 300)}`));

console.log('→ loading app');
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => window.__store && window.__store.mode === 'firestore',
  { timeout: 30000 }
).catch(() => console.log('  (store never reached firestore mode — continuing anyway)'));

console.log('→ opening auth modal');
await page.click('#auth-signin-btn').catch((e) => console.log('  click failed:', e.message));
await page.waitForSelector('#google-signin-btn', { timeout: 5000 }).catch(() => {});

console.log('→ clicking Google sign-in (watching for the popup)');
const popupPromise = context.waitForEvent('page', { timeout: 20000 }).catch(() => null);

await page.click('#google-signin-btn').catch((e) => console.log('  click failed:', e.message));

const popup = await popupPromise;

if (popup) {
  console.log('  popup opened');
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  await new Promise((r) => setTimeout(r, 4000));
  console.log('\n=== POPUP URL ===');
  console.log(popup.url());
  const bodyText = await popup.evaluate(() => document.body?.innerText?.slice(0, 800)).catch(() => '(unreadable)');
  console.log('\n=== POPUP BODY (first 800 chars) ===');
  console.log(bodyText);
} else {
  console.log('  NO popup opened within 20s');
}

// Give the app a moment to write an error into #auth-error.
await new Promise((r) => setTimeout(r, 2500));
const appError = await page.evaluate(() => document.getElementById('auth-error')?.textContent || '').catch(() => '');
console.log('\n=== #auth-error IN APP ===');
console.log(appError || '(empty)');

const relevant = consoleMsgs.filter((m) => /auth|google|error|popup|origin/i.test(m));
console.log('\n=== RELEVANT CONSOLE OUTPUT ===');
relevant.slice(0, 25).forEach((m) => console.log(' •', m));
if (!relevant.length) console.log('(none)');

await browser.close();
