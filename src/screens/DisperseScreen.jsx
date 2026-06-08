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

  // Start streaming location for everyone during dispersal
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

  // Countdown from dispersalSecs
  useEffect(() => {
    if (!game?.dispersalStartedAt || !game?.dispersalSecs) return

    const startMs = game.dispersalStartedAt.toMillis
      ? game.dispersalStartedAt.toMillis()
      : game.dispersalStartedAt

    const endMs = startMs + game.dispersalSecs * 1000

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endMs - Date.now()) / 1000))
      setSecondsLeft(remaining)

      if (remaining <= 0 && isHost) {
        startLive(roomCode, game.boundary).catch(() => {})
      }
    }

    tick()
    const interval = setInterval(tick, 500)
    return () => clearInterval(interval)
  }, [game?.dispersalStartedAt, game?.dispersalSecs, isHost, roomCode])

  const mins = secondsLeft != null ? Math.floor(secondsLeft / 60) : '--'
  const secs = secondsLeft != null ? String(secondsLeft % 60).padStart(2, '0') : '--'

  const isIt = role === 'it'

  return (
    <div className="screen screen-padded" style={{ justifyContent: 'center', alignItems: 'center', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>
          {isIt ? '🙈' : '🏃'}
        </div>
        <div className="title">
          {isIt ? 'Wait here…' : 'RUN!'}
        </div>
        <div className="subtitle" style={{ marginTop: 4 }}>
          {isIt
            ? '"It" players must wait for the timer'
            : 'Scatter within the boundary!'}
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <div className="countdown-ring" style={{ color: isIt ? 'var(--red)' : 'var(--green)' }}>
          {mins}:{secs}
        </div>
        <div className="subtitle" style={{ marginTop: 8 }}>
          {isIt ? 'until you can chase' : 'until "It" is released'}
        </div>
      </div>

      {!isIt && (
        <div className="card" style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Stay inside the boundary • Power-ups appear on the map soon
          </div>
        </div>
      )}

      {isIt && (
        <div className="card" style={{ textAlign: 'center', width: '100%' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>You have 3 reveals</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Use them wisely once the game starts
          </div>
        </div>
      )}
    </div>
  )
}
