import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectAllPlayers } from '../store/gameStore.js'
import { subscribeToGame } from '../services/gameService.js'

export default function GameOverScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const players = useGameStore(selectAllPlayers)
  const clearSession = useGameStore(s => s.clearSession)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, setGame)
    return unsub
  }, [roomCode])

  const winner = game?.winner ? game.players?.[game.winner] : null
  const isWinner = game?.winner === uid

  const sorted = [...players].sort((a, b) => (b.tagCount || 0) - (a.tagCount || 0))

  return (
    <div className="screen screen-padded" style={{ justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 72, marginBottom: 8 }}>
          {isWinner ? '🏆' : '💀'}
        </div>
        <div className="title">
          {isWinner ? 'You survived!' : 'Game Over'}
        </div>
        {winner && (
          <div className="subtitle" style={{ marginTop: 8, fontSize: 18 }}>
            <span style={{ color: 'var(--yellow)', fontWeight: 700 }}>{winner.name}</span>
            {' '}is the last runner standing!
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 8 }}>
        <div className="label" style={{ marginBottom: 12 }}>Leaderboard</div>
        {sorted.map((p, i) => (
          <div key={p.id} className="player-row">
            <div style={{ width: 28, textAlign: 'center', fontSize: 18 }}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
            </div>
            <div className="player-avatar">
              {p.name[0].toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>
                {p.name} {p.id === uid ? '(You)' : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {p.tagCount || 0} tags
              </div>
            </div>
            {p.id === game?.winner && <span className="badge badge-yellow">WINNER</span>}
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: 'auto' }}
        onClick={() => { clearSession(); navigate('/') }}
      >
        Play Again
      </button>
    </div>
  )
}
