// --- Firebase Auth facade ---
// Anonymous session is always available (the app needs *some* signed-in user
// because Firestore rules require authentication). Registered sign-in methods
// (email/password, Google) are linked onto that session so the user's existing
// entries — keyed by `ownerUid` — stay theirs after they upgrade.

import {
  GoogleAuthProvider,
  EmailAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  linkWithPopup,
  linkWithCredential,
  signInWithEmailAndPassword,
  signOut,
  signInAnonymously,
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

// --- Sign-in flows ---

/**
 * Create an account (or sign in) with email + password.
 * Anonymous users are upgraded in place so their entries keep their uid.
 */
export async function signUpWithEmail({ email, password, displayName }) {
  if (!ready()) throw new Error('Sign-in is unavailable: Firebase is not configured.');
  const current = auth.currentUser;
  const credential = EmailAuthProvider.credential(email, password);

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
 * Sign in with Google. If the current session is anonymous we link the Google
 * credential so `ownerUid` (and therefore their entries) is preserved.
 */
export async function signInWithGoogle() {
  if (!ready()) throw new Error('Sign-in is unavailable: Firebase is not configured.');
  const current = auth.currentUser;

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
 * Sign out of a registered account while keeping the app usable:
 * drops back to a fresh anonymous session (Firestore rules require auth).
 */
export async function signOutToAnon() {
  if (!ready()) return;
  try {
    await signOut(auth);
    await signInAnonymously(auth);
  } catch (error) {
    console.warn('Sign-out fallback to anonymous failed:', error);
  }
}
