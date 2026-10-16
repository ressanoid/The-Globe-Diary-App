// Replicates `firebase init ailogic` non-interactively.
//
// `init ailogic` cannot run non-interactively because it prompts to select a
// Firebase app. Under the hood it calls:
//
//   POST https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp
//   { appNamespace, displayName, parent, firebaseAiLogicInput: {}, webInput: {} }
//
// which creates the AI Logic "genai config" for the app. Enabling the Cloud
// APIs alone is NOT enough — without this config every generateContent call
// fails with:
//   FAILED_PRECONDITION: "Firebase AI Logic genai config not found"
//
// Run with: node scripts/provision-ai-logic.mjs

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'the-globe-diary';
const APP_NAMESPACE = '1:1066564295032:web:01aa691f97621ed9e5d08d';
const DISPLAY_NAME = 'The Globe Diary Web';

const tokenPath = `${homedir()}/.config/configstore/firebase-tools.json`;
const refreshToken = JSON.parse(readFileSync(tokenPath, 'utf8'))?.tokens?.refresh_token;
if (!refreshToken) throw new Error('No refresh token found in firebase-tools config');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })
});
const { access_token: accessToken } = await tokenRes.json();
if (!accessToken) throw new Error('Failed to obtain access token');
const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

console.log('Provisioning Firebase AI Logic for the app...');

const res = await fetch('https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    appNamespace: APP_NAMESPACE,
    displayName: DISPLAY_NAME,
    parent: `projects/${PROJECT}`,
    firebaseAiLogicInput: {},
    webInput: {}
  })
});

const body = await res.json();
if (!res.ok) {
  console.log(`HTTP ${res.status}: ${JSON.stringify(body, null, 2)}`);
  process.exit(1);
}

const opName = body.name;
console.log(`Operation started: ${opName}`);

// Poll to completion.
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const poll = await (await fetch(`https://firebase.googleapis.com/v1beta1/${opName}`, { headers: auth })).json();

  if (poll.done) {
    if (poll.error) {
      console.log(`❌ Provisioning failed: ${JSON.stringify(poll.error, null, 2)}`);
      process.exit(1);
    }
    console.log('✅ AI Logic provisioned.');
    const configData = poll.response?.configData;
    if (configData) {
      console.log('\n--- returned client config ---');
      console.log(Buffer.from(configData, 'base64').toString('utf8'));
    }
    process.exit(0);
  }
  process.stdout.write('.');
}

console.log('\n⚠️  Timed out waiting for provisioning to complete.');
process.exit(1);
