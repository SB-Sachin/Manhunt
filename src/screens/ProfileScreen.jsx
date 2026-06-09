import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getStats, getAchievements, clearStats } from '../utils/stats.js'
import {
  getAccount, signInWithGoogle, signInWithEmail,
  signOutAccount, deleteAccount, authErrorMessage,
} from '../services/authService.js'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const [tick, setTick] = useState(0)          // bump to re-read stats/account
  const refresh = () => setTick(t => t + 1)

  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [isAdult, setIsAdult] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const account = getAccount()
  const stats = getStats()
  const achievements = getAchievements()
  const unlockedCount = achievements.filter(a => a.unlocked).length

  const longest = stats.longestSurvival
    ? `${Math.floor(stats.longestSurvival / 60)}:${String(stats.longestSurvival % 60).padStart(2, '0')}`
    : '—'

  // After SessionBoot pulls cloud stats, reflect them
  useEffect(() => { const t = setTimeout(refresh, 400); return () => clearTimeout(t) }, [])

  async function run(fn) {
    setBusy(true); setError('')
    try {
      await fn()
      setShowSignIn(false)
      setPassword('')
      refresh()
    } catch (e) {
      console.error('[auth]', e.code, e.message, e)
      setError(authErrorMessage(e.code))
    } finally {
      setBusy(false)
    }
  }

  function handleReset() {
    clearStats()
    setConfirmReset(false)
    refresh()
  }

  return (
    <div className="screen screen-padded">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-pill" onClick={() => navigate('/')}>← Back</button>
        <div className="title" style={{ fontSize: 22 }}>Your Stats</div>
      </div>

      <div className="subtitle" style={{ fontSize: 12, marginTop: -8 }}>
        {account.signedIn ? 'Synced to your account' : 'Saved on this device'}
      </div>

      {/* ── Account card ── */}
      {account.signedIn ? (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="player-avatar" style={{ background: 'rgba(0,230,118,.12)', border: '2px solid var(--green)' }}>
            <span style={{ color: 'var(--green)' }}>{(account.displayName || account.email || '?')[0].toUpperCase()}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Signed in ✓</div>
            <div className="subtitle" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {account.email || account.displayName}
            </div>
          </div>
          <button className="btn-pill" disabled={busy} onClick={() => run(signOutAccount)}>
            Sign out
          </button>
        </div>
      ) : !showSignIn ? (
        <button className="btn btn-secondary" onClick={() => { setShowSignIn(true); setError('') }}>
          🔐 Create Account
        </button>
      ) : (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="label" style={{ marginBottom: 0 }}>Create your account</div>
          <div className="subtitle" style={{ fontSize: 12, marginTop: -4 }}>
            Optional — saves your stats so they follow you to any device. Already
            have one? Use the same Google or email to sign back in.
          </div>

          {/* Age gate */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isAdult}
              onChange={e => setIsAdult(e.target.checked)}
              style={{ width: 20, height: 20, accentColor: 'var(--green)' }}
            />
            I'm 13 or older
          </label>

          <button
            className="btn btn-secondary"
            disabled={!isAdult || busy}
            onClick={() => run(signInWithGoogle)}
          >
            {busy ? <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> : '🇬 '}
            Continue with Google
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="divider" style={{ flex: 1 }} />
            <span className="subtitle" style={{ fontSize: 11 }}>or email</span>
            <div className="divider" style={{ flex: 1 }} />
          </div>

          <input
            className="input" type="email" placeholder="Email" autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)} disabled={!isAdult}
          />
          <input
            className="input" type="password" placeholder="Password (6+ chars)" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} disabled={!isAdult}
          />

          {error && <div className="error-text">{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowSignIn(false); setError('') }}>
              Cancel
            </button>
            <button
              className="btn btn-green" style={{ flex: 2 }}
              disabled={!isAdult || !email.trim() || !password || busy}
              onClick={() => run(() => signInWithEmail(email, password))}
            >
              Save stats
            </button>
          </div>
          <div className="subtitle" style={{ fontSize: 11 }}>
            Under 13? Just keep playing — your stats stay saved on this device.
          </div>
        </div>
      )}

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

      {/* Danger zone: reset (local) / delete (account) */}
      {account.signedIn ? (
        confirmDelete ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'rgba(255,59,59,.3)' }}>
            <div className="subtitle" style={{ textAlign: 'center' }}>
              Delete your account and all saved stats? This can't be undone.
            </div>
            {error && <div className="error-text">{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setConfirmDelete(false); setError('') }}>
                Cancel
              </button>
              <button
                className="btn btn-primary" style={{ flex: 1 }} disabled={busy}
                onClick={() => run(async () => { await deleteAccount(); setConfirmDelete(false) })}
              >
                Delete account
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn btn-ghost"
            style={{ borderColor: 'rgba(255,59,59,.35)', color: 'var(--red)' }}
            onClick={() => { setConfirmDelete(true); setError('') }}
          >
            🗑️ Delete account & data
          </button>
        )
      ) : (
        confirmReset ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, borderColor: 'rgba(255,59,59,.3)' }}>
            <div className="subtitle" style={{ textAlign: 'center' }}>
              Wipe all stats and achievements on this device? This can't be undone.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleReset}>
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
        )
      )}

      <button className="btn btn-primary" onClick={() => navigate('/')}>
        Back to Home
      </button>
    </div>
  )
}
