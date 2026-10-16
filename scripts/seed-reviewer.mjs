// Seeds the `reviewers/{uid}` collection so the @tagging review queue can be
// demoed. Reviewer docs are deliberately NOT writable from the client (see
// firestore.rules), so they must be created out-of-band — exactly like this.
//
// Usage:
//   node scripts/seed-reviewer.mjs <email-or-uid> [role]
//
//   role defaults to 'admin'; valid roles are 'admin' | 'doctor'.
//
// Examples:
//   node scripts/seed-reviewer.mjs nasser.alsaeed.777@gmail.com
//   node scripts/seed-reviewer.mjs someone@example.com doctor
//
// The user must have signed in to the app at least once, so that their Firebase
// Auth account exists and has a uid to attach the role to.
//
// Uses the Firebase CLI's refresh token to mint an OAuth access token, so it
// needs no service-account JSON. Writes go through the Firestore REST API,
// which (as an authenticated project admin) bypasses security rules.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const PROJECT = 'the-globe-diary';
const VALID_ROLES = ['admin', 'doctor'];

const [identifier, roleArg = 'admin'] = process.argv.slice(2);

if (!identifier) {
  console.error('Usage: node scripts/seed-reviewer.mjs <email-or-uid> [admin|doctor]');
  process.exit(1);
}

if (!VALID_ROLES.includes(roleArg)) {
  console.error(`Invalid role "${roleArg}". Expected one of: ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}

// --- Mint an access token from the Firebase CLI's stored refresh token ---

const tokenPath = `${homedir()}/.config/configstore/firebase-tools.json`;
const refreshToken = JSON.parse(readFileSync(tokenPath, 'utf8'))?.tokens?.refresh_token;
if (!refreshToken) {
  console.error(`No refresh token found in ${tokenPath}. Run \`firebase login\` first.`);
  process.exit(1);
}

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
if (!accessToken) {
  console.error('Failed to obtain an access token.');
  process.exit(1);
}

const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

// --- Resolve the identifier to a uid (accept a raw uid directly) ---

const looksLikeUid = !identifier.includes('@');
let uid = identifier;

if (!looksLikeUid) {
  const lookupRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:lookup`,
    { method: 'POST', headers: auth, body: JSON.stringify({ email: [identifier] }) }
  );
  const lookup = await lookupRes.json();

  if (!lookupRes.ok) {
    console.error(`Account lookup failed: HTTP ${lookupRes.status} ${JSON.stringify(lookup.error)}`);
    process.exit(1);
  }

  uid = lookup.users?.[0]?.localId;
  if (!uid) {
    console.error(
      `No Firebase Auth account found for "${identifier}".\n` +
        'Sign in to the app with this account once, then re-run this script.'
    );
    process.exit(1);
  }
  console.log(`Resolved ${identifier} → uid ${uid}`);
} else {
  console.log(`Using uid directly: ${uid}`);
}

// --- Write reviewers/{uid} = { role } ---

// NOTE: the document path must include the `reviewers` collection segment.
const docUrl =
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/reviewers/${uid}`;

const writeRes = await fetch(docUrl, {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ fields: { role: { stringValue: roleArg } } })
});

const written = await writeRes.json();

if (!writeRes.ok) {
  console.error(`Failed to seed reviewer: HTTP ${writeRes.status} ${JSON.stringify(written.error)}`);
  process.exit(1);
}

console.log(`✅ Seeded reviewers/${uid} with role "${roleArg}".`);
console.log('   That user will now see the review-queue entry point in the app.');
