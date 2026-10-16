// Enables the APIs that Firebase AI Logic needs for the Gemini Developer API
// backend. Equivalent effect of `firebase init ailogic`, which cannot run
// non-interactively (it requires selecting the Firebase app in a prompt).
// Run with: node scripts/enable-ai-logic.mjs

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'the-globe-diary';
const APIS = [
  'generativelanguage.googleapis.com', // Gemini Developer API (AI Logic default backend)
  'firebasevertexai.googleapis.com'    // Firebase AI Logic service surface
];

const tokenPath = `${homedir()}/.config/configstore/firebase-tools.json`;
const refreshToken = JSON.parse(readFileSync(tokenPath, 'utf8'))?.tokens?.refresh_token;
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
const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

const ops = `https://serviceusage.googleapis.com/v1/projects/${PROJECT}/services`;

// Report current state first.
const list = await (await fetch(`${ops}?pageSize=200`, { headers: auth })).json();
for (const api of APIS) {
  const svc = (list.services || []).find((s) => s.config?.name === api);
  console.log(`${api}: ${svc ? svc.state : 'NOT ENABLED'}`);
}

// Enable anything that is not already enabled.
for (const api of APIS) {
  const svc = (list.services || []).find((s) => s.config?.name === api);
  if (svc?.state === 'ENABLED') { console.log(`↩️  ${api} already enabled`); continue; }

  const res = await fetch(`${ops}/${api}:enable`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({})
  });
  if (res.ok) {
    console.log(`✅ enable requested for ${api} (operation may take a moment)`);
  } else {
    console.log(`⚠️  ${api}: HTTP ${res.status} — ${await res.text()}`);
  }
}
