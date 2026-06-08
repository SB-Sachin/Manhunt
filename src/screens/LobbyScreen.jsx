import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectIsHost, selectAllPlayers } from '../store/gameStore.js'
import { subscribeToGame } from '../services/gameService.js'

export default function LobbyScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame } = useGameStore()
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

      {/* Header */}
      <div>
        <div className="label">Room Code</div>
        <div className="room-code">{roomCode}</div>
        <div className="subtitle" style={{ marginTop: 6 }}>
          Share this code with your friends
        </div>
      </div>

      <div className="divider" />

      {/* Player list */}
      <div className="card" style={{ flex: 1 }}>
        <div className="label" style={{ marginBottom: 4 }}>
          Players — {players.length} joined
        </div>
        {players.map(p => (
          <div key={p.id} className="player-row">
            <div
              className="player-avatar"
              style={{ background: avatarColor(p.name) + '22', border: `2px solid ${avatarColor(p.name)}` }}
            >
              <span style={{ color: avatarColor(p.name) }}>{p.name[0].toUpperCase()}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {p.isHost && <span className="badge badge-yellow">Host</span>}
              {p.id === uid && <span className="badge badge-blue">You</span>}
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      {isHost ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            disabled={players.length < 2}
            onClick={() => navigate('/setup')}
          >
            Setup Game →
          </button>
          {players.length < 2 && (
            <p className="subtitle" style={{ textAlign: 'center' }}>
              Waiting for at least 2 players
            </p>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div className="pulse" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Waiting for host to start the game…
          </div>
        </div>
      )}
    </div>
  )
}

function avatarColor(name) {
  const colors = ['#ff3b3b','#448aff','#00e676','#ffd600','#d500f9','#ff9100']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}
