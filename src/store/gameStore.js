import { create } from 'zustand'

export const useGameStore = create((set) => ({
  // Session
  uid: null,
  displayName: null,
  roomCode: null,

  // Live game state (synced from Firestore)
  game: null,

  setSession: (uid, displayName, roomCode) => set({ uid, displayName, roomCode }),
  setGame: (game) => set({ game }),
  clearSession: () => set({ uid: null, displayName: null, roomCode: null, game: null }),
}))

// Derived selectors (call inside components)
export const selectMe = (state) =>
  state.game?.players?.[state.uid] ?? null

export const selectMyRole = (state) =>
  state.game?.players?.[state.uid]?.role ?? null

export const selectIsHost = (state) =>
  state.game?.hostId === state.uid

export const selectRunners = (state) =>
  Object.values(state.game?.players ?? {}).filter(p => p.role === 'runner' && !p.isEliminated)

export const selectItPlayers = (state) =>
  Object.values(state.game?.players ?? {}).filter(p => p.role === 'it')

export const selectAllPlayers = (state) =>
  Object.values(state.game?.players ?? {})
