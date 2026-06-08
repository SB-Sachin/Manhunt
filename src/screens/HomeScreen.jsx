import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { createGame, joinGame } from '../services/gameService.js'
import { useGameStore } from '../store/gameStore.js'
import { requestLocationPermission } from '../hooks/useLocation.js'

export default function HomeScreen() {
  const navigate = useNavigate()
  const setSession = useGameStore(s => s.setSession)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [dispersalMins, setDispersal] = useState(2)
  const [mode, setMode] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name')
    setLoading(true); setError('')
    try {
      await requestLocationPermission()
      const { code, uid } = await createGame(name.trim(), dispersalMins * 60)
      setSession(uid, name.trim(), code)
      navigate('/lobby')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name')
    if (!code.trim()) return setError('Enter a room code')
    setLoading(true); setError('')
    try {
      await requestLocationPermission()
      const result = await joinGame(code.trim(), name.trim())
      setSession(result.uid, name.trim(), result.code)
      navigate('/lobby')
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="screen" style={{
      justifyContent: 'center',
      padding: '40px 24px calc(40px + var(--safe-bottom))',
      gap: 28,
      minHeight: '100dvh',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(255,59,59,.08) 0%, transparent 60%), var(--bg)',
    }}>
      {/* Hero */}
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,59,59,.1)',
          border: '1.5px solid rgba(255,59,59,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontSize: 36,
          boxShadow: '0 0 32px rgba(255,59,59,.2)',
        }}>🏃</div>
        <div className="title-lg" style={{ color: '#fff' }}>MANHUNT</div>
        <div className="subtitle" style={{ marginTop: 8 }}>
          Real-world GPS chase game
        </div>
      </div>

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setMode('create'); setError('') }}
        >
          Create Game
        </button>
        <button
          className={`btn ${mode === 'join' ? 'btn-secondary' : 'btn-ghost'}`}
          style={mode === 'join' ? { background: 'var(--blue)', color: '#fff', boxShadow: '0 4px 24px var(--blue-glow)' } : {}}
          onClick={() => { setMode('join'); setError('') }}
        >
          Join Game
        </button>
      </div>

      {/* Form */}
      {mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="label">Your Name</div>
            <input
              className="input"
              placeholder="e.g. Alex"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={20}
              autoFocus
            />
          </div>

          {mode === 'join' && (
            <div>
              <div className="label">Room Code</div>
              <input
                className="input"
                placeholder="A3B9XZ"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{
                  textTransform: 'uppercase',
                  letterSpacing: '0.28em',
                  fontSize: 22,
                  fontFamily: 'var(--font-display)',
                  textAlign: 'center',
                }}
              />
            </div>
          )}

          {mode === 'create' && (
            <div>
              <div className="label">Dispersal Timer</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 5].map(m => (
                  <button
                    key={m}
                    className={`btn-pill ${dispersalMins === m ? 'active' : ''}`}
                    style={{ flex: 1 }}
                    onClick={() => setDispersal(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="error-text">{error}</div>}

          <button
            className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-green'}`}
            style={mode === 'join' ? { background: 'var(--blue)', color: '#fff', boxShadow: '0 4px 24px var(--blue-glow)' } : {}}
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
          >
            {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : null}
            {loading ? 'Loading…' : mode === 'create' ? 'Create Room' : 'Join Room'}
          </button>
        </div>
      )}

      <div className="subtitle" style={{ textAlign: 'center', fontSize: 11 }}>
        Location access is required to play
      </div>
    </div>
  )
}
