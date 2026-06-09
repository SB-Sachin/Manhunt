/* ─── Web Audio sound engine ───────────────────────────────────────────────
   All sounds are synthesised with oscillators — no audio files to ship/load.
   The AudioContext is created lazily on the first call (which must follow a
   user gesture on mobile) to satisfy browser autoplay policies.
   ─────────────────────────────────────────────────────────────────────────── */

const MUTE_KEY = 'manhunt.muted'

let ctx = null

function getCtx() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  // iOS suspends the context until a gesture resumes it
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

export function isMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export function setMuted(muted) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0') } catch { /* ignore */ }
}

/* Play one tone. type: 'sine' | 'square' | 'triangle' | 'sawtooth' */
function tone(freq, startOffset, duration, { type = 'sine', gain = 0.18, sweepTo = null } = {}) {
  const audio = getCtx()
  if (!audio) return
  const t0 = audio.currentTime + startOffset
  const osc = audio.createOscillator()
  const amp = audio.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t0 + duration)

  // Quick attack, smooth release to avoid clicks
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)

  osc.connect(amp).connect(audio.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

function guard(fn) {
  return (...args) => { if (!isMuted()) fn(...args) }
}

/* ── Public sounds ──────────────────────────────────────────────────────── */

// Tag — descending alarm-style two-tone
export const playTag = guard(() => {
  tone(660, 0, 0.16, { type: 'square', gain: 0.16, sweepTo: 420 })
  tone(420, 0.14, 0.22, { type: 'square', gain: 0.16, sweepTo: 240 })
})

// Power-up pickup — bright rising arpeggio
export const playPickup = guard(() => {
  tone(523, 0, 0.09, { type: 'triangle', gain: 0.15 })
  tone(659, 0.08, 0.09, { type: 'triangle', gain: 0.15 })
  tone(988, 0.16, 0.14, { type: 'triangle', gain: 0.15 })
})

// Countdown beep
export const playBeep = guard(() => {
  tone(720, 0, 0.12, { type: 'sine', gain: 0.16 })
})

// GO! — punchy rising blast
export const playGo = guard(() => {
  tone(440, 0, 0.28, { type: 'sawtooth', gain: 0.2, sweepTo: 880 })
})

// Win fanfare — major triad climb
export const playWin = guard(() => {
  tone(523, 0, 0.16, { type: 'triangle', gain: 0.18 })
  tone(659, 0.15, 0.16, { type: 'triangle', gain: 0.18 })
  tone(784, 0.3, 0.16, { type: 'triangle', gain: 0.18 })
  tone(1047, 0.45, 0.34, { type: 'triangle', gain: 0.2 })
})

// Proximity warning — short low pulse
export const playWarning = guard(() => {
  tone(180, 0, 0.12, { type: 'sawtooth', gain: 0.14 })
})

// Eliminated — falling buzz
export const playEliminated = guard(() => {
  tone(300, 0, 0.4, { type: 'sawtooth', gain: 0.18, sweepTo: 90 })
})

// Resume the audio context on first gesture (call from a click handler)
export function primeAudio() {
  getCtx()
}
