import {
  doc, setDoc, updateDoc, onSnapshot,
  serverTimestamp, getDoc, arrayUnion, runTransaction
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { db, auth } from './firebase.js'
import { POWERUP_TYPES } from '../utils/powerups.js'
import { randomPointInPolygon } from '../utils/geo.js'

export async function ensureAuth() {
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
    dispersalSecs,
    dispersalStartedAt: null,
    liveStartedAt: null,
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
  if (game.status !== 'LOBBY') throw new Error('Game already started')

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

export async function startDispersal(code) {
  await updateDoc(doc(db, 'games', code), {
    status: 'DISPERSAL',
    dispersalStartedAt: serverTimestamp(),
  })
}

export async function startLive(code, boundary) {
  const gameRef = doc(db, 'games', code)
  // Spawn first power-up
  const spawns = spawnPowerUps(boundary, 2)
  await updateDoc(gameRef, {
    status: 'LIVE',
    liveStartedAt: serverTimestamp(),
    powerUpSpawns: spawns,
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

    const updates = {
      tagRequest: null,
      [`players.${targetId}.role`]: 'it',
      [`players.${targetId}.revealsLeft`]: 3,
      [`players.${taggerId}.tagCount`]: (game.players[taggerId]?.tagCount || 0) + 1,
    }

    // Check if game should end
    const runners = Object.values(game.players).filter(
      p => p.role === 'runner' && !p.isEliminated && p.id !== targetId
    )

    if (runners.length === 1) {
      updates.status = 'GAME_OVER'
      updates.winner = runners[0].id
    }

    tx.update(ref, updates)
  })
}

export async function disputeTag(code) {
  await updateDoc(doc(db, 'games', code), { tagRequest: null })
}

export async function replenishPowerUps(code, boundary) {
  const spawns = spawnPowerUps(boundary, 1)
  await updateDoc(doc(db, 'games', code), {
    powerUpSpawns: arrayUnion(...spawns),
  })
}
