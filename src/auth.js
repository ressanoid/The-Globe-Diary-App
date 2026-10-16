// --- Firebase Auth facade ---
// Sign-in is required: anonymous sign-in is disabled for this project, and the
// Firestore rules require an authenticated user for BOTH reads and writes.
// Users sign in with Google or email/password, so a signed-out visitor must go
// through the sign-in gate before the app can connect or persist anything.

import {
  GoogleAuthProvider,
  EmailAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  linkWithPopup,
  linkWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from './firebase.js';

const googleProvider = new GoogleAuthProvider();

const ready = () => Boolean(isFirebaseConfigured && auth);

/** Current Firebase user (null when auth is not configured). */
export const currentUser = () => (ready() ? auth.currentUser : null);

const ERROR_MESSAGES = {
  'auth/email-already-in-use': 'That email is already registered. Try signing in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'No account found with that email.',
  'auth/popup-closed-by-user': 'The sign-in window closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups for this site.',
  'auth/credential-already-in-use': 'That account is already linked to a different sign-in.',
  'auth/provider-already-linked': 'This sign-in method is already linked.',
  'auth/network-request-failed': 'Network problem — please check your connection.',
  'auth/operation-not-allowed': 'Sign-in is not enabled for this project yet.'
};

/** Convert an SDK error into a gentle, user-facing message. */
const friendly = (error) => {
  const wrapped = new Error(ERROR_MESSAGES[error?.code] || error?.message || 'Something went wrong signing in.');
  wrapped.code = error?.code;
  wrapped.cause = error;
  return wrapped;
};

// --- Identity helpers ---

export const isRegistered = (user) => Boolean(user && !user.isAnonymous);

export const displayNameOf = (user) => {
  if (!user) return 'You';
  if (user.isAnonymous) return 'Anonymous';
  return user.displayName || user.email || 'You';
};

export const initialOf = (user) => displayNameOf(user).charAt(0).toUpperCase();

export const isGoogleUser = (user) =>
  Boolean(user?.providerData?.some((p) => p.providerId === 'google.com'));

export const isEmailUser = (user) =>
  Boolean(user?.providerData?.some((p) => p.providerId === 'password'));

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  if (!ready()) return () => {};
  return onAuthStateChanged(auth, (user) => callback(user));
}

/**
 * Resolve as soon as a NON-anonymous (registered) user is signed in.
 *
 * Resolves immediately when a registered user already exists; otherwise it
 * waits for the next auth state change that yields one. Rejects when Firebase
 * auth is unavailable so callers never wait forever on a missing backend
 * (mirrors the `ready()` guard used throughout this module).
 *
 * @returns {Promise<import('firebase/auth').User>}
 */
export function waitForRegisteredUser() {
  if (!ready()) {
    return Promise.reject(new Error('Sign-in is unavailable: Firebase is not configured.'));
  }
  if (isRegistered(auth.currentUser)) return Promise.resolve(auth.currentUser);

  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    const settle = (user) => {
      if (!isRegistered(user)) return;
      unsubscribe();
      resolve(user);
    };
    try {
      unsubscribe = onAuthStateChanged(auth, settle, (error) => {
        unsubscribe();
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}

// --- Sign-in flows ---

/**
 * Create an account (or sign in) with email + password.
 * A legacy anonymous session (from an old localStorage token) is upgraded in
 * place so the entries keyed to that uid stay theirs.
 */
export async function signUpWithEmail({ email, password, displayName }) {
  if (!ready()) throw new Error('Sign-in is unavailable: Firebase is not configured.');
  const current = auth.currentUser;
  const credential = EmailAuthProvider.credential(email, password);

  // Legacy browsers may still hold an old anonymous session; linking it (rather
  // than discarding it) preserves the entries owned by that uid.
  if (current?.isAnonymous) {
    try {
      const linked = await linkWithCredential(current, credential);
      if (displayName) await updateProfile(linked.user, { displayName });
      return { user: linked.user, upgraded: true };
    } catch (error) {
      // Email already belongs to an account — fall through and sign in instead.
      if (error.code !== 'auth/email-already-in-use') throw friendly(error);
    }
  }

  if (current) await signOut(auth);

  // No session to upgrade, so actually CREATE the account. (Without anonymous
  // sessions a pure sign-in attempt could never create one — "Create Account"
  // would always fail with "Incorrect email or password".)
  try {
    const created = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(created.user, { displayName });
    return { user: created.user, upgraded: false, created: true };
  } catch (error) {
    // The email already belongs to an account — fall back to signing in with it.
    if (error.code !== 'auth/email-already-in-use') throw friendly(error);
  }

  try {
    const credentialOut = await signInWithEmailAndPassword(auth, email, password);
    if (displayName && !credentialOut.user.displayName) {
      await updateProfile(credentialOut.user, { displayName });
    }
    return { user: credentialOut.user, upgraded: false, existing: true };
  } catch (error) {
    throw friendly(error);
  }
}

/** Sign in with an existing email + password account. */
export async function signInWithEmail({ email, password }) {
  if (!ready()) throw new Error('Sign-in is unavailable: Firebase is not configured.');
  const current = auth.currentUser;
  if (current) await signOut(auth);
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return { user: credential.user };
  } catch (error) {
    throw friendly(error);
  }
}

/**
 * Sign in with Google. A legacy anonymous session (from an old localStorage
 * token) is linked so `ownerUid` (and therefore the entries) is preserved.
 */
export async function signInWithGoogle() {
  if (!ready()) throw new Error('Sign-in is unavailable: Firebase is not configured.');
  const current = auth.currentUser;

  // Legacy browsers may still hold an old anonymous session; linking it (rather
  // than discarding it) preserves the entries owned by that uid.
  if (current?.isAnonymous) {
    try {
      const linked = await linkWithPopup(current, googleProvider);
      return { user: linked.user, upgraded: true };
    } catch (error) {
      const recoverable = ['auth/credential-already-in-use', 'auth/provider-already-linked'];
      if (error.code === 'auth/provider-already-linked') return { user: auth.currentUser, upgraded: true };
      if (!recoverable.includes(error.code)) throw friendly(error);
      // That Google account already exists separately: sign in to it directly.
      await signOut(auth);
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        return { user: credential.user, upgraded: false, existing: true };
      } catch (signInError) {
        throw friendly(signInError);
      }
    }
  }

  try {
    const credential = await signInWithPopup(auth, googleProvider);
    return { user: credential.user, upgraded: false };
  } catch (error) {
    throw friendly(error);
  }
}

/**
 * Sign out completely. There is no anonymous fallback session: with sign-in
 * required, the UI re-presents the sign-in gate after a successful sign-out.
 */
export async function signOutCompletely() {
  if (!ready()) return;
  try {
    await signOut(auth);
  } catch (error) {
    console.warn('Sign-out failed:', error);
  }
}
