// One-off cleanup: removes synthetic E2E test entries from Firestore and
// restores any reaction counter the E2E suite incremented.
// Run with: node scripts/cleanup-e2e.mjs

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'the-globe-diary';
const ENTRIES = 'entries';

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

const final = await (await fetch(api, { headers: auth })).json();
console.log(`\n${deleted} synthetic entr(y/ies) removed. Database now holds ${(final.documents || []).length} entries.`);
