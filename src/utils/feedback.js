/* ─── Combined haptic + sound feedback ─────────────────────────────────────
   One call site per game event so screens don't have to coordinate sound and
   vibration separately. Haptics are a no-op where unsupported (most iOS Safari).
   ─────────────────────────────────────────────────────────────────────────── */

import {
  playTag, playPickup, playBeep, playGo,
  playWin, playWarning, playEliminated,
} from './sound.js'

const PATTERNS = {
  TAG: [80, 40, 160],
  PICKUP: [30, 30, 30],
  WARNING: [40],
  ELIMINATED: [200, 60, 200],
  GO: [120],
}

export function buzz(pattern) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  } catch { /* ignore */ }
}

export const feedback = {
  tag()        { buzz(PATTERNS.TAG); playTag() },
  pickup()     { buzz(PATTERNS.PICKUP); playPickup() },
  warning()    { buzz(PATTERNS.WARNING); playWarning() },
  eliminated() { buzz(PATTERNS.ELIMINATED); playEliminated() },
  go()         { buzz(PATTERNS.GO); playGo() },
  beep()       { playBeep() },
  win()        { buzz(PATTERNS.GO); playWin() },
}
