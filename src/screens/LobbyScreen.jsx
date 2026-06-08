import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectIsHost, selectAllPlayers } from '../store/gameStore.js'
import { subscribeToGame } from '../services/gameService.js'

export default function LobbyScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const isHost = useGameStore(selectIsHost)
  const players = useGameStore(selectAllPlayers)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'SELECTING_IT') navigate('/setup')
      if (g.status === 'DISPERSAL') navigate('/dispersal')
      if (g.status === 'LIVE') navigate('/game')
    })
    return unsub
  }, [roomCode])

  return (
    <div className="screen screen-padded">
      <div>
        <div className="label">Room Code</div>
        <div style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: '0.25em',
          color: 'var(--yellow)',
        }}>
          {roomCode}
        </div>
        <div className="subtitle" style={{ marginTop: 4 }}>Share this with your friends</div>
      </div>

      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>
          Players ({players.length})
        </div>
        {players.map(p => (
          <div key={p.id} className="player-row">
            <div className="player-avatar" style={{ background: avatarColor(p.name) }}>
              {p.name[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{p.name}</div>
            </div>
            {p.isHost && <span className="badge badge-yellow">Host</span>}
            {p.id === uid && <span className="badge badge-blue">You</span>}
          </div>
        ))}
      </div>

      {isHost ? (
        <div style={{ marginTop: 'auto' }}>
          <button
            className="btn btn-primary"
            disabled={players.length < 2}
            onClick={() => navigate('/setup')}
          >
            Start Setup →
          </button>
          {players.length < 2 && (
            <div className="subtitle" style={{ textAlign: 'center', marginTop: 8 }}>
              Need at least 2 players
            </div>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', marginTop: 'auto' }}>
          <div className="pulse" style={{ color: 'var(--text-muted)' }}>
            Waiting for host to start…
          </div>
        </div>
      )}
    </div>
  )
}

function avatarColor(name) {
  const colors = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#db2777']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}
