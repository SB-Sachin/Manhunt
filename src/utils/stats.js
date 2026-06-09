/* ─── Device-local player stats & achievements ─────────────────────────────
   Persisted in localStorage. Anonymous auth means there's no stable cross-device
   identity, so progression lives on the device — no logins, right for the audience.
   ─────────────────────────────────────────────────────────────────────────── */

const STATS_KEY = 'manhunt.stats'
const RECORDED_KEY = 'manhunt.recordedGames'   // de-dupe by game code

const DEFAULT_STATS = {
  gamesPlayed: 0,
  wins: 0,
  totalTags: 0,
  longestSurvival: 0,   // seconds
  achievements: {},      // id -> unlocked timestamp
}

export const ACHIEVEMENTS = [
  { id: 'first_blood', emoji: '🩸', name: 'First Blood', desc: 'Tag your first runner' },
  { id: 'hat_trick',   emoji: '🎩', name: 'Hat Trick',   desc: '3+ tags in one game' },
  { id: 'untouchable', emoji: '✨', name: 'Untouchable',  desc: 'Win without being tagged' },
  { id: 'survivor',    emoji: '🛡️', name: 'Survivor',     desc: 'Survive a full survival round' },
  { id: 'veteran',     emoji: '🎖️', name: 'Veteran',      desc: 'Play 10 games' },
  { id: 'champion',    emoji: '👑', name: 'Champion',     desc: 'Win 5 games' },
]

export function getStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    return raw ? { ...DEFAULT_STATS, ...JSON.parse(raw) } : { ...DEFAULT_STATS }
  } catch {
    return { ...DEFAULT_STATS }
  }
}

function saveStats(stats) {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)) } catch { /* ignore */ }
}

function alreadyRecorded(gameCode) {
  try {
    const list = JSON.parse(localStorage.getItem(RECORDED_KEY) || '[]')
    return list.includes(gameCode)
  } catch { return false }
}

function markRecorded(gameCode) {
  try {
    const list = JSON.parse(localStorage.getItem(RECORDED_KEY) || '[]')
    list.push(gameCode)
    // keep only the last 50 codes
    localStorage.setItem(RECORDED_KEY, JSON.stringify(list.slice(-50)))
  } catch { /* ignore */ }
}

/*
 * Pure: apply one game result to a stats object. Returns { stats, newlyUnlocked }
 * without touching storage or de-duping. Shared by the local recorder and the
 * cloud (Firestore) recorder so achievement rules live in exactly one place.
 */
export function applyResult(prev, { mode, won, tags, survivedFullRound, survivedSecs, wasTagged }) {
  const stats = {
    ...DEFAULT_STATS,
    ...prev,
    achievements: { ...(prev?.achievements || {}) },
  }
  stats.gamesPlayed += 1
  stats.totalTags += tags || 0
  if (won) stats.wins += 1
  if (survivedSecs && survivedSecs > (stats.longestSurvival || 0)) {
    stats.longestSurvival = Math.round(survivedSecs)
  }

  const newlyUnlocked = []
  const unlock = (id) => {
    if (!stats.achievements[id]) {
      stats.achievements[id] = Date.now()
      newlyUnlocked.push(id)
    }
  }

  if ((tags || 0) >= 1) unlock('first_blood')
  if ((tags || 0) >= 3) unlock('hat_trick')
  if (won && !wasTagged) unlock('untouchable')
  if (mode === 'survival' && survivedFullRound) unlock('survivor')
  if (stats.gamesPlayed >= 10) unlock('veteran')
  if (stats.wins >= 5) unlock('champion')

  return { stats, newlyUnlocked }
}

/*
 * Record one finished game to LOCAL storage. Returns newly-unlocked achievement
 * ids (for celebration). No-op if this game code was already recorded here.
 */
export function recordGameResult(result) {
  const { gameCode } = result
  if (gameCode && alreadyRecorded(gameCode)) return []
  if (gameCode) markRecorded(gameCode)

  const { stats, newlyUnlocked } = applyResult(getStats(), result)
  saveStats(stats)
  return newlyUnlocked
}

/* Overwrite the local cache (used to mirror cloud stats onto the device). */
export function setStatsRaw(stats) {
  saveStats({ ...DEFAULT_STATS, ...stats, achievements: { ...(stats?.achievements || {}) } })
}

/* Combine two stats objects (first-login merge of device + cloud). */
export function mergeStats(a = {}, b = {}) {
  const merged = { ...DEFAULT_STATS }
  merged.gamesPlayed = (a.gamesPlayed || 0) + (b.gamesPlayed || 0)
  merged.wins = (a.wins || 0) + (b.wins || 0)
  merged.totalTags = (a.totalTags || 0) + (b.totalTags || 0)
  merged.longestSurvival = Math.max(a.longestSurvival || 0, b.longestSurvival || 0)
  merged.achievements = { ...(b.achievements || {}) }
  for (const [id, ts] of Object.entries(a.achievements || {})) {
    merged.achievements[id] = Math.min(ts, merged.achievements[id] || Infinity)
  }
  return merged
}

export { DEFAULT_STATS }

export function getAchievements() {
  const stats = getStats()
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: !!stats.achievements[a.id] }))
}

/* Wipe all device-local progression — stats, achievements, and the
   recorded-games de-dupe list. Used by the "Reset stats" button. */
export function clearStats() {
  try {
    localStorage.removeItem(STATS_KEY)
    localStorage.removeItem(RECORDED_KEY)
  } catch { /* ignore */ }
}
