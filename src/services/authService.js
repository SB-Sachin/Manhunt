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
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  signOut,
} from 'firebase/auth'
import { auth } from './firebase.js'
import { ensureAuth } from './gameService.js'
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
  // Guarantee a user exists to link onto. Without this, auth.currentUser can be
  // null (e.g. anonymous sign-in hasn't completed) and linkWithPopup throws
  // auth/argument-error.
  await ensureAuth()

  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })

  // If somehow there's still no user to link onto, sign in with Google directly.
  if (!auth.currentUser) {
    await signInWithPopup(auth, provider)
    await signInSync(auth.currentUser.uid)
    return getAccount()
  }

  try {
    await linkWithPopup(auth.currentUser, provider)
  } catch (e) {
    if (e.code === 'auth/credential-already-in-use') {
      // This Google account already exists — sign into it instead of linking.
      const cred = GoogleAuthProvider.credentialFromError(e)
      if (cred) await signInWithCredential(auth, cred)
      else await signInWithPopup(auth, provider)
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
  // Guarantee a user to link onto (avoids auth/argument-error on a null user).
  await ensureAuth()
  const addr = email.trim()

  // No anonymous user to upgrade — just create/sign into the account directly.
  if (!auth.currentUser) {
    try {
      await createUserWithEmailAndPassword(auth, addr, password)
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        await signInWithEmailAndPassword(auth, addr, password)
      } else throw e
    }
    await signInSync(auth.currentUser.uid)
    return getAccount()
  }

  const cred = EmailAuthProvider.credential(addr, password)
  try {
    await linkWithCredential(auth.currentUser, cred)
  } catch (e) {
    if (e.code === 'auth/email-already-in-use' || e.code === 'auth/credential-already-in-use') {
      // Existing account — sign in (validates the password).
      await signInWithEmailAndPassword(auth, addr, password)
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
    case 'auth/email-already-in-use': return 'That email already has an account — check the password.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request': return 'Sign-in was cancelled.'
    case 'auth/popup-blocked': return 'Your browser blocked the sign-in popup. Allow popups and try again.'
    case 'auth/requires-recent-login': return 'For security, please sign in again, then delete.'
    case 'auth/network-request-failed': return 'Network problem — check your connection.'
    case 'auth/operation-not-allowed': return 'Google/email sign-in is not enabled in Firebase yet.'
    case 'auth/unauthorized-domain': return 'This site is not in Firebase’s Authorized domains list.'
    case 'auth/internal-error': return 'Auth service error — check the provider is enabled in Firebase.'
    // Surface anything unrecognised so it's actionable instead of silent.
    default: return `Sign-in failed${code ? ` (${code})` : ''}. Please try again.`
  }
}
