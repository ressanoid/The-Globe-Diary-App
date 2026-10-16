// End-to-end smoke test for The Globe Diary.
// Run with: node scripts/e2e.mjs   (expects `npm run dev` on :5173)
//
// Verifies:
//   1. App boots with NO console/page errors
//   2. Backend connects (store mode === 'firestore')
//   3. Phase 0 fix: Moon / Shooting Star / Earth submits all close the modal
//      and move focus (the old code threw `zoomToMoon is not a function`)
//   4. Reactions increment
//   5. Entries persist across a page reload (Firestore persistence)

import { chromium } from 'playwright';

const URL = process.env.E2E_URL || 'http://localhost:5173/';
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
await page.goto(URL, { waitUntil: 'domcontentloaded' });

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

const mode = await page.evaluate(async () => {
  // init() runs after mount; wait briefly for it to settle.
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
  return {
    mode: window.__store.mode,
    found: window.__store.getAllEntries().some((e) => e.text?.includes(marker))
  };
}, MARKER);
check('backend reconnected after reload', persisted.mode === 'firestore', `mode=${persisted.mode}`);
check('entries persisted across reload', persisted.found === true);

// --- 5. Error assertions ---
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
