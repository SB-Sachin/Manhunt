import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { initializeAuth, browserLocalPersistence, indexedDBLocalPersistence } from 'firebase/auth'

// Replace with your Firebase project config from https://console.firebase.google.com
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)

// Persist the signed-in user across app close/reopen (IndexedDB, falling back to
// localStorage). Without explicit persistence a session can be lost on relaunch.
export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
})
