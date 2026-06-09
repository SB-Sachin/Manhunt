import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '../store/gameStore.js'
import { fetchLeaderboard } from '../services/statsCloud.js'
import { getAccount } from '../services/authService.js'

const METRICS = [
  { key: 'wins', label: 'Wins' },
  { key: 'totalTags', label: 'Tags' },
  { key: 'gamesPlayed', label: 'Games' },
]

const MEDALS = ['🥇', '🥈', '🥉']

export default function LeaderboardScreen() {
  const navigate = useNavigate()
  const myUid = useGameStore(s => s.uid)
  const account = getAccount()

  const [metric, setMetric] = useState('wins')
  const [rows, setRows] = useState(null)   // null = loading
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setRows(null); setError('')
    fetchLeaderboard(metric, 50)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(() => { if (!cancelled) setError('Could not load the leaderboard.') })
    return () => { cancelled = true }
  }, [metric])

  const metricLabel = METRICS.find(m => m.key === metric)?.label

  return (
    <div className="screen screen-padded">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-pill" onClick={() => navigate('/')}>← Back</button>
        <div className="title" style={{ fontSize: 22 }}>🏆 Leaderboard</div>
      </div>

      {/* Metric switch */}
      <div style={{ display: 'flex', gap: 8 }}>
        {METRICS.map(m => (
          <button
            key={m.key}
            className={`btn-pill ${metric === m.key ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setMetric(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
        {rows === null && <div className="spinner" style={{ marginTop: 24 }} />}

        {error && <div className="error-text">{error}</div>}

        {rows && rows.length === 0 && !error && (
          <div className="subtitle" style={{ textAlign: 'center', padding: '24px 8px' }}>
            No ranked players yet. Create an account and win a game to get on the board!
          </div>
        )}

        {rows && rows.map((r, i) => {
          const isMe = r.uid === myUid
          return (
            <div
              key={r.uid}
              className="player-row"
              style={{
                padding: '12px 8px', margin: '0 -8px', borderRadius: 'var(--radius-sm)',
                background: isMe ? 'rgba(68,138,255,.08)' : 'transparent',
              }}
            >
              <div style={{
                width: 30, textAlign: 'center', fontSize: 16,
                fontFamily: 'var(--font-display)', color: 'var(--text-muted)',
              }}>
                {i < 3 ? MEDALS[i] : `${i + 1}`}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600, fontSize: 15,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.displayName || 'Player'}{isMe ? ' (You)' : ''}
                </div>
                <div className="subtitle" style={{ fontSize: 11 }}>
                  {r.wins || 0}W · {r.totalTags || 0} tags · {r.gamesPlayed || 0} games
                </div>
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 20,
                color: 'var(--yellow)',
              }}>
                {r[metric] || 0}
              </div>
            </div>
          )
        })}
      </div>

      {!account.signedIn && (
        <div className="subtitle" style={{ textAlign: 'center', fontSize: 12 }}>
          Create an account on the Stats page to appear here.
        </div>
      )}

      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back to Home
      </button>
    </div>
  )
}
