import { create } from 'zustand'

/* Session persistence — survives reload / phone-lock.
   We persist only displayName + roomCode. The uid is NOT trusted from storage;
   it's set authoritatively from Firebase anonymous auth on boot (SessionBoot). */
const SESSION_KEY = 'manhunt.session'

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveSession(displayName, roomCode) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ displayName, roomCode }))
  } catch { /* ignore */ }
}

function dropSession() {
  try { localStorage.removeItem(SESSION_KEY) } catch { /* ignore */ }
}

const persisted = loadSession()

export const useGameStore = create((set, get) => ({
  // Session
  uid: null,
  displayName: persisted.displayName ?? null,
  roomCode: persisted.roomCode ?? null,

  // Live game state (synced from Firestore)
  game: null,

  // Auth readiness (flipped once Firebase resolves the anonymous uid)
  authReady: false,

  setUid: (uid) => set({ uid, authReady: true }),

  setSession: (uid, displayName, roomCode) => {
    saveSession(displayName, roomCode)
    set({ uid, displayName, roomCode })
  },

  // Update just the room (keeps the persisted displayName)
  setRoom: (roomCode) => {
    saveSession(get().displayName, roomCode)
    set({ roomCode })
  },

  setGame: (game) => set({ game }),

  clearSession: () => {
    dropSession()
    // Keep uid (the anonymous identity is stable); just drop the room/game.
    set({ displayName: null, roomCode: null, game: null })
  },
}))

// Derived selectors (call inside components)
export const selectMe = (state) =>
  state.game?.players?.[state.uid] ?? null

export const selectMyRole = (state) =>
  state.game?.players?.[state.uid]?.role ?? null

export const selectIsHost = (state) =>
  state.game?.hostId === state.uid

// Stable ordering — join time, then id as a tiebreaker. Without this the list
// re-shuffles on every GPS/location write, making players impossible to tap.
function byJoinOrder(a, b) {
  const ja = a.joinedAt ?? 0
  const jb = b.joinedAt ?? 0
  if (ja !== jb) return ja - jb
  return String(a.id).localeCompare(String(b.id))
}

const sortedPlayers = (state) =>
  Object.values(state.game?.players ?? {}).sort(byJoinOrder)

export const selectRunners = (state) =>
  sortedPlayers(state).filter(p => p.role === 'runner' && !p.isEliminated)

export const selectItPlayers = (state) =>
  sortedPlayers(state).filter(p => p.role === 'it')

export const selectAllPlayers = (state) =>
  sortedPlayers(state)

// Real (phone-carrying) players only — excludes honor-system ghosts
export const selectRealPlayers = (state) =>
  sortedPlayers(state).filter(p => !p.isGhost)
