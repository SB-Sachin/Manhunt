/* ─── Account auth (optional upgrade of the anonymous user) ─────────────────
   Players start anonymous and can optionally "claim" a permanent account so
   their stats follow them across devices. We link the credential to the EXISTING
   anonymous user when possible (keeps the same uid), and fall back to signing
   into a pre-existing account if that credential is already taken.
   ─────────────────────────────────────────────────────────────────────────── */

import {
  GoogleAuthProvider,
  EmailAuthProvider,
  linkWithPopup,
  linkWithCredential,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'
import { signInSync, deleteCloudStats } from './statsCloud.js'

/* Snapshot of the current account for the UI. */
export function getAccount() {
  const u = auth.currentUser
  if (!u) return { signedIn: false, isAnonymous: true }
  return {
    signedIn: !u.isAnonymous,
    isAnonymous: u.isAnonymous,
    uid: u.uid,
    email: u.email || null,
    displayName: u.displayName || null,
    photoURL: u.photoURL || null,
  }
}

/* Google: link to the anonymous user, or sign into the existing Google account. */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  try {
    await linkWithPopup(auth.currentUser, provider)
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      const cred = GoogleAuthProvider.credentialFromError(e)
      if (cred) await signInWithCredential(auth, cred)
      else throw e
    } else if (e.code === 'auth/provider-already-linked') {
      // already linked — fine
    } else {
      throw e
    }
  }
  await signInSync(auth.currentUser.uid)
  return getAccount()
}

/*
 * Email/password: try to link (creates the account on the current anon uid).
 * If that email already has an account, sign into it instead.
 */
export async function signInWithEmail(email, password) {
  const cred = EmailAuthProvider.credential(email.trim(), password)
  try {
    await linkWithCredential(auth.currentUser, cred)
  } catch (e) {
    if (e.code === 'auth/email-already-in-use' || e.code === 'auth/credential-already-in-use') {
      // Existing account — sign in (validates the password).
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } else if (e.code === 'auth/provider-already-linked') {
      // already linked — fine
    } else {
      throw e   // weak-password, invalid-email, wrong-password, etc.
    }
  }
  await signInSync(auth.currentUser.uid)
  return getAccount()
}

/* Sign out, then restore an anonymous session so the game still works. */
export async function signOutAccount() {
  await signOut(auth)
  await signInAnonymously(auth)
  return getAccount()
}

/*
 * Delete the cloud stats doc and the Firebase auth user, then restore an
 * anonymous session. May throw 'auth/requires-recent-login' if the session is
 * old — the UI should ask the user to sign in again and retry.
 */
export async function deleteAccount() {
  const u = auth.currentUser
  if (!u || u.isAnonymous) return
  await deleteCloudStats(u.uid)
  await u.delete()                 // may throw requires-recent-login
  await signInAnonymously(auth)
  return getAccount()
}

/* Friendly message for the common Firebase auth error codes. */
export function authErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-email': return "That email doesn't look right."
    case 'auth/weak-password': return 'Password should be at least 6 characters.'
    case 'auth/wrong-password':
    case 'auth/invalid-credential': return 'Wrong password for that email.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Sign-in was cancelled.'
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in popup. Allow popups and try again.'
    case 'auth/requires-recent-login': return 'For security, please sign in again, then delete.'
    case 'auth/network-request-failed': return 'Network problem — check your connection.'
    case 'auth/operation-not-allowed': return 'This sign-in method is not enabled yet.'
    default: return 'Something went wrong. Please try again.'
  }
}
