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

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div
      className="screen screen-padded"
      style={{
        justifyContent: 'center',
        background: `radial-gradient(ellipse at 50% 0%, ${isWinner ? 'rgba(0,230,118,.09)' : 'rgba(255,59,59,.07)'} 0%, transparent 60%), var(--bg)`,
      }}
    >
      {/* Hero result */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 96, height: 96, borderRadius: '50%',
          background: isWinner ? 'rgba(0,230,118,.1)' : 'rgba(255,59,59,.1)',
          border: `2px solid ${isWinner ? 'var(--green)' : 'var(--red)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 48,
          boxShadow: `0 0 40px ${isWinner ? 'var(--green-glow)' : 'var(--red-glow)'}`,
        }}>
          {isWinner ? '🏆' : '💀'}
        </div>

        <div className="title" style={{ color: isWinner ? 'var(--green)' : 'var(--red)' }}>
          {isWinner ? 'YOU SURVIVED' : 'GAME OVER'}
        </div>

        {winner && (
          <div className="subtitle" style={{ marginTop: 8, fontSize: 15 }}>
            <span style={{
              color: 'var(--yellow)',
              fontFamily: 'var(--font-display)',
            }}>
              {winner.name}
            </span>
            {' '}is the last runner standing
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="card">
        <div className="label" style={{ marginBottom: 12 }}>Leaderboard</div>
        {sorted.map((p, i) => {
          const isThisWinner = p.id === game?.winner
          return (
            <div
              key={p.id}
              className="player-row"
              style={{
                padding: '13px 8px',
                borderRadius: 'var(--radius-sm)',
                background: isThisWinner ? 'rgba(255,214,0,.06)' : 'transparent',
                borderBottom: i < sorted.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div style={{
                width: 28, textAlign: 'center', fontSize: 18,
                fontFamily: 'var(--font-display)',
                color: 'var(--text-muted)',
              }}>
                {i < 3 ? medals[i] : `${i + 1}`}
              </div>
              <div
                className="player-avatar"
                style={{
                  background: isThisWinner ? 'rgba(255,214,0,.12)' : 'var(--surface2)',
                  border: `2px solid ${isThisWinner ? 'var(--yellow)' : 'transparent'}`,
                }}
              >
                <span style={{ color: isThisWinner ? 'var(--yellow)' : 'var(--text)' }}>
                  {p.name[0].toUpperCase()}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>
                  {p.name}{p.id === uid ? ' (You)' : ''}
                </div>
                <div className="subtitle" style={{ fontSize: 12 }}>
                  {p.tagCount || 0} tag{p.tagCount !== 1 ? 's' : ''}
                </div>
              </div>
              {isThisWinner && <span className="badge badge-yellow">WINNER</span>}
            </div>
          )
        })}
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
