import { useNavigate } from 'react-router-dom'
import { getStats, getAchievements } from '../utils/stats.js'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const stats = getStats()
  const achievements = getAchievements()
  const unlockedCount = achievements.filter(a => a.unlocked).length

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

      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back to Home
      </button>
    </div>
  )
}
