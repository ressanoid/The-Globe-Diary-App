// Differential test: does the auth chip update after a SUCCESSFUL sign-in?
//
// Uses email/password (sign-up) so no real Google account is needed. If the
// chip updates here, the UI wiring is fine and the Google failure is isolated
// to the popup credential handoff. If it does NOT update, the bug is in the UI.
//
// Run with: node scripts/diag-auth-ui.mjs
// Creates a throwaway account and deletes it afterwards (best effort).

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const APP_URL = process.env.E2E_URL || 'http://localhost:5173/';
const TEST_EMAIL = `ui-probe-tmp-${Date.now()}@example.com`;
const TEST_PASSWORD = 'probe-password-1';

// --- helper to mint an admin access token (for cleanup) ---
const mintToken = async () => {
  const rt = JSON.parse(
    readFileSync(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8')
  )?.tokens?.refresh_token;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
      client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
      refresh_token: rt,
      grant_type: 'refresh_token'
    })
  });
  const { access_token } = await r.json();
  return access_token;
};

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

const logs = [];
page.on('console', (m) => {
  try {
    logs.push(`${m.type()}: ${m.text().slice(0, 250)}`);
  } catch {
    /* ignore unparseable console events */
  }
});
page.on('pageerror', (e) => logs.push(`pageerror: ${String(e).slice(0, 250)}`));

const state = () =>
  page
    .evaluate(() => {
      const authControls = document.getElementById('auth-controls');
      return {
        chipHtml: authControls
          ? authControls.innerHTML.replace(/\s+/g, ' ').slice(0, 220)
          : '(no #auth-controls)',
        showsSignIn: Boolean(document.getElementById('auth-signin-btn')),
        showsUser: Boolean(document.getElementById('auth-signout-btn')),
        storeMode: window.__store ? window.__store.mode : '(no __store)'
      };
    })
    .catch(() => ({ error: 'evaluate failed' }));

console.log('→ loading app');
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
// Plain wait: the previous waitForFunction call crashed this script.
await page.waitForTimeout(3000);

console.log('BEFORE sign-in:');
console.log('  ', JSON.stringify(await state()));

try {
  await page.click('#auth-signin-btn');
  await page.waitForSelector('#auth-mode-toggle', { timeout: 5000 });
  await page.click('#auth-mode-toggle'); // switch to sign-up (adds name field)

  await page.fill('#auth-name', 'UI Probe');
  await page.fill('#auth-email', TEST_EMAIL);
  await page.fill('#auth-password', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Give it time to complete and auth listeners to fire.
  await page.waitForTimeout(5000);
} catch (err) {
  console.log(`\n⚠️  script error: ${err.message}`);
}

console.log('\nAFTER successful sign-up:');
const after = await state();
console.log('  ', JSON.stringify(after));
console.log('\nRESULT:');
if (after.showsUser) console.log('  ✅ UI UPDATED — chip changed to signed-in user');
else console.log('  ❌ UI DID NOT UPDATE — still showing Sign In after a successful sign-in');

const authErrors = logs.filter(
  (l) => /auth\/|error|failed/i.test(l) && !/WebGL|GPU|favicon|violation/i.test(l)
);
if (authErrors.length) {
  console.log('\nRelevant console output:');
  authErrors.slice(0, 12).forEach((l) => console.log('  •', l));
}

await browser.close();

// --- best-effort cleanup of the throwaway account ---
try {
  const token = await mintToken();
  const lookup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/the-globe-diary/accounts:lookup`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: [TEST_EMAIL] })
    }
  );
  const { users } = await lookup.json();
  if (users?.[0]?.localId) {
    await fetch(`https://identitytoolkit.googleapis.com/v1/projects/the-globe-diary/accounts:delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: users[0].localId })
    });
    console.log(`\n🗑  cleaned up throwaway account ${users[0].localId}`);
  }
} catch (e) {
  console.log(`\n⚠️  cleanup failed (manual removal may be needed): ${e.message}`);
}
