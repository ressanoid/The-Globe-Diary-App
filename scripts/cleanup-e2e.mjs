// One-off cleanup: removes synthetic E2E test entries from Firestore, restores
// any reaction counter the E2E suite incremented, deletes the seeded
// `reviewers/{uid}` docs and the `reviewRequests` rows the review round-trip
// creates, and deletes the throwaway email/password AUTH accounts the E2E suite
// and rules verifier mint.
// Run with: node scripts/cleanup-e2e.mjs

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'the-globe-diary';
const ENTRIES = 'entries';
const REVIEW_REQUESTS = 'reviewRequests';
const REVIEWERS = 'reviewers';
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const tokenPath = `${homedir()}/.config/configstore/firebase-tools.json`;
const refreshToken = JSON.parse(readFileSync(tokenPath, 'utf8')).tokens?.refresh_token;
if (!refreshToken) throw new Error('No refresh token found in firebase-tools config');

const clientId = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const clientSecret = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
});
const { access_token: accessToken } = await tokenRes.json();
if (!accessToken) throw new Error('Failed to obtain access token');

const api = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/${ENTRIES}`;
const auth = { Authorization: `Bearer ${accessToken}` };

// 1. Delete every entry whose text carries the E2E marker.
const list = await (await fetch(api, { headers: auth })).json();
const synthetic = (list.documents || []).filter((d) =>
  (d.fields?.text?.stringValue || '').includes('E2E-')
);

let deleted = 0;
for (const doc of synthetic) {
  const id = doc.name.split('/').pop();
  const res = await fetch(`${api}/${id}`, { method: 'DELETE', headers: auth });
  if (res.ok) { console.log(`🗑  deleted ${id}`); deleted++; }
  else console.log(`⚠️  could not delete ${id}: HTTP ${res.status}`);
}

// 2. Restore the reaction counter the suite bumps (notAlone on entry_cairo_1).
const cairo = await (await fetch(`${api}/entry_cairo_1`, { headers: auth })).json();
const before = cairo.fields?.reactions?.mapValue?.fields?.notAlone?.integerValue;
if (before && Number(before) !== 14) {
  await fetch(`${api}/entry_cairo_1?currentDocument.exists=entries%2Fentry_cairo_1`, {
    method: 'PATCH',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        reactions: {
          mapValue: {
            fields: {
              notAlone: { integerValue: '14' },
              warmth: cairo.fields.reactions.mapValue.fields.warmth,
              strength: cairo.fields.reactions.mapValue.fields.strength
            }
          }
        }
      }
    })
  });
  console.log(`↩️  entry_cairo_1.notAlone ${before} -> 14`);
}

// 3. Delete throwaway test AUTH accounts. The E2E suite and the rules verifier
//    create real email/password accounts; they must not accumulate. Legacy
//    anonymous users (from before the policy change) are deliberately spared.
const TEST_EMAIL = /^(e2e|apikey-probe|ui-probe-tmp)-\d+@example\.com$|^verify-(owner|reviewer)-\d+@example\.com$/;

const listUsers = async () => {
  const users = [];
  let pageToken = '';
  do {
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchGet`
      + `?maxResults=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) break;
    const data = await res.json();
    users.push(...(data.users || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return users;
};

const stemmed = (await listUsers()).filter((u) => TEST_EMAIL.test(u.email || ''));

// 3b. Remove the Phase-3 reviewer / reviewRequest footprint, plus any imported
//     entries this suite created. Imported moments do NOT carry the 'E2E-' text
//     marker (their text is the user's own journal), so they are matched by
//     `ownerUid` against the throwaway accounts discovered just above.
//     Reviewer docs and reviewRequests are admin-only to write, so this uses
//     the same admin token; deleting a missing doc returns 404 and is fine.
const e2eUids = stemmed.map((u) => u.localId).filter(Boolean);
const e2eUidSet = new Set(e2eUids);

let reviewersDeleted = 0;
for (const uid of e2eUids) {
  const res = await fetch(`${DOCS}/${REVIEWERS}/${uid}`, { method: 'DELETE', headers: auth });
  if (res.ok) { console.log(`🗑  deleted ${REVIEWERS}/${uid}`); reviewersDeleted++; }
  else if (res.status !== 404) console.log(`⚠️  could not delete ${REVIEWERS}/${uid}: HTTP ${res.status}`);
}

const requestList = await (await fetch(`${DOCS}/${REVIEW_REQUESTS}?pageSize=300`, { headers: auth })).json();
const syntheticRequests = (requestList.documents || []).filter((d) => {
  const owner = d.fields?.ownerUid?.stringValue;
  const message = d.fields?.message?.stringValue || '';
  return e2eUidSet.has(owner) || message.includes('E2E-');
});

let requestsDeleted = 0;
for (const doc of syntheticRequests) {
  const id = doc.name.split('/').pop();
  const res = await fetch(`${DOCS}/${REVIEW_REQUESTS}/${id}`, { method: 'DELETE', headers: auth });
  if (res.ok) { console.log(`🗑  deleted ${REVIEW_REQUESTS}/${id}`); requestsDeleted++; }
  else console.log(`⚠️  could not delete ${REVIEW_REQUESTS}/${id}: HTTP ${res.status}`);
}

const entryList = await (await fetch(api, { headers: auth })).json();
const syntheticImports = (entryList.documents || []).filter((d) =>
  d.fields?.source?.stringValue === 'import'
  && e2eUidSet.has(d.fields?.ownerUid?.stringValue)
);

let importsDeleted = 0;
for (const doc of syntheticImports) {
  const id = doc.name.split('/').pop();
  const res = await fetch(`${api}/${id}`, { method: 'DELETE', headers: auth });
  if (res.ok) { console.log(`🗑  deleted imported entry ${id}`); importsDeleted++; }
  else console.log(`⚠️  could not delete imported entry ${id}: HTTP ${res.status}`);
}

let accountsDeleted = 0;
for (const user of stemmed) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:delete`,
    {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ localId: user.localId })
    }
  );
  if (res.ok) { console.log(`🗑  deleted auth account ${user.email}`); accountsDeleted++; }
  else console.log(`⚠️  could not delete account ${user.email}: HTTP ${res.status}`);
}

const final = await (await fetch(api, { headers: auth })).json();
console.log(`\n${deleted} synthetic entr(y/ies) removed`
  + ` (+${importsDeleted} imported), `
  + `${requestsDeleted} reviewRequest(s), ${reviewersDeleted} reviewer doc(s), `
  + `${accountsDeleted} test account(s) removed.`
  + ` Database now holds ${(final.documents || []).length} entries.`);
