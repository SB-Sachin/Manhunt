import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '../store/gameStore.js'
import { lookupGame, joinGame } from '../services/gameService.js'
import { requestLocationPermission } from '../hooks/useLocation.js'

/*
 * Per-game shareable link: /g/:code
 *  - Already a member (same anonymous uid) → silent rejoin, forward to the lobby
 *    (the lobby's status subscription forwards to live/dispersal/gameover).
 *  - Game in LOBBY, not a member → prompt for a name and join.
 *  - Game already started, not a member → can't join.
 */
export default function JoinRoom() {
  const navigate = useNavigate()
  const { code: rawCode } = useParams()
  const code = (rawCode || '').toUpperCase()

  const authReady = useGameStore(s => s.authReady)
  const setSession = useGameStore(s => s.setSession)
  const persistedName = useGameStore(s => s.displayName)

  const [phase, setPhase] = useState('checking')   // checking | join | started | notfound | error
  const [name, setName] = useState(persistedName || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Look up the game once auth (uid) is ready
  useEffect(() => {
    if (!authReady || !code) return
    let cancelled = false
    ;(async () => {
      try {
        const { game, isMember, name: existingName, uid } = await lookupGame(code)
        if (cancelled) return
        if (!game) { setPhase('notfound'); return }
        if (isMember) {
          // Returning player — restore session and re-enter.
          setSession(uid, existingName, code)
          navigate('/lobby', { replace: true })
          return
        }
        if (game.status !== 'LOBBY') { setPhase('started'); return }
        setPhase('join')
      } catch {
        if (!cancelled) setPhase('error')
      }
    })()
    return () => { cancelled = true }
  }, [authReady, code])

  async function handleJoin() {
    if (!name.trim()) return setError('Enter your name')
    setLoading(true); setError('')
    try {
      await requestLocationPermission()
      const result = await joinGame(code, name.trim())
      setSession(result.uid, name.trim(), result.code)
      navigate('/lobby', { replace: true })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Loading / checking
  if (phase === 'checking' || !authReady) {
    return (
      <div className="screen" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (phase === 'notfound' || phase === 'started' || phase === 'error') {
    const msg = phase === 'notfound'
      ? "That game doesn't exist anymore."
      : phase === 'started'
        ? 'This game has already started — ask the host for a fresh link.'
        : 'Something went wrong. Try again.'
    return (
      <div className="screen screen-padded" style={{ justifyContent: 'center', alignItems: 'center', gap: 18, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>🚫</div>
        <div className="title" style={{ fontSize: 22 }}>Can't join</div>
        <div className="subtitle">{msg}</div>
        <button className="btn btn-primary" onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </button>
      </div>
    )
  }

  // phase === 'join'
  return (
    <div
      className="screen screen-padded"
      style={{
        justifyContent: 'center',
        gap: 24,
        background: 'radial-gradient(ellipse at 50% 0%, rgba(68,138,255,.08) 0%, transparent 60%), var(--bg)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 8 }}>🎮</div>
        <div className="title">Join Game</div>
        <div className="room-code" style={{ fontSize: 28, marginTop: 8 }}>{code}</div>
      </div>

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

      {error && <div className="error-text">{error}</div>}

      <button
        className="btn btn-green"
        onClick={handleJoin}
        disabled={loading}
      >
        {loading ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} /> : null}
        {loading ? 'Joining…' : 'Join Room'}
      </button>

      <div className="subtitle" style={{ textAlign: 'center', fontSize: 11 }}>
        Location access is required to play
      </div>
    </div>
  )
}
