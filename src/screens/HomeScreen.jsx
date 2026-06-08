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
  const [mode, setMode] = useState(null) // 'create' | 'join'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) return setError('Enter your name')
    setLoading(true)
    setError('')
    try {
      await requestLocationPermission()
      const { code, uid } = await createGame(name.trim(), dispersalMins * 60)
      setSession(uid, name.trim(), code)
      navigate('/lobby')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name')
    if (!code.trim()) return setError('Enter a room code')
    setLoading(true)
    setError('')
    try {
      await requestLocationPermission()
      const result = await joinGame(code.trim(), name.trim())
      setSession(result.uid, name.trim(), result.code)
      navigate('/lobby')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen screen-padded" style={{ justifyContent: 'center', minHeight: '100dvh' }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🏃</div>
        <div className="title">Manhunt</div>
        <div className="subtitle" style={{ marginTop: 4 }}>Real-world chase game</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className={`btn ${mode === 'create' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setMode('create'); setError('') }}
        >
          Create Game
        </button>
        <button
          className={`btn ${mode === 'join' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => { setMode('join'); setError('') }}
        >
          Join Game
        </button>
      </div>

      {mode && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
                placeholder="e.g. A3B9XZ"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em', fontSize: 20 }}
              />
            </div>
          )}

          {mode === 'create' && (
            <div>
              <div className="label">Dispersal Time</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[1, 2, 3, 5].map(m => (
                  <button
                    key={m}
                    className={`btn ${dispersalMins === m ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1, padding: '10px 0' }}
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
            className="btn btn-primary"
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
          >
            {loading ? 'Loading…' : mode === 'create' ? 'Create Room' : 'Join Room'}
          </button>
        </div>
      )}

      <div className="subtitle" style={{ textAlign: 'center', fontSize: 12, marginTop: 16 }}>
        Location access is required to play
      </div>
    </div>
  )
}
