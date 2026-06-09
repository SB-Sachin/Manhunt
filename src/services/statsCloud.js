/* ─── Cloud stats (Firestore users/{uid}) ──────────────────────────────────
   Used only when the player has upgraded their anonymous account to a real one.
   The local cache (utils/stats.js) stays the synchronous source for the UI;
   these helpers keep it mirrored with Firestore so stats follow the account
   across devices. De-dupes by game code so a game is never counted twice.
   ─────────────────────────────────────────────────────────────────────────── */

import { doc, getDoc, setDoc, deleteDoc, runTransaction } from 'firebase/firestore'
import { db } from './firebase.js'
import { getStats, setStatsRaw, mergeStats, applyResult, DEFAULT_STATS } from '../utils/stats.js'

const MERGED_FLAG = (uid) => `manhunt.merged.${uid}`
const userRef = (uid) => doc(db, 'users', uid)

/*
 * Call right after a successful sign-in/link, and on every boot for a logged-in
 * user. First time on this device for this account → merge device stats into the
 * cloud once (so anonymous progress isn't lost). Afterwards → cloud is the truth
 * and we just mirror it onto the device cache.
 * Returns the resolved stats so the caller can refresh the UI.
 */
export async function signInSync(uid) {
  if (!uid) return getStats()
  const snap = await getDoc(userRef(uid))
  const cloud = snap.exists() ? snap.data() : null
  const alreadyMerged = localStorage.getItem(MERGED_FLAG(uid))

  if (cloud && alreadyMerged) {
    // Cloud is authoritative — mirror it locally.
    setStatsRaw(cloud)
    return cloud
  }

  // First login on this device: fold device stats into the cloud once.
  const merged = mergeStats(cloud || DEFAULT_STATS, getStats())
  // Preserve the cloud's recorded-game list so future de-dupe still works.
  merged.recordedGames = (cloud?.recordedGames || []).slice(-200)
  await setDoc(userRef(uid), merged, { merge: true })
  setStatsRaw(merged)
  try { localStorage.setItem(MERGED_FLAG(uid), '1') } catch { /* ignore */ }
  return merged
}

/*
 * Record one finished game to the cloud (transaction, de-duped by game code),
 * then mirror the result onto the local cache. Safe to call fire-and-forget.
 */
export async function recordGameToCloud(uid, result) {
  if (!uid) return
  const merged = await runTransaction(db, async (tx) => {
    const ref = userRef(uid)
    const snap = await tx.get(ref)
    const data = snap.exists() ? snap.data() : { ...DEFAULT_STATS, recordedGames: [] }
    const recorded = data.recordedGames || []
    if (result.gameCode && recorded.includes(result.gameCode)) return data   // already counted

    const { stats } = applyResult(data, result)
    stats.recordedGames = [...recorded, result.gameCode].filter(Boolean).slice(-200)
    tx.set(ref, stats, { merge: true })
    return stats
  })
  setStatsRaw(merged)
  return merged
}

/* Remove the cloud stats document (used by Delete Account). */
export async function deleteCloudStats(uid) {
  if (!uid) return
  try { await deleteDoc(userRef(uid)) } catch { /* ignore */ }
  try { localStorage.removeItem(MERGED_FLAG(uid)) } catch { /* ignore */ }
}
