import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStats, getAchievements, clearStats } from '../utils/stats.js'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const [confirmReset, setConfirmReset] = useState(false)
  const stats = getStats()
  const achievements = getAchievements()
  const unlockedCount = achievements.filter(a => a.unlocked).length

  function handleReset() {
    clearStats()
    setConfirmReset(false)   // re-render re-reads cleared stats
  }

  const longest = stats.longestSurvival
    ? `${Math.floor(stats.longestSurvival / 60)}:${String(stats.longestSurvival % 60).padStart(2, '0')}`
    : '—'

  return (
    <div className="screen screen-padded">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-pill" onClick={() => navigate('/')}>← Back</button>
        <div className="title" style={{ fontSize: 22 }}>Your Stats</div>
      </div>

      <div className="subtitle" style={{ fontSize: 12, marginTop: -8 }}>
        Saved on this device
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--blue)' }}>{stats.gamesPlayed}</div>
          <div className="stat-label">Games</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.wins}</div>
          <div className="stat-label">Wins</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--red)' }}>{stats.totalTags}</div>
          <div className="stat-label">Tags</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--yellow)', fontSize: 24 }}>
            {stats.gamesPlayed ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0}%
          </div>
          <div className="stat-label">Win rate</div>
        </div>
        <div className="stat-tile">
          <div className="stat-value" style={{ color: 'var(--purple)', fontSize: 24 }}>{longest}</div>
          <div className="stat-label">Best survival</div>
        </div>
      </div>

      {/* Achievements */}
      <div className="card" style={{ flex: 1 }}>
        <div className="label" style={{ marginBottom: 12 }}>
          Achievements — {unlockedCount}/{achievements.length}
        </div>
        <div className="achievement-grid">
          {achievements.map(a => (
            <div
              key={a.id}
              className={`achievement-cell ${a.unlocked ? 'unlocked' : 'locked'}`}
              title={a.desc}
            >
              <span className="achievement-emoji">{a.unlocked ? a.emoji : '🔒'}</span>
              <span className="achievement-name">{a.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reset stats */}
      {confirmReset ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'rgba(255,59,59,.3)' }}>
          <div className="subtitle" style={{ textAlign: 'center' }}>
            Wipe all stats and achievements on this device? This can't be undone.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleReset}
            >
              Reset everything
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-ghost"
          style={{ borderColor: 'rgba(255,59,59,.35)', color: 'var(--red)' }}
          onClick={() => setConfirmReset(true)}
        >
          🗑️ Reset stats
        </button>
      )}

      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back to Home
      </button>
    </div>
  )
}
