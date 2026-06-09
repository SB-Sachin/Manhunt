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
 * Record one finished game. Returns the list of newly-unlocked achievement ids
 * (so the UI can celebrate them). No-op if this game code was already recorded.
 */
export function recordGameResult({ gameCode, mode, role, won, tags, survivedFullRound, survivedSecs, wasTagged }) {
  if (gameCode && alreadyRecorded(gameCode)) return []
  if (gameCode) markRecorded(gameCode)

  const stats = getStats()
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

  saveStats(stats)
  return newlyUnlocked
}

export function getAchievements() {
  const stats = getStats()
  return ACHIEVEMENTS.map(a => ({ ...a, unlocked: !!stats.achievements[a.id] }))
}
