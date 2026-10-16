// End-to-end smoke test for The Globe Diary.
// Run with: node scripts/e2e.mjs   (expects `npm run dev` on :5173)
//
// Verifies:
//   1. App boots with NO console/page errors
//   2. Sign-in gate: a throwaway account signs in through the UI, and the
//      backend only connects once a registered (non-anonymous) user exists
//   3. Phase 0 fix: Moon / Shooting Star / Earth submits all close the modal
//      and move focus (the old code threw `zoomToMoon is not a function`)
//   4. Reactions increment
//   5. Entries persist across a page reload (Firestore persistence)
//   6. Phase 3 import: a multi-day journal splits into editable moments (AI or
//      the local fallback), saves, and persists with `source: 'import'`
//   7. Phase 3 review round-trip: the same account (as author) files a review
//      request, is seeded as a reviewer out-of-band, then replies + resolves it
//      from the queue — verified through admin REST
//
// `reviewers/*` and `reviewRequests/*` are read/seeded with an admin token
// minted from the Firebase CLI refresh token (the client cannot write reviewer
// docs). When no admin token is available those assertions fail loudly rather
// than being skipped.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

// NOTE: must not be named `URL` — that shadows the global URL constructor,
// which the .env reader below uses via `new URL(...)`.
const APP_URL = process.env.E2E_URL || 'http://localhost:5173/';
const MARKER = `E2E-${Date.now()}`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const browser = await chromium.launch({
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
         '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const consoleErrors = [];
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  // Ignore irrelevant network noise (favicon 404, blocked analytics, etc.)
  if (/favicon|net::ERR|Failed to load resource/i.test(text)) return;
  consoleErrors.push(text);
});

// --- 1. Boot ---
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });

const globeReady = await page.waitForFunction(
  () => window.__globe && window.__store, { timeout: 20000 }
).then(() => true).catch(() => false);
check('app initialised (__globe + __store)', globeReady);

const webglOk = await page.evaluate(() => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
  } catch { return false; }
});
check('WebGL available in headless browser', webglOk);

// --- 1b. Sign in (anonymous sessions no longer exist) ---
// The app now gates the backend behind a registered user. Create a throwaway
// email/password account via the Identity Toolkit REST API, then sign in
// THROUGH THE REAL UI so the gate resolves before the composer tests run.
const readEnvFile = () => {
  try {
    return Object.fromEntries(
      readFileSync(new URL('../.env', import.meta.url), 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
        .map((line) => {
          const idx = line.indexOf('=');
          return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
        })
    );
  } catch {
    return {};
  }
};

const ENV = { ...readEnvFile(), ...process.env };
const E2E_EMAIL = `e2e-${Date.now()}@example.com`;
const E2E_PASSWORD = 'e2e-password-1';

// --- Admin (Firebase CLI refresh-token) access -----------------------------
// The review round-trip below makes this account BOTH the author and the
// reviewer, so the suite must seed `reviewers/{uid}` and read `reviewRequests`
// with admin privileges: client writes to `reviewers` are forbidden by the
// rules, and reading another client's request rows needs reviewer rights.
//
// The helpers degrade to `[]`/`null` when the token is unavailable. That never
// hides a failure — every dependent `check()` then fails loudly with a detail
// string, rather than the whole script crashing before the error assertions.
const PROJECT = ENV.VITE_FIREBASE_PROJECT_ID || 'the-globe-diary';
const FS_BASE =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const obtainAdminToken = async () => {
  try {
    const cfg = JSON.parse(
      readFileSync(`${homedir()}/.config/configstore/firebase-tools.json`, 'utf8')
    );
    const refreshToken = cfg.tokens?.refresh_token;
    if (!refreshToken) return null;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
        client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await res.json();
    return data.access_token || null;
  } catch {
    return null;
  }
};

const adminToken = await obtainAdminToken();
const adminAuth = adminToken ? { Authorization: `Bearer ${adminToken}` } : null;

/** Seed `reviewers/{uid}` out-of-band (admin bypasses the client write ban). */
const seedReviewer = (uid) => fetch(`${FS_BASE}/reviewers/${uid}`, {
  method: 'PATCH',
  headers: { ...adminAuth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { role: { stringValue: 'admin' } } })
});

/** List every `reviewRequests` doc (admin read). `[]` when unavailable. */
const listReviewRequests = async () => {
  if (!adminAuth) return [];
  try {
    const res = await fetch(`${FS_BASE}/reviewRequests?pageSize=300`, { headers: adminAuth });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents || [];
  } catch {
    return [];
  }
};

/** Read one `reviewRequests/{id}` doc (admin read). `null` when unavailable. */
const getReviewRequest = async (id) => {
  if (!adminAuth || !id) return null;
  try {
    const res = await fetch(
      `${FS_BASE}/reviewRequests/${encodeURIComponent(id)}`,
      { headers: adminAuth }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

/**
 * Poll admin REST until a review request owned by `uid` appears.
 * Returns the new doc's id, or null on timeout.
 */
const waitForRequestId = async (uid, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const docs = await listReviewRequests();
    const match = docs.find((doc) => doc.fields?.ownerUid?.stringValue === uid);
    if (match) return match.name.split('/').pop();
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
};

const signUpRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${ENV.VITE_FIREBASE_API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD, returnSecureToken: true })
  }
);
const signUpData = await signUpRes.json();
check('throwaway email/password account created via REST',
      Boolean(signUpData.idToken), signUpData.error?.message || '');

// The load-time gate shows the sign-in form; sign in through it.
await page.waitForSelector('#auth-form', { timeout: 10000 }).catch(async () => {
  // Gate may have been dismissed if a session was already restored — reopen it.
  await page.click('#auth-signin-btn');
  await page.waitForSelector('#auth-form', { timeout: 10000 });
});
await page.fill('#auth-email', E2E_EMAIL);
await page.fill('#auth-password', E2E_PASSWORD);
await page.click('#auth-form .submit-entry-btn');

const signedIn = await page.waitForSelector('.auth-user', { timeout: 15000 })
  .then(() => true).catch(() => false);
check('sign-in through the UI shows the signed-in chip', signedIn);

// --- 1c. Backend connection ---
const mode = await page.evaluate(async () => {
  // init() runs after the sign-in gate resolves; wait briefly for it to settle.
  for (let i = 0; i < 40 && window.__store.mode === 'local'; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  return window.__store.mode;
});
check('backend connected (mode === "firestore")', mode === 'firestore', `mode=${mode}`);

const seedCount = await page.evaluate(() => window.__store.getAllEntries().length);
check('seed entries loaded', seedCount >= 8, `entries=${seedCount}`);

// --- 2. Composer submit for each destination (Phase 0 fix) ---
const destinations = [
  { value: 'moon', expectTab: 'moon' },
  { value: 'shooting-star', expectTab: 'stars' },
  { value: 'earth', expectTab: 'earth' }
];

for (const dest of destinations) {
  const before = await page.evaluate(() => window.__store.getAllEntries().length);

  await page.click('#compose-fab');
  await page.fill('#reflection-text', `${MARKER} test reflection for ${dest.value}`);
  await page.check(`input[name="destination"][value="${dest.value}"]`, { force: true });
  await page.click('.submit-entry-btn');

  // The modal must close — the old code crashed here and left it stuck open.
  const closed = await page.waitForFunction(
    () => document.getElementById('modals-root').children.length === 0,
    { timeout: 5000 }
  ).then(() => true).catch(() => false);
  check(`submit "${dest.value}" closes the modal`, closed);

  const tab = await page.evaluate(() =>
    document.querySelector('.target-btn.active')?.dataset.target
  );
  check(`submit "${dest.value}" focuses tab "${dest.expectTab}"`,
        tab === dest.expectTab, `tab=${tab}`);

  const after = await page.evaluate(() => window.__store.getAllEntries().length);
  check(`submit "${dest.value}" stored an entry`, after === before + 1, `${before} -> ${after}`);
}

// --- 3. Reactions ---
await page.evaluate(() => window.__ui.showAuthorModal('entry_cairo_1'));
await page.waitForSelector('.reaction-btn', { timeout: 5000 });

const reactionResult = await page.evaluate(async () => {
  const before = document.getElementById('count-notAlone')?.textContent;
  document.querySelector('.reaction-btn[data-reaction="notAlone"]').click();
  await new Promise((r) => setTimeout(r, 800));
  const after = document.getElementById('count-notAlone')?.textContent;
  return { before: Number(before), after: Number(after) };
});
check('reaction counter increments',
      reactionResult.after === reactionResult.before + 1,
      `${reactionResult.before} -> ${reactionResult.after}`);

// --- 4. Persistence across reload ---
await page.reload({ waitUntil: 'domcontentloaded' });
const persisted = await page.evaluate(async (marker) => {
  for (let i = 0; i < 60 && window.__store.mode === 'local'; i++) {
    await new Promise((r) => setTimeout(r, 250));
  }
  // The realtime snapshot arrives AFTER `mode` flips to 'firestore', so poll for
  // the marker instead of reading once — a single read races the snapshot once
  // the database holds real data, which made this assertion flaky.
  for (let i = 0; i < 60; i++) {
    if (window.__store.getAllEntries().some((e) => e.text?.includes(marker))) {
      return { mode: window.__store.mode, found: true };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { mode: window.__store.mode, found: false };
}, MARKER);
check('backend reconnected after reload', persisted.mode === 'firestore', `mode=${persisted.mode}`);
check('entries persisted across reload', persisted.found === true);

// --- 5. Journal import: multi-day split + save as source:'import' ----------
const importBefore = await page.evaluate(() => window.__store.getAllEntries().length);

await page.click('#import-btn');
const importModalOpen = await page.waitForSelector('#import-modal-backdrop', { timeout: 8000 })
  .then(() => true).catch(() => false);
check('import modal opens', importModalOpen);

// Two day headings in DIFFERENT formats: a weekday + month-first heading, then
// an ISO heading. Each day carries a couple of sentences so the splitter has
// real material to work with (>= 2 moments total, whatever engine runs).
const journalText = [
  'Monday, Jan 5',
  'I woke before dawn and breathed slowly, feeling calm and still.',
  'Later I walked to the river and watched the light on the water.',
  '',
  '2026-01-07',
  'Today felt heavy and I was overwhelmed, but I kept going anyway.',
  'By the evening the quiet returned and I felt grateful again.'
].join('\n');

await page.fill('#import-text', journalText);
await page.click('#import-split-btn');

// Generous: the split may round-trip through Gemini before falling back.
const previewReady = await page.waitForSelector(
  '#import-preview .import-moment', { timeout: 45000 }
).then(() => true).catch(() => false);
check('import split produces editable moments', previewReady);

// The engine must be disclosed. The suite must NOT assume AI (the network may
// be unavailable), only that the label names the engine that ran.
const engine = await page.evaluate(() => {
  const el = document.getElementById('import-engine');
  return { hidden: el ? el.hidden : true, text: (el?.textContent || '').trim() };
});
check('import discloses the splitting engine (AI or fallback)',
      engine.hidden === false && engine.text.length > 0 && /ai|fallback/i.test(engine.text),
      engine.text ? `"${engine.text}"` : 'no engine label shown');

const momentShape = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#import-preview .import-moment')];
  return {
    count: rows.length,
    allEditable: rows.every((row) =>
      !!row.querySelector('.import-moment-text') &&
      !!row.querySelector('.import-moment-feeling') &&
      !!row.querySelector('.import-remove-btn'))
  };
});
check('preview has >= 2 moments, each with text + feeling + remove',
      momentShape.count >= 2 && momentShape.allEditable,
      `moments=${momentShape.count}`);

await page.click('#import-save-btn');
const importClosed = await page.waitForFunction(
  () => document.getElementById('modals-root').children.length === 0,
  { timeout: 15000 }
).then(() => true).catch(() => false);
check('import modal closes after saving', importClosed);

// The write is awaited before the modal closes, but the store cache is also
// refreshed by the realtime snapshot, so poll for the persisted import source.
const importPersisted = await page.waitForFunction(
  () => window.__store.getAllEntries().some((entry) => entry.source === 'import'),
  { timeout: 15000 }
).then(() => true).catch(() => false);
check('imported entries persist with source "import"', importPersisted);

const importAfter = await page.evaluate(() => window.__store.getAllEntries().length);
check('import grew the entry store', importAfter > importBefore, `${importBefore} -> ${importAfter}`);

// --- 6. Review request round-trip (this account is BOTH author and reviewer) -

// Precondition: the review assertions need admin REST (seed + read).
check('admin access token obtained for review seeding', Boolean(adminToken));

// Seed the reviewer role out-of-band — client writes to `reviewers` are banned.
const e2eUid = signUpData.localId;
const seedRes = adminAuth && e2eUid ? await seedReviewer(e2eUid) : null;
check('admin seeded reviewers/{uid} with role "admin"',
      Boolean(seedRes) && (seedRes.status === 200 || seedRes.status === 404),
      seedRes ? `HTTP ${seedRes.status}` : 'no admin token');

// Compose a fresh reflection WITH a review target and a short note, via the
// real composer. The note carries the marker so cleanup can also match on text.
await page.click('#compose-fab');
await page.fill('#reflection-text', `${MARKER} reflection that asks for a gentle review`);
await page.click('#review-target-selector [data-target="doctor"]');
await page.fill('#review-note', `E2E review note ${MARKER}`);
await page.click('#compose-form .submit-entry-btn');

const composeClosed = await page.waitForFunction(
  () => document.getElementById('modals-root').children.length === 0,
  { timeout: 8000 }
).then(() => true).catch(() => false);
check('compose with a review target closes the modal', composeClosed);

// The request is written after the modal closes, so poll admin REST for it.
const requestId = await waitForRequestId(e2eUid, 20000);
check('review request was created for the test owner (admin read)',
      Boolean(requestId), requestId || 'no reviewRequests doc found');

// Reload so the header re-evaluates the (now seeded) reviewer role and mounts
// the Review Queue entry point.
await page.reload({ waitUntil: 'domcontentloaded' });
const reviewerEntry = await page.waitForSelector('#review-queue-btn', { timeout: 20000 })
  .then(() => true).catch(() => false);
check('review-queue entry point appears for the seeded reviewer', reviewerEntry);

// Guarded so a missing button fails the assertion above instead of crashing the
// whole run before the error assertions below.
if (reviewerEntry) await page.click('#review-queue-btn');

const cardListed = reviewerEntry
  ? await page.waitForSelector(
      `#review-list [data-request-id="${requestId}"]`, { timeout: 15000 }
    ).then(() => true).catch(() => false)
  : false;
check('queued request card is listed for the reviewer', cardListed);

if (cardListed) {
  const replyText = `E2E private reply ${MARKER}`;
  await page.fill(`#review-list [data-request-id="${requestId}"] .review-reply-input`, replyText);
  await page.click(`#review-list [data-request-id="${requestId}"] .review-resolve-btn`);
}

// The card is removed on success; confirm the document itself flipped state.
let resolvedDoc = null;
for (let attempt = 0; attempt < 30; attempt++) {
  resolvedDoc = await getReviewRequest(requestId);
  if (resolvedDoc?.fields?.status?.stringValue === 'resolved') break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
check('resolving the request updates status to "resolved" (admin read)',
      resolvedDoc?.fields?.status?.stringValue === 'resolved',
      resolvedDoc?.fields?.status?.stringValue || 'still open');
check('reviewer reply was stored on the request',
      (resolvedDoc?.fields?.response?.stringValue || '').includes('E2E private reply'),
      resolvedDoc?.fields?.response?.stringValue || 'no response stored');

// Close the queue so the later auth checks click the header unobstructed.
if (await page.$('#review-close-btn')) {
  await page.click('#review-close-btn');
  await page.waitForFunction(
    () => document.getElementById('modals-root').children.length === 0,
    { timeout: 5000 }
  ).catch(() => {});
}

// --- 7. Auth UI ---
// We signed up earlier, so a registered session is expected after the reload.
const authUi = await page.evaluate(() => ({
  controls: !!document.getElementById('auth-controls'),
  signedInChip: !!document.querySelector('.auth-user'),
  signOutBtn: !!document.getElementById('auth-signout-btn')
}));
check('auth controls rendered', authUi.controls);
check('registered session shows the signed-in chip', authUi.signedInChip && authUi.signOutBtn);

// Signing out must present the sign-in gate again — there is no anonymous
// fallback session keeping the app connected.
await page.click('#auth-signout-btn');
const signOutGate = await page.waitForFunction(
  () => !!document.getElementById('auth-form') && !!document.getElementById('auth-email'),
  { timeout: 10000 }
).then(() => true).catch(() => false);
check('sign-out presents the sign-in gate', signOutGate);

await page.waitForSelector('#auth-form', { timeout: 5000 });

const formSignIn = await page.evaluate(() => ({
  email: !!document.getElementById('auth-email'),
  password: !!document.getElementById('auth-password'),
  name: !!document.getElementById('auth-name'),
  google: !!document.getElementById('google-signin-btn'),
  error: !!document.getElementById('auth-error'),
  submit: document.querySelector('#auth-form .submit-entry-btn span')?.textContent?.trim()
}));
check('sign-in form has email + password + Google + error slot',
      formSignIn.email && formSignIn.password && formSignIn.google &&
      formSignIn.error && formSignIn.submit === 'Sign In');

// "Forgot password?" must be offered to email users...
const forgotPresent = await page.evaluate(() => {
  const btn = document.getElementById('forgot-password-btn');
  return {
    exists: !!btn,
    row: !!document.querySelector('.auth-forgot-row'),
    label: (btn?.textContent || '').trim()
  };
});
check('sign-in form offers a "Forgot password?" link',
      forgotPresent.exists && forgotPresent.row && /forgot password/i.test(forgotPresent.label));

// ...and asking for one with no address typed must explain itself.
await page.click('#forgot-password-btn');
await page.waitForTimeout(600);
const forgotEmpty = await page.evaluate(
  () => (document.getElementById('auth-error')?.textContent || '').trim()
);
check('forgot password with no email asks for the address first',
      /enter your email/i.test(forgotEmpty), forgotEmpty);

// Wrong password must show a friendly error, not crash.
// (Run this while still in sign-in mode — a random email in sign-up mode
//  would actually create an account.)
await page.fill('#auth-email', `nosuchuser-${Date.now()}@example.com`);
await page.fill('#auth-password', 'wrong-password-123');
await page.click('#auth-form .submit-entry-btn');
const authErrorShown = await page.waitForFunction(
  () => (document.getElementById('auth-error')?.textContent || '').trim().length > 0,
  { timeout: 8000 }
).then(() => true).catch(() => false);
check('bad credentials show a friendly error', authErrorShown);

// The unknown address is still in the field. Requesting a reset for it must NOT
// reveal that no such account exists (otherwise the form becomes an email probe).
await page.click('#forgot-password-btn');
const forgotNeutral = await page.waitForFunction(
  () => (document.getElementById('auth-error')?.textContent || '').trim().length > 0,
  { timeout: 10000 }
).then(() => true).catch(() => false);
const forgotMessage = await page.evaluate(
  () => (document.getElementById('auth-error')?.textContent || '').trim()
);
check('forgot password never reveals whether an account exists',
      forgotNeutral && !/no account found|incorrect email/i.test(forgotMessage || ''),
      forgotMessage || 'no message shown');

// Toggle to sign-up
await page.click('#auth-mode-toggle');
const formSignUp = await page.evaluate(() => ({
  name: !!document.getElementById('auth-name'),
  submit: document.querySelector('#auth-form .submit-entry-btn span')?.textContent?.trim()
}));
check('sign-up mode adds display-name field + "Create Account"',
      formSignUp.name && formSignUp.submit === 'Create Account');

// A password reset only makes sense for an existing account, so the link is
// sign-in only.
const forgotInSignUp = await page.evaluate(() => !!document.getElementById('forgot-password-btn'));
check('sign-up mode hides the "Forgot password?" link', !forgotInSignUp);

await page.click('#auth-close-btn');
const authClosed = await page.waitForFunction(
  () => document.getElementById('modals-root').children.length === 0,
  { timeout: 5000 }
).then(() => true).catch(() => false);
check('auth modal closes', authClosed);

// --- 8. Error assertions ---
check('no uncaught page errors', pageErrors.length === 0,
      pageErrors.length ? pageErrors[0] : '');
check('no console errors', consoleErrors.length === 0,
      consoleErrors.length ? consoleErrors[0] : '');

if (consoleErrors.length || pageErrors.length) {
  console.log('\n--- all captured errors ---');
  [...pageErrors, ...consoleErrors].forEach((e) => console.log(' •', e));
}

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
