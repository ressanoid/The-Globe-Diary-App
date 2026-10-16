// Runtime probe for src/ai.js — verifies the pure heuristic engine AND a live
// Gemini call through the real SDK (not curl), inside the browser.
//
// Loads the Vite dev server so modules are transformed exactly as in the app.
// Run with: node scripts/probe-ai.mjs   (expects `npm run dev` on :5173)

import { chromium } from 'playwright';

const APP_URL = process.env.E2E_URL || 'http://localhost:5173/';
const ORIGIN = new URL(APP_URL).origin;

const SAMPLE = `Woke up at 6 and actually got out of bed on the first alarm, which never happens.
Made coffee and sat by the window watching the rain for a while.

Work was rough. My manager dumped three deadlines on me and I felt my chest tighten.
At lunch I called my sister and we laughed about old family stories, that helped a lot.

Evening was quiet, read two chapters and felt genuinely calm for the first time this week.`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();

const logs = [];
page.on('console', (msg) => logs.push(`${msg.type()}: ${msg.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e}`));

// Wait for the app to boot and settle, retrying around Vite HMR reloads.
const runProbe = async () => {
  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => window.__store && window.__store.mode === 'firestore',
    { timeout: 30000 }
  ).catch(() => {});
  // Let any in-flight HMR reload finish before evaluating.
  await page.waitForLoadState('load').catch(() => {});

  return page.evaluate(async ({ sample, origin }) => {
    // page.evaluate runs inside an `eval` scope, so bare/root-relative module
    // specifiers cannot be resolved — build absolute URLs against the origin,
    // which is passed in explicitly rather than read from `location`.
    const abs = (path) => `${origin}${path}`;
    const ai = await import(abs('/src/ai.js'));
    const { auth } = await import(abs('/src/firebase.js'));

    const t0 = performance.now();
    const h1 = ai.heuristicSplit(sample);
    const h2 = ai.heuristicSplit(sample);
    const live = await ai.splitDay(sample);

    return {
      signedIn: Boolean(auth?.currentUser),
      uidPrefix: auth?.currentUser?.uid?.slice(0, 8) || null,
      isAiAvailable: ai.isAiAvailable(),
      heuristic: {
        count: h1.length,
        deterministic: JSON.stringify(h1) === JSON.stringify(h2),
        feelings: h1.map((m) => m.feeling),
        timeHints: h1.map((m) => m.timeHint),
        first: h1[0],
        emptyInput: ai.heuristicSplit('')
      },
      live: {
        success: live.success,
        source: live.source,
        count: live.moments.length,
        feelings: live.moments.map((m) => m.feeling),
        timeHints: live.moments.map((m) => m.timeHint),
        first: live.moments[0]
      },
      ms: Math.round(performance.now() - t0)
    };
  }, { sample: SAMPLE, origin: ORIGIN });
};

let result;
try {
  result = await runProbe();
} catch (error) {
  // One retry: HMR may have navigated the page mid-evaluate.
  await page.reload({ waitUntil: 'load' }).catch(() => {});
  result = await runProbe();
}

console.log(JSON.stringify(result, null, 2));

const problems = logs.filter((l) => /warn|error/i.test(l) && !/favicon|ERR_|Failed to load/i.test(l));
if (problems.length) {
  console.log('\n--- console warnings/errors during probe ---');
  problems.forEach((l) => console.log(' •', l));
}

await browser.close();
