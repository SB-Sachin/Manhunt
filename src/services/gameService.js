import {
  doc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, getDoc, arrayUnion, runTransaction, deleteField
} from 'firebase/firestore'
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import { db, auth } from './firebase.js'
import { POWERUP_TYPES } from '../utils/powerups.js'
import { randomPointInPolygon } from '../utils/geo.js'

/* Resolve once Firebase has restored any persisted session from storage. */
function authRestored() {
  if (auth.authStateReady) return auth.authStateReady()
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, () => { unsub(); resolve() })
  })
}

export async function ensureAuth() {
  if (auth.currentUser) return auth.currentUser
  // CRITICAL: wait for Firebase to restore a saved (logged-in) user before
  // falling back to anonymous — otherwise we'd overwrite a real account with a
  // fresh anonymous one on every app launch.
  await authRestored()
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  return auth.currentUser
}

export function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

export async function createGame(hostName, dispersalSecs) {
  const user = await ensureAuth()
  const code = generateRoomCode()
  const gameRef = doc(db, 'games', code)

  const hostPlayer = {
    id: user.uid,
    name: hostName,
    role: 'runner',
    isEliminated: false,
    location: null,
    tagCount: 0,
    powerUps: [],
    revealsLeft: 0,
    isHost: true,
    joinedAt: Date.now(),
  }

  await setDoc(gameRef, {
    id: code,
    hostId: user.uid,
    status: 'LOBBY',
    players: { [user.uid]: hostPlayer },
    boundary: [],
    mode: 'classic',            // 'classic' | 'survival'
    roundSecs: 600,             // survival round length
    proximityWarnings: true,    // runner "danger sense"
    dispersalSecs,
    dispersalStartedAt: null,
    dispersalEndsAt: null,
    dispersalPausedAt: null,
    liveStartedAt: null,
    liveEndsAt: null,
    shrinkStartAt: null,
    shrinkDurationSecs: null,
    maxShrink: 0,
    winner: null,
    powerUpSpawns: [],
    createdAt: serverTimestamp(),
  })

  return { code, uid: user.uid }
}

export async function joinGame(code, playerName) {
  const user = await ensureAuth()
  const gameRef = doc(db, 'games', code.toUpperCase())
  const snap = await getDoc(gameRef)

  if (!snap.exists()) throw new Error('Game not found')
  const game = snap.data()
  if (game.status === 'GAME_OVER') throw new Error('This game has already ended')

  // Late joiners (mid-game) come in as an active runner.
  const player = {
    id: user.uid,
    name: playerName,
    role: 'runner',
    isEliminated: false,
    location: null,
    tagCount: 0,
    powerUps: [],
    revealsLeft: 0,
    isHost: false,
    joinedAt: Date.now(),
  }

  await updateDoc(gameRef, { [`players.${user.uid}`]: player })
  return { code: code.toUpperCase(), uid: user.uid }
}

/* Look up a game for rejoin-on-reload. Returns { game, isMember, name } so the
   caller can decide: silently rejoin, prompt to join, or refuse. */
export async function lookupGame(code) {
  const user = await ensureAuth()
  const snap = await getDoc(doc(db, 'games', code.toUpperCase()))
  if (!snap.exists()) return { game: null, isMember: false, name: null, uid: user.uid }
  const game = snap.data()
  const me = game.players?.[user.uid]
  return { game, isMember: !!me, name: me?.name ?? null, uid: user.uid }
}

/* Presence heartbeat — lets others detect a vanished host. Cheap single-field write. */
export async function heartbeat(code, uid) {
  if (!code || !uid) return
  try {
    await updateDoc(doc(db, 'games', code), { [`players.${uid}.lastSeen`]: Date.now() })
  } catch { /* player may have been removed; ignore */ }
}

const HOST_STALE_MS = 45000

/* If the current host hasn't been seen in HOST_STALE_MS, promote the
   earliest-joined active non-ghost player. Safe under concurrency (transaction).
   Any client may call this opportunistically. */
export async function reassignHostIfStale(code) {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'games', code)
      const snap = await tx.get(ref)
      if (!snap.exists()) return
      const game = snap.data()
      if (game.status === 'GAME_OVER') return

      const host = game.players?.[game.hostId]
      const now = Date.now()
      // Host still present & recently seen → nothing to do.
      if (host && (now - (host.lastSeen || host.joinedAt || 0) < HOST_STALE_MS)) return

      // Pick the earliest-joined, recently-seen, real (non-ghost) candidate.
      const candidates = Object.values(game.players || {})
        .filter(p => !p.isGhost && p.id !== game.hostId && !p.isEliminated)
        .filter(p => now - (p.lastSeen || p.joinedAt || 0) < HOST_STALE_MS)
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0))

      const next = candidates[0]
      if (!next) return

      const updates = { hostId: next.id, [`players.${next.id}.isHost`]: true }
      if (host) updates[`players.${game.hostId}.isHost`] = false
      tx.update(ref, updates)
    })
  } catch { /* another client likely won the race; ignore */ }
}

export function subscribeToGame(code, callback) {
  const gameRef = doc(db, 'games', code)
  return onSnapshot(gameRef, (snap) => {
    if (snap.exists()) callback(snap.data())
  })
}

export async function setBoundary(code, polygonCoords) {
  await updateDoc(doc(db, 'games', code), { boundary: polygonCoords })
}

export async function setItPlayers(code, itPlayerIds, revealsPerIt) {
  const gameRef = doc(db, 'games', code)
  const snap = await getDoc(gameRef)
  const { players } = snap.data()

  const updated = {}
  Object.entries(players).forEach(([uid, p]) => {
    updated[`players.${uid}.role`] = itPlayerIds.includes(uid) ? 'it' : 'runner'
    updated[`players.${uid}.revealsLeft`] = itPlayerIds.includes(uid) ? revealsPerIt : 0
  })

  await updateDoc(gameRef, updated)
}

// Set the dispersal duration (seconds) before the game starts — syncs to all
export async function setDispersalDuration(code, secs) {
  await updateDoc(doc(db, 'games', code), { dispersalSecs: secs })
}

// Pre-game settings (host) — all sync live to every player
export async function setGameMode(code, mode) {
  await updateDoc(doc(db, 'games', code), { mode })
}

export async function setRoundDuration(code, secs) {
  await updateDoc(doc(db, 'games', code), { roundSecs: secs })
}

export async function setProximityWarnings(code, enabled) {
  await updateDoc(doc(db, 'games', code), { proximityWarnings: enabled })
}

export async function startDispersal(code) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const secs = snap.data()?.dispersalSecs || 120
    tx.update(ref, {
      status: 'DISPERSAL',
      dispersalStartedAt: serverTimestamp(),
      // Absolute client-epoch end time — every device reads the same number,
      // so the countdown stays in sync without server/client clock mixing.
      dispersalEndsAt: Date.now() + secs * 1000,
      dispersalPausedAt: null,
    })
  })
}

export async function startLive(code, boundary) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    if (!game || game.status === 'LIVE') return   // guard against double-start

    const spawns = spawnPowerUps(boundary, 2)
    const updates = {
      status: 'LIVE',
      liveStartedAt: serverTimestamp(),
      powerUpSpawns: spawns,
    }

    // Survival: round timer + shrinking zone (computed client-side from these)
    if (game.mode === 'survival') {
      const roundSecs = game.roundSecs || 600
      updates.liveEndsAt = Date.now() + roundSecs * 1000
      updates.shrinkStartAt = Date.now()
      updates.shrinkDurationSecs = roundSecs
      updates.maxShrink = 0.6
    }

    tx.update(ref, updates)
  })
}

// Survival round timer expired — rank survivors and end the game
export async function endByTimeout(code) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    if (!game || game.status !== 'LIVE') return

    // Survivors (not eliminated runners) outrank the eliminated; among
    // survivors the winner is arbitrary (all made it) — pick most tags / first.
    const survivors = Object.values(game.players)
      .filter(p => p.role === 'runner' && !p.isEliminated)
    const winner = survivors.sort((a, b) => (b.tagCount || 0) - (a.tagCount || 0))[0]

    tx.update(ref, {
      status: 'GAME_OVER',
      winner: winner?.id || null,
      tagRequest: null,
    })
  })
}

export function spawnPowerUps(boundary, count = 1) {
  const types = Object.keys(POWERUP_TYPES)
  return Array.from({ length: count }, () => ({
    id: Math.random().toString(36).slice(2),
    type: types[Math.floor(Math.random() * types.length)],
    location: randomPointInPolygon(boundary),
    spawnedAt: Date.now(),
  }))
}

export async function updateLocation(code, uid, lat, lng) {
  await updateDoc(doc(db, 'games', code), {
    [`players.${uid}.location`]: { lat, lng },
    [`players.${uid}.lastUpdated`]: Date.now(),
  })
}

export async function collectPowerUp(code, uid, spawnId) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    const spawn = game.powerUpSpawns.find(s => s.id === spawnId)
    if (!spawn) return

    const newSpawns = game.powerUpSpawns.filter(s => s.id !== spawnId)
    const playerPowerUps = [...(game.players[uid].powerUps || []), spawn.type]

    tx.update(ref, {
      powerUpSpawns: newSpawns,
      [`players.${uid}.powerUps`]: playerPowerUps,
    })
  })
}

export async function activatePowerUp(code, uid, powerUpType) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    const playerPowerUps = [...(game.players[uid].powerUps || [])]
    const idx = playerPowerUps.indexOf(powerUpType)
    if (idx === -1) return

    playerPowerUps.splice(idx, 1)

    const effect = {
      id: Math.random().toString(36).slice(2),
      type: powerUpType,
      activatedBy: uid,
      activatedAt: Date.now(),
      expiresAt: Date.now() + (POWERUP_TYPES[powerUpType]?.durationMs || 15000),
    }

    tx.update(ref, {
      [`players.${uid}.powerUps`]: playerPowerUps,
      activeEffects: arrayUnion(effect),
    })
  })
}

export async function useReveal(code, uid, revealType) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    const player = game.players[uid]
    if (!player || player.revealsLeft <= 0) return

    const effect = {
      id: Math.random().toString(36).slice(2),
      type: revealType,
      activatedBy: uid,
      activatedAt: Date.now(),
      expiresAt: Date.now() + 15000,
    }

    tx.update(ref, {
      [`players.${uid}.revealsLeft`]: player.revealsLeft - 1,
      activeEffects: arrayUnion(effect),
    })
  })
}

export async function tagPlayer(code, taggerId, targetId) {
  const gameRef = doc(db, 'games', code)
  // Create a pending tag request — target must confirm
  const tagRequest = {
    id: Math.random().toString(36).slice(2),
    taggerId,
    targetId,
    createdAt: Date.now(),
    status: 'pending',
  }
  await updateDoc(gameRef, { tagRequest })
}

export async function confirmTag(code, targetId, taggerId) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    const survival = game.mode === 'survival'

    const updates = {
      tagRequest: null,
      [`players.${taggerId}.tagCount`]: (game.players[taggerId]?.tagCount || 0) + 1,
    }

    if (survival) {
      // Survival: the runner is eliminated; the tagger stays "It"
      updates[`players.${targetId}.isEliminated`] = true
      updates[`players.${targetId}.eliminatedAt`] = Date.now()
    } else {
      // Classic: the runner is converted to "It"
      updates[`players.${targetId}.role`] = 'it'
      updates[`players.${targetId}.revealsLeft`] = 3
    }

    // Game ends when only one runner remains (classic) / none remain (survival)
    const remaining = Object.values(game.players).filter(
      p => p.role === 'runner' && !p.isEliminated && p.id !== targetId
    )

    if (survival && remaining.length === 0) {
      updates.status = 'GAME_OVER'
      // Last one eliminated survived longest → winner
      updates.winner = game.players[targetId]?.id || null
    } else if (!survival && remaining.length === 1) {
      updates.status = 'GAME_OVER'
      updates.winner = remaining[0].id
    }

    tx.update(ref, updates)
  })
}

export async function disputeTag(code) {
  await updateDoc(doc(db, 'games', code), { tagRequest: null })
}

/* ── Ghost players (phoneless — honor-system) ──────────────────────────────── */

export async function addGhostPlayer(code, name, addedBy) {
  const ghostId = `ghost_${Math.random().toString(36).slice(2, 10)}`
  const ghost = {
    id: ghostId,
    name,
    role: 'runner',
    isEliminated: false,
    location: null,
    tagCount: 0,
    powerUps: [],
    revealsLeft: 0,
    isHost: false,
    isGhost: true,
    addedBy,
    joinedAt: Date.now(),
  }
  await updateDoc(doc(db, 'games', code), { [`players.${ghostId}`]: ghost })
  return ghostId
}

/* ── Admin controls (host only) ────────────────────────────────────────────── */

export async function kickPlayer(code, playerId) {
  await updateDoc(doc(db, 'games', code), { [`players.${playerId}`]: deleteField() })
}

export async function renamePlayer(code, playerId, newName) {
  await updateDoc(doc(db, 'games', code), { [`players.${playerId}.name`]: newName })
}

export async function reassignRole(code, playerId, newRole) {
  await updateDoc(doc(db, 'games', code), {
    [`players.${playerId}.role`]: newRole,
    [`players.${playerId}.revealsLeft`]: newRole === 'it' ? 3 : 0,
  })
}

export async function eliminatePlayer(code, playerId) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    const survival = game.mode === 'survival'

    const updates = {
      [`players.${playerId}.isEliminated`]: true,
      [`players.${playerId}.eliminatedAt`]: Date.now(),
    }

    const remaining = Object.values(game.players).filter(
      p => p.role === 'runner' && !p.isEliminated && p.id !== playerId
    )
    // Survival ends when no runners remain; classic when one remains
    if (survival && remaining.length === 0) {
      updates.status = 'GAME_OVER'
      updates.winner = playerId
    } else if (!survival && remaining.length === 1) {
      updates.status = 'GAME_OVER'
      updates.winner = remaining[0].id
    }

    tx.update(ref, updates)
  })
}

export async function forceEndGame(code, winnerId = null) {
  await updateDoc(doc(db, 'games', code), {
    status: 'GAME_OVER',
    winner: winnerId,
    tagRequest: null,
  })
}

/*
 * Rematch — reset the game back to its lobby for a chained game. Keeps the same
 * players, room code, and settings (mode, timers, boundary, danger sense); wipes
 * roles, eliminations, tags, power-ups, and timers. Triggered by the host; the
 * status flip to LOBBY navigates everyone back automatically.
 */
export async function resetGameToLobby(code) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    if (!game) return

    const players = {}
    Object.values(game.players || {}).forEach(p => {
      players[p.id] = {
        ...p,                 // keep id, name, isHost, isGhost, addedBy, joinedAt
        role: 'runner',
        isEliminated: false,
        eliminatedAt: null,
        location: null,
        tagCount: 0,
        powerUps: [],
        revealsLeft: 0,
      }
    })

    tx.update(ref, {
      players,
      status: 'LOBBY',
      winner: null,
      tagRequest: null,
      activeEffects: [],
      powerUpSpawns: [],
      dispersalStartedAt: null,
      dispersalEndsAt: null,
      dispersalPausedAt: null,
      liveStartedAt: null,
      liveEndsAt: null,
      shrinkStartAt: null,
      shrinkDurationSecs: null,
      maxShrink: 0,
      // Preserved: boundary, mode, roundSecs, dispersalSecs, proximityWarnings
    })
  })
}

/* ── Dispersal pause / resume (host only) ──────────────────────────────────── */

export async function pauseDispersal(code) {
  // Record the moment we paused so the remaining time can be frozen
  await updateDoc(doc(db, 'games', code), { dispersalPausedAt: Date.now() })
}

export async function resumeDispersal(code) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'games', code)
    const snap = await tx.get(ref)
    const game = snap.data()
    if (!game.dispersalPausedAt || !game.dispersalEndsAt) return

    // Push the end time forward by however long we were paused
    const pausedFor = Date.now() - game.dispersalPausedAt
    tx.update(ref, {
      dispersalEndsAt: game.dispersalEndsAt + pausedFor,
      dispersalPausedAt: null,
    })
  })
}

export async function replenishPowerUps(code, boundary) {
  const spawns = spawnPowerUps(boundary, 1)
  await updateDoc(doc(db, 'games', code), {
    powerUpSpawns: arrayUnion(...spawns),
  })
}
