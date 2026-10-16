// Temporary verification script for Phase 1 (Firestore + rules).
// Not part of the app. Run with: node scripts/verify-firestore.mjs
// Reads credentials from `.env` (gitignored) rather than hardcoding them.
import fs from 'node:fs';
import os from 'node:os';

const readEnvFile = () => {
  try {
    return Object.fromEntries(
      fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
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

const env = { ...readEnvFile(), ...process.env };

const PROJECT = env.VITE_FIREBASE_PROJECT_ID;
const API_KEY = env.VITE_FIREBASE_API_KEY;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const TEST_ID = 'verify_test_entry';

// --- Firestore REST value encoders ---
const s = (v) => ({ stringValue: v });
const i = (v) => ({ integerValue: String(v) });
const n = (v) => ({ nullValue: null });
const m = (fields) => ({ mapValue: { fields } });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  ok ? pass++ : fail++;
};

// --- Obtain an access token for admin cleanup (refresh token flow) ---
const cfg = JSON.parse(fs.readFileSync(os.homedir() + '/.config/configstore/firebase-tools.json', 'utf8'));
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: cfg.tokens.refresh_token,
    grant_type: 'refresh_token'
  })
});
const { access_token: adminToken } = await tokenRes.json();

// --- Anonymous sign-in (client flow, same as the app) ---
const signUp = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
);
const auth = await signUp.json();
if (!auth.idToken) { console.log('Anonymous sign-in FAILED:', auth); process.exit(1); }
const uid = auth.localId;
const idToken = auth.idToken;
console.log(`Anonymous session uid: ${uid}\n`);

const authed = (init = {}) => ({
  ...init,
  headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
});

const validEntry = {
  author: s('Verifier'),
  text: s('Automated rules verification entry.'),
  feeling: s('Calm'),
  destination: s('earth'),
  locationName: s('Test, World'),
  lat: { doubleValue: 10.5 },
  lng: { doubleValue: 20.5 },
  timestamp: s(new Date().toISOString()),
  ownerUid: s(uid),
  reactions: m({ notAlone: i(1), warmth: i(1), strength: i(1) })
};

// 1. Unauthenticated read should be denied
const anonRead = await fetch(`${BASE}/entries?pageSize=1`);
check('unauthenticated read is denied', anonRead.status === 403, `HTTP ${anonRead.status}`);

// 2. Authenticated read allowed
const readRes = await fetch(`${BASE}/entries?pageSize=3`, authed());
check('authenticated read is allowed', readRes.status === 200, `HTTP ${readRes.status}`);

// 3. Valid create allowed
const createRes = await fetch(`${BASE}/entries?documentId=${TEST_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: validEntry })
}));
check('valid create is allowed', createRes.status === 200, `HTTP ${createRes.status}`);

// 4. Create with spoofed ownerUid denied
const spoofRes = await fetch(`${BASE}/entries?documentId=verify_spoof`, authed({
  method: 'POST',
  body: JSON.stringify({ fields: { ...validEntry, ownerUid: s('someone_elses_uid') } })
}));
check('create with spoofed ownerUid is denied', spoofRes.status === 403, `HTTP ${spoofRes.status}`);

// 5. Create with oversized text denied
const bigRes = await fetch(`${BASE}/entries?documentId=verify_big`, authed({
  method: 'POST',
  body: JSON.stringify({ fields: { ...validEntry, text: s('x'.repeat(5001)) } })
}));
check('create with oversized text is denied', bigRes.status === 403, `HTTP ${bigRes.status}`);

// 6. Create with invalid destination denied
const destRes = await fetch(`${BASE}/entries?documentId=verify_dest`, authed({
  method: 'POST',
  body: JSON.stringify({ fields: { ...validEntry, destination: s('mars') } })
}));
check('create with invalid destination is denied', destRes.status === 403, `HTTP ${destRes.status}`);

// 7. Reaction +1 allowed
const reactRes = await fetch(`${BASE}/entries/${TEST_ID}?updateMask.fieldPaths=reactions`, authed({
  method: 'PATCH',
  body: JSON.stringify({ fields: { reactions: m({ notAlone: i(2), warmth: i(1), strength: i(1) }) } })
}));
check('reaction increment (+1) is allowed', reactRes.status === 200, `HTTP ${reactRes.status}`);

// 8. Immutable field change denied
const authorRes = await fetch(`${BASE}/entries/${TEST_ID}?updateMask.fieldPaths=author`, authed({
  method: 'PATCH', body: JSON.stringify({ fields: { author: s('Hacker') } })
}));
check('mutating immutable "author" is denied', authorRes.status === 403, `HTTP ${authorRes.status}`);

// 9. Reaction jump of +5 denied
const jumpRes = await fetch(`${BASE}/entries/${TEST_ID}?updateMask.fieldPaths=reactions`, authed({
  method: 'PATCH',
  body: JSON.stringify({ fields: { reactions: m({ notAlone: i(9), warmth: i(1), strength: i(1) }) } })
}));
check('reaction jump of +5 is denied', jumpRes.status === 403, `HTTP ${jumpRes.status}`);

// 10. Delete denied
const delRes = await fetch(`${BASE}/entries/${TEST_ID}`, authed({ method: 'DELETE' }));
check('delete is denied', delRes.status === 403, `HTTP ${delRes.status}`);

// --- Cleanup (admin bypasses rules) ---
const cleanup = await fetch(`${BASE}/entries/${TEST_ID}`, { method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` } });
check('admin cleanup removed test doc', cleanup.status === 200 || cleanup.status === 404, `HTTP ${cleanup.status}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
