import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectAllPlayers, selectIsHost } from '../store/gameStore.js'
import { subscribeToGame, resetGameToLobby, HOST_STALE_MS } from '../services/gameService.js'
import { recordGameResult, ACHIEVEMENTS } from '../utils/stats.js'
import { recordGameToCloud } from '../services/statsCloud.js'
import { getAccount } from '../services/authService.js'
import { usePresence } from '../hooks/useLocation.js'

const CONFETTI_COLORS = ['#ff3b3b', '#00e676', '#448aff', '#ffd600', '#d500f9', '#ff9100']

export default function GameOverScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const players = useGameStore(selectAllPlayers)
  const isHost = useGameStore(selectIsHost)
  const clearSession = useGameStore(s => s.clearSession)
  const [unlocked, setUnlocked] = useState([])
  const [rematchBusy, setRematchBusy] = useState(false)
  const recordedRef = useRef(false)

  // Keep heartbeating at game over so a vanished host can be detected and any
  // remaining player can take over the rematch.
  usePresence(roomCode, uid)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      // Host started a rematch — everyone goes back to the same lobby.
      if (g.status === 'LOBBY') navigate('/lobby')
      if (g.status === 'DISPERSAL') navigate('/dispersal')
      if (g.status === 'LIVE') navigate('/game')
    })
    return unsub
  }, [roomCode])

  async function handleRematch() {
    setRematchBusy(true)
    // Pass our uid so we claim host if the original host has left.
    try { await resetGameToLobby(roomCode, uid) } catch { setRematchBusy(false) }
    // Navigation happens via the LOBBY status update above.
  }

  // Has the host left/gone stale? Then a remaining player may start the rematch.
  const hostPlayer = game?.players?.[game?.hostId]
  const hostGone = !!game && (!hostPlayer ||
    Date.now() - (hostPlayer.lastSeen || hostPlayer.joinedAt || 0) > HOST_STALE_MS)
  const canRematch = isHost || hostGone

  const winner = game?.winner ? game.players?.[game.winner] : null
  const isWinner = game?.winner === uid
  const survival = game?.mode === 'survival'
  const me = game?.players?.[uid]
  const sorted = [...players].sort((a, b) => (b.tagCount || 0) - (a.tagCount || 0))
  const medals = ['🥇', '🥈', '🥉']

  // MVP awards computed from final state
  const mostTags = [...players].sort((a, b) => (b.tagCount || 0) - (a.tagCount || 0))[0]
  const awards = []
  if (mostTags && (mostTags.tagCount || 0) > 0) {
    awards.push({ emoji: '🎯', title: 'Top Hunter', name: mostTags.name, detail: `${mostTags.tagCount} tags` })
  }
  if (winner) {
    awards.push({ emoji: survival ? '🛡️' : '🏆', title: survival ? 'Last Survivor' : 'Champion', name: winner.name, detail: '' })
  }

  // Record stats once when we land here with a finished game
  useEffect(() => {
    if (recordedRef.current || !game || game.status !== 'GAME_OVER' || !me) return
    recordedRef.current = true

    const liveStartMs = game.liveStartedAt?.toMillis?.() ?? null
    const survivedFullRound = survival && me.role === 'runner' && !me.isEliminated

    // How long I lasted this game (survival only)
    let survivedSecs = 0
    if (survival && liveStartMs) {
      const endMs = me.isEliminated && me.eliminatedAt ? me.eliminatedAt : Date.now()
      survivedSecs = Math.max(0, (endMs - liveStartMs) / 1000)
    }

    const result = {
      // Unique per game instance, so rematches in the same room each count
      gameCode: `${roomCode}-${liveStartMs ?? game.liveStartedAt ?? ''}`,
      mode: game.mode || 'classic',
      role: me.role,
      won: isWinner,
      tags: me.tagCount || 0,
      survivedFullRound,
      survivedSecs,
      wasTagged: me.role === 'it' || me.isEliminated,
    }
    const newly = recordGameResult(result)
    if (newly.length) setUnlocked(newly)

    // Mirror to the cloud if the player has an account (cross-device stats).
    const account = getAccount()
    if (account.signedIn) recordGameToCloud(account.uid, result).catch(() => {})
  }, [game?.status])

  const unlockedDefs = ACHIEVEMENTS.filter(a => unlocked.includes(a.id))

  return (
    <div
      className="screen screen-padded"
      style={{
        justifyContent: 'center',
        background: `radial-gradient(ellipse at 50% 0%, ${isWinner ? 'rgba(0,230,118,.09)' : 'rgba(255,59,59,.07)'} 0%, transparent 60%), var(--bg)`,
      }}
    >
      {/* Confetti for the winner */}
      {isWinner && (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div
              key={i}
              className="confetti-piece"
              style={{
                left: `${Math.random() * 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDuration: `${2 + Math.random() * 2}s`,
                animationDelay: `${Math.random() * 1.5}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Hero result */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2 }}>
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
            <span style={{ color: 'var(--yellow)', fontFamily: 'var(--font-display)' }}>
              {winner.name}
            </span>
            {survival ? ' survived the longest' : ' is the last runner standing'}
          </div>
        )}
      </div>

      {/* Newly unlocked achievements */}
      {unlockedDefs.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(255,214,0,.4)', position: 'relative', zIndex: 2 }}>
          <div className="label" style={{ marginBottom: 10, color: 'var(--yellow)' }}>
            🎉 Achievement{unlockedDefs.length > 1 ? 's' : ''} Unlocked!
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {unlockedDefs.map(a => (
              <div key={a.id} className="badge-pop" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 26 }}>{a.emoji}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 12, color: 'var(--yellow)' }}>{a.name}</div>
                  <div className="subtitle" style={{ fontSize: 11 }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MVP awards */}
      {awards.length > 0 && (
        <div style={{ display: 'flex', gap: 8, position: 'relative', zIndex: 2 }}>
          {awards.map((a, i) => (
            <div key={i} className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: 24 }}>{a.emoji}</div>
              <div className="label" style={{ margin: '6px 0 2px' }}>{a.title}</div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
              {a.detail && <div className="subtitle" style={{ fontSize: 11 }}>{a.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Leaderboard */}
      <div className="card" style={{ position: 'relative', zIndex: 2 }}>
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
                fontFamily: 'var(--font-display)', color: 'var(--text-muted)',
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
                  {p.isEliminated ? ' · eliminated' : ''}
                </div>
              </div>
              {isThisWinner && <span className="badge badge-yellow">WINNER</span>}
            </div>
          )
        })}
      </div>

      {/* Rematch / leave */}
      <div style={{ marginTop: 'auto', position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {canRematch ? (
          <button className="btn btn-primary" onClick={handleRematch} disabled={rematchBusy}>
            {rematchBusy
              ? <span className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              : isHost ? '🔄 Play Again — same group' : '🔄 Play Again (you’ll host)'}
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '16px' }}>
            <div className="pulse" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              Waiting for host to start a rematch…
            </div>
          </div>
        )}
        <button className="btn btn-ghost" onClick={() => { clearSession(); navigate('/') }}>
          Leave Game
        </button>
      </div>
    </div>
  )
}
