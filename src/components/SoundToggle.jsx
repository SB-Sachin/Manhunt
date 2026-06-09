import { useState } from 'react'
import { isMuted, setMuted, primeAudio } from '../utils/sound.js'

/* Small 🔊/🔇 toggle. `variant="pill"` for the in-game HUD, default for Home. */
export default function SoundToggle({ variant = 'fab' }) {
  const [muted, setMutedState] = useState(isMuted())

  function toggle() {
    primeAudio()                 // unlock AudioContext on this user gesture
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  if (variant === 'pill') {
    return (
      <button
        className="btn-pill"
        style={{ minHeight: 30, padding: '5px 12px' }}
        onClick={toggle}
        aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    )
  }

  return (
    <button
      className="map-fab"
      style={{ position: 'static', width: 44, height: 44 }}
      onClick={toggle}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  )
}
