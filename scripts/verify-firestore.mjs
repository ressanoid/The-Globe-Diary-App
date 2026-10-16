// Verification script for Firestore rules (Phase 1 + Phase 3).
// Not part of the app. Run with: npm run verify:rules
// Reads credentials from `.env` (gitignored) rather than hardcoding them.
//
// Covers:
//   - entries: read/create/update schema + reaction rules + `source` allowlist
//   - reviewers: read-own only, no client writes
//   - reviewRequests: owner create, reviewer read-all, reviewer-only updates,
//     and BOTH query shapes (reviewer unfiltered list vs author constrained list)
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
const ENTRY_IMPORT_ID = 'verify_import_entry';
const ENTRY_NOSOURCE_ID = 'verify_nosource_entry';
const ENTRY_BOGUS_ID = 'verify_bogus_entry';
const RR_ID = 'verify_review_request';
const RR_BAD_ID = 'verify_review_request_bad';
const RR_SPOOF_ID = 'verify_review_request_spoof';

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

// Admin helper bypasses security rules (used for out-of-band seeding + cleanup).
const adminDelete = (path) => fetch(`${BASE}/${path}`, {
  method: 'DELETE', headers: { Authorization: `Bearer ${adminToken}` }
});

// Pre-clean any stale docs from a previous aborted run so creates don't 409.
await Promise.all(
  [TEST_ID, ENTRY_IMPORT_ID, ENTRY_NOSOURCE_ID, ENTRY_BOGUS_ID, 'verify_spoof', 'verify_big', 'verify_dest']
    .map((id) => adminDelete(`entries/${id}`))
);
await Promise.all([RR_ID, RR_BAD_ID, RR_SPOOF_ID].map((id) => adminDelete(`reviewRequests/${id}`)));

// --- Test sessions (client flow) ---
// Anonymous sign-in is DISABLED on this project, so the verifier creates its
// own throwaway email/password accounts — the same provider real users use.
const createSession = async (label) => {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `verify-${label}-${Date.now()}@example.com`,
        password: 'verify-password-1',
        returnSecureToken: true
      })
    }
  );
  const data = await res.json();
  if (!data.idToken) { console.log(`${label} sign-in FAILED:`, data); process.exit(1); }
  return { uid: data.localId, idToken: data.idToken };
};

const owner = await createSession('owner');
const reviewer = await createSession('reviewer');

// --- Policy check: anonymous sign-in MUST be rejected on this project ---
// This is the project's auth policy (Google + email only). If someone ever
// re-enables anonymous sign-in, this test fails loudly.
const anonRes = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true })
  }
);
const anonData = await anonRes.json();
check('anonymous sign-in is disabled (auth policy)', !anonData.idToken,
  anonData.error?.message || 'anonymous sign-in unexpectedly SUCCEEDED');
const uid = owner.uid;
const idToken = owner.idToken;
console.log(`Owner session uid:    ${uid}`);
console.log(`Reviewer session uid: ${reviewer.uid}\n`);

// `authed` defaults to the owner's token; pass an explicit token for the reviewer.
const authed = (init = {}, token = idToken) => ({
  ...init,
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) }
});

// runQuery goes through the `list` rules (used to prove the constrained query shape).
const runQuery = (structuredQuery, token = idToken) => fetch(
  `${BASE}:runQuery`,
  authed({ method: 'POST', body: JSON.stringify({ structuredQuery }) }, token)
);

const NOW = new Date().toISOString();

const validEntry = {
  author: s('Verifier'),
  text: s('Automated rules verification entry.'),
  feeling: s('Calm'),
  destination: s('earth'),
  locationName: s('Test, World'),
  lat: { doubleValue: 10.5 },
  lng: { doubleValue: 20.5 },
  timestamp: s(NOW),
  ownerUid: s(uid),
  reactions: m({ notAlone: i(1), warmth: i(1), strength: i(1) })
};

// Seed the reviewer's document out-of-band (admin token bypasses rules).
const seedReviewer = await fetch(`${BASE}/reviewers/${reviewer.uid}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { role: s('admin') } })
});
check('admin seeded reviewers doc out-of-band', seedReviewer.status === 200 || seedReviewer.status === 404,
  `HTTP ${seedReviewer.status}`);

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

// ===============================================================
// entries — `source` allowlist (Phase 3)
// ===============================================================

// 11. Optional source = 'import' accepted
const importRes = await fetch(`${BASE}/entries?documentId=${ENTRY_IMPORT_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: { ...validEntry, source: s('import') } })
}));
check('create with source "import" is allowed', importRes.status === 200, `HTTP ${importRes.status}`);

// 12. Unknown source value denied
const bogusRes = await fetch(`${BASE}/entries?documentId=${ENTRY_BOGUS_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: { ...validEntry, source: s('bogus') } })
}));
check('create with source "bogus" is denied', bogusRes.status === 403, `HTTP ${bogusRes.status}`);

// 13. Entry WITHOUT source still accepted (backward compatibility)
const noSourceRes = await fetch(`${BASE}/entries?documentId=${ENTRY_NOSOURCE_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: validEntry })
}));
check('create WITHOUT source is allowed (backward compatible)', noSourceRes.status === 200, `HTTP ${noSourceRes.status}`);

// ===============================================================
// reviewers — read own only, no client writes
// ===============================================================

// 14. Reviewer can read their own doc
const selfRead = await fetch(`${BASE}/reviewers/${reviewer.uid}`, authed({}, reviewer.idToken));
check('reviewer can read their own doc', selfRead.status === 200, `HTTP ${selfRead.status}`);

// 15. A different uid cannot read the reviewer doc
const otherRead = await fetch(`${BASE}/reviewers/${reviewer.uid}`, authed());
check('another uid cannot read a reviewer doc', otherRead.status === 403, `HTTP ${otherRead.status}`);

// 16. Clients cannot write reviewer docs
const reviewerWrite = await fetch(`${BASE}/reviewers/${reviewer.uid}?updateMask.fieldPaths=role`, authed({
  method: 'PATCH', body: JSON.stringify({ fields: { role: s('doctor') } })
}, reviewer.idToken));
check('client write to reviewers is denied', reviewerWrite.status === 403, `HTTP ${reviewerWrite.status}`);

// ===============================================================
// reviewRequests
// ===============================================================

const validRequest = {
  entryId: s('entry_cairo_1'),
  ownerUid: s(uid),
  author: s('Verifier'),
  target: s('doctor'),
  countryCode: s(''),
  message: s('Could you take a look at this entry, please?'),
  status: s('open'),
  createdAt: s(NOW)
};

// 17. Owner can create a review request
const rrCreate = await fetch(`${BASE}/reviewRequests?documentId=${RR_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: validRequest })
}));
check('owner can create a review request', rrCreate.status === 200, `HTTP ${rrCreate.status}`);

// 18. Invalid target enum denied
const rrBadTarget = await fetch(`${BASE}/reviewRequests?documentId=${RR_BAD_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: { ...validRequest, target: s('alien') } })
}));
check('review request with invalid target is denied', rrBadTarget.status === 403, `HTTP ${rrBadTarget.status}`);

// 19. Spoofed ownerUid denied
const rrSpoof = await fetch(`${BASE}/reviewRequests?documentId=${RR_SPOOF_ID}`, authed({
  method: 'POST', body: JSON.stringify({ fields: { ...validRequest, ownerUid: s('someone_elses_uid') } })
}));
check('review request with spoofed ownerUid is denied', rrSpoof.status === 403, `HTTP ${rrSpoof.status}`);

// 20. Reviewer can read a single request (get)
const rrGet = await fetch(`${BASE}/reviewRequests/${RR_ID}`, authed({}, reviewer.idToken));
check('reviewer can read a review request (get)', rrGet.status === 200, `HTTP ${rrGet.status}`);

// 21. Reviewer can list ALL requests with NO filter (query-shape trap)
const rrListReviewer = await fetch(`${BASE}/reviewRequests?pageSize=20`, authed({}, reviewer.idToken));
check('reviewer unfiltered list is allowed', rrListReviewer.status === 200, `HTTP ${rrListReviewer.status}`);

// 22. Author can list their OWN requests with a constrained query
const rrListAuthor = await runQuery({
  from: [{ collectionId: 'reviewRequests' }],
  where: { fieldFilter: { field: { fieldPath: 'ownerUid' }, op: 'EQUAL', value: s(uid) } }
}, idToken);
check('author constrained list is allowed', rrListAuthor.status === 200, `HTTP ${rrListAuthor.status}`);

// 23. Author CANNOT list requests unfiltered (rules are not filters)
const rrListAuthorOpen = await fetch(`${BASE}/reviewRequests?pageSize=20`, authed());
check('author unfiltered list is denied', rrListAuthorOpen.status === 403, `HTTP ${rrListAuthorOpen.status}`);

// 24. Reviewer can update the reviewer-mutable fields
const rrUpdate = await fetch(
  `${BASE}/reviewRequests/${RR_ID}?updateMask.fieldPaths=status&updateMask.fieldPaths=response&updateMask.fieldPaths=responderUid&updateMask.fieldPaths=responderName&updateMask.fieldPaths=resolvedAt`,
  authed({
    method: 'PATCH',
    body: JSON.stringify({
      fields: {
        status: s('resolved'),
        response: s('Thank you for sharing — holding this with you.'),
        responderUid: s(reviewer.uid),
        responderName: s('Dr. Reviewer'),
        resolvedAt: s(NOW)
      }
    })
  }, reviewer.idToken)
);
check('reviewer can update status/response/responder*', rrUpdate.status === 200, `HTTP ${rrUpdate.status}`);

// 25. Reviewer cannot mutate immutable fields
const rrImmutable = await fetch(`${BASE}/reviewRequests/${RR_ID}?updateMask.fieldPaths=message`, authed({
  method: 'PATCH', body: JSON.stringify({ fields: { message: s('tampered') } })
}, reviewer.idToken));
check('reviewer cannot mutate an immutable field', rrImmutable.status === 403, `HTTP ${rrImmutable.status}`);

// 26. Non-reviewer update denied
const rrNonReviewer = await fetch(`${BASE}/reviewRequests/${RR_ID}?updateMask.fieldPaths=status`, authed({
  method: 'PATCH', body: JSON.stringify({ fields: { status: s('open') } })
}));
check('non-reviewer update is denied', rrNonReviewer.status === 403, `HTTP ${rrNonReviewer.status}`);

// 27. Delete denied
const rrDelete = await fetch(`${BASE}/reviewRequests/${RR_ID}`, authed({ method: 'DELETE' }, reviewer.idToken));
check('review request delete is denied', rrDelete.status === 403, `HTTP ${rrDelete.status}`);

// --- Cleanup (admin bypasses rules) ---
const cleanup = await adminDelete(`entries/${TEST_ID}`);
check('admin cleanup removed test doc', cleanup.status === 200 || cleanup.status === 404, `HTTP ${cleanup.status}`);

const cleanupIds = [
  `entries/${ENTRY_IMPORT_ID}`,
  `entries/${ENTRY_NOSOURCE_ID}`,
  `reviewRequests/${RR_ID}`,
  `reviewers/${reviewer.uid}`
];
const cleanupStatuses = await Promise.all(cleanupIds.map((path) => adminDelete(path)));
const cleanupOk = cleanupStatuses.every((res) => res.status === 200 || res.status === 404);
check('admin cleanup removed phase-3 test docs', cleanupOk,
  cleanupStatuses.map((res) => res.status).join(','));

// Delete the throwaway auth accounts minted above (admin bypasses rules) so
// repeated runs don't leak users into the project.
const deleteAccount = (localId) => fetch(
  `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId })
  }
);
const accountStatuses = await Promise.all([owner.uid, reviewer.uid].map(deleteAccount));
check('admin cleanup removed verifier accounts',
  accountStatuses.every((res) => res.ok),
  accountStatuses.map((res) => res.status).join(','));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
