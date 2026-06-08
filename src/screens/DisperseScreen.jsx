import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectMyRole, selectIsHost } from '../store/gameStore.js'
import { subscribeToGame, startLive } from '../services/gameService.js'
import { useLocationTracking } from '../hooks/useLocation.js'

export default function DisperseScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const role = useGameStore(selectMyRole)
  const isHost = useGameStore(selectIsHost)
  const [secondsLeft, setSecondsLeft] = useState(null)

  useLocationTracking(roomCode, uid, true)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'LIVE') navigate('/game')
      if (g.status === 'GAME_OVER') navigate('/gameover')
    })
    return unsub
  }, [roomCode])

  useEffect(() => {
    if (!game?.dispersalStartedAt || !game?.dispersalSecs) return
    const startMs = game.dispersalStartedAt?.toMillis?.() ?? game.dispersalStartedAt
    const endMs = startMs + game.dispersalSecs * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setSecondsLeft(remaining)
      if (remaining <= 0 && isHost) startLive(roomCode, game.boundary).catch(() => {})
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [game?.dispersalStartedAt, game?.dispersalSecs, isHost, roomCode])

  const isIt = role === 'it'
  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : '--'
  const secs = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : '--'
  const accent = isIt ? 'var(--red)' : 'var(--green)'
  const glowColor = isIt ? 'var(--red-glow)' : 'var(--green-glow)'

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
          {isIt ? 'until the chase begins' : 'until "It" is released'}
        </div>
      </div>

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
