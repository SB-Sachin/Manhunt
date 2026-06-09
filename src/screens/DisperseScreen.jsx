import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectMyRole, selectIsHost } from '../store/gameStore.js'
import { subscribeToGame, startLive, pauseDispersal, resumeDispersal } from '../services/gameService.js'
import { useLocationTracking, usePresence } from '../hooks/useLocation.js'
import { feedback } from '../utils/feedback.js'

export default function DisperseScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const role = useGameStore(selectMyRole)
  const isHost = useGameStore(selectIsHost)
  const [secondsLeft, setSecondsLeft] = useState(null)
  const [showReveal, setShowReveal] = useState(true)
  const lastBeepRef = useRef(null)

  useLocationTracking(roomCode, uid, true)
  usePresence(roomCode, uid)

  // Role-reveal splash on first mount
  useEffect(() => {
    const t = setTimeout(() => setShowReveal(false), 1950)
    return () => clearTimeout(t)
  }, [])

  // Countdown beeps for the final 3 seconds
  useEffect(() => {
    if (secondsLeft == null || secondsLeft > 3 || game?.dispersalPausedAt) return
    if (lastBeepRef.current === secondsLeft) return
    lastBeepRef.current = secondsLeft
    if (secondsLeft === 0) feedback.go()
    else feedback.beep()
  }, [secondsLeft])

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'LIVE') navigate('/game')
      if (g.status === 'GAME_OVER') navigate('/gameover')
    })
    return unsub
  }, [roomCode])

  const isPaused = !!game?.dispersalPausedAt

  useEffect(() => {
    if (!game?.dispersalEndsAt) return

    const tick = () => {
      // While paused, freeze at the remaining time captured at pause moment.
      const reference = game.dispersalPausedAt || Date.now()
      const remaining = Math.max(0, Math.ceil((game.dispersalEndsAt - reference) / 1000))
      setSecondsLeft(remaining)
      // Auto-start the live game when time runs out (host only, not while paused)
      if (remaining <= 0 && isHost && !game.dispersalPausedAt) {
        startLive(roomCode, game.boundary).catch(() => {})
      }
    }
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [game?.dispersalEndsAt, game?.dispersalPausedAt, isHost, roomCode])

  const isIt = role === 'it'
  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : '--'
  const secs = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : '--'
  const accent = isIt ? 'var(--red)' : 'var(--green)'
  const glowColor = isIt ? 'var(--red-glow)' : 'var(--green-glow)'

  const showBigCount = secondsLeft != null && secondsLeft <= 3 && !game?.dispersalPausedAt

  return (
    <div
      className="screen screen-padded"
      style={{
        justifyContent: 'center',
        alignItems: 'center',
        gap: 36,
        background: `radial-gradient(ellipse at 50% 40%, ${glowColor} 0%, transparent 65%), var(--bg)`,
      }}
    >
      {/* Role-reveal splash */}
      {showReveal && (
        <div
          className="role-reveal"
          style={{ background: `radial-gradient(ellipse at center, ${glowColor} 0%, rgba(0,0,0,.96) 70%)` }}
        >
          <div className="role-reveal-icon">{isIt ? '🔴' : '🏃'}</div>
          <div className="title-lg" style={{ color: accent }}>
            {isIt ? 'YOU ARE IT' : 'YOU ARE A RUNNER'}
          </div>
          <div className="subtitle" style={{ maxWidth: 280 }}>
            {isIt ? 'Hunt down every runner once the timer hits zero' : 'Hide and survive — don’t get tagged!'}
          </div>
        </div>
      )}

      {/* Big 3·2·1·GO overlay */}
      {showBigCount && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5500,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,.45)', pointerEvents: 'none',
        }}>
          <div key={secondsLeft} className="count-big" style={{ color: secondsLeft === 0 ? accent : '#fff' }}>
            {secondsLeft === 0 ? 'GO!' : secondsLeft}
          </div>
        </div>
      )}

      {/* Icon + role */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%',
          background: `${isIt ? 'rgba(255,59,59,' : 'rgba(0,230,118,'}0.1)`,
          border: `2px solid ${accent}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 42,
          boxShadow: `0 0 32px ${glowColor}`,
        }}>
          {isIt ? '🙈' : '🏃'}
        </div>
        <div className="title" style={{ color: accent }}>
          {isIt ? 'WAIT HERE' : 'RUN!'}
        </div>
        <div className="subtitle" style={{ marginTop: 6 }}>
          {isIt ? 'You cannot move until the timer ends' : 'Scatter within the boundary!'}
        </div>
      </div>

      {/* Countdown */}
      <div style={{ textAlign: 'center' }}>
        <div
          className="countdown-ring"
          style={{
            color: accent,
            textShadow: `0 0 40px ${glowColor}`,
          }}
        >
          {mins}:{secs}
        </div>
        <div className="subtitle" style={{ marginTop: 10 }}>
          {isPaused
            ? '⏸ Paused by host'
            : isIt ? 'until the chase begins' : 'until "It" is released'}
        </div>
      </div>

      {/* Host pause / resume */}
      {isHost && (
        <button
          className={`btn ${isPaused ? 'btn-green' : 'btn-secondary'}`}
          style={{ width: '100%' }}
          onClick={() => (isPaused ? resumeDispersal(roomCode) : pauseDispersal(roomCode))}
        >
          {isPaused ? '▶ Resume Timer' : '⏸ Pause Timer'}
        </button>
      )}

      {/* Info card */}
      <div
        className="card"
        style={{
          width: '100%',
          borderColor: isIt ? 'rgba(255,59,59,.25)' : 'rgba(0,230,118,.25)',
          textAlign: 'center',
        }}
      >
        {isIt ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6, color: 'var(--red)' }}>
              3 REVEALS READY
            </div>
            <div className="subtitle" style={{ fontSize: 13 }}>
              Use Reveal Runner or Cluster Scan once the game starts
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6, color: 'var(--green)' }}>
              STAY INSIDE THE BOUNDARY
            </div>
            <div className="subtitle" style={{ fontSize: 13 }}>
              Power-ups will appear on the map — walk over them to collect
            </div>
          </>
        )}
      </div>
    </div>
  )
}
