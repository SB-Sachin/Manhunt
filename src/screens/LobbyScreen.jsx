import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectIsHost, selectAllPlayers, selectRealPlayers } from '../store/gameStore.js'
import {
  subscribeToGame, addGhostPlayer, kickPlayer, renamePlayer,
  setDispersalDuration, setGameMode, setRoundDuration, setProximityWarnings,
} from '../services/gameService.js'
import AdminSheet from '../components/AdminSheet.jsx'

export default function LobbyScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const isHost = useGameStore(selectIsHost)
  const players = useGameStore(selectAllPlayers)
  const realPlayers = useGameStore(selectRealPlayers)

  const [showAdmin, setShowAdmin] = useState(false)
  const [addingGhost, setAddingGhost] = useState(false)
  const [ghostName, setGhostName] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [customMins, setCustomMins] = useState('')

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'SELECTING_IT') navigate('/setup')
      if (g.status === 'DISPERSAL') navigate('/dispersal')
      if (g.status === 'LIVE') navigate('/game')
    })
    return unsub
  }, [roomCode])

  async function handleAddGhost() {
    const name = ghostName.trim()
    if (!name) return
    await addGhostPlayer(roomCode, name, uid)
    setGhostName('')
    setAddingGhost(false)
  }

  async function saveRename() {
    const name = editName.trim()
    if (name && editingId) await renamePlayer(roomCode, editingId, name)
    setEditingId(null)
    setEditName('')
  }

  // A ghost I added — I can manage it even if I'm not host
  const canManageGhost = (p) => p.isGhost && (isHost || p.addedBy === uid)

  // "Need 2 real players" gate — ghosts can't carry the game alone
  const enoughPlayers = realPlayers.length >= 2

  return (
    <div className="screen screen-padded">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div className="label">Room Code</div>
          <div className="room-code">{roomCode}</div>
          <div className="subtitle" style={{ marginTop: 6 }}>
            Share this code with your friends
          </div>
        </div>
        {isHost && (
          <button
            className="btn-pill"
            style={{ marginTop: 6 }}
            onClick={() => setShowAdmin(true)}
          >
            🛠️ Admin
          </button>
        )}
      </div>

      <div className="divider" />

      {/* Player list */}
      <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="label" style={{ marginBottom: 4 }}>
          Players — {players.length} joined
        </div>
        {players.map(p => {
          const isEditing = editingId === p.id
          return (
            <div key={p.id} className="player-row" style={{ flexWrap: 'wrap' }}>
              <div
                className="player-avatar"
                style={{ background: avatarColor(p.name) + '22', border: `2px solid ${avatarColor(p.name)}` }}
              >
                <span style={{ color: avatarColor(p.name) }}>{p.name[0].toUpperCase()}</span>
              </div>

              {isEditing ? (
                <input
                  className="input"
                  style={{ flex: 1, minHeight: 42 }}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  maxLength={20}
                  autoFocus
                />
              ) : (
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {isEditing ? (
                  <button className="btn-pill active" style={{ minHeight: 36 }} onClick={saveRename}>
                    Save
                  </button>
                ) : (
                  <>
                    {p.isHost && <span className="badge badge-yellow">Host</span>}
                    {p.id === uid && <span className="badge badge-blue">You</span>}
                    {p.isGhost && <span className="badge badge-purple">👻 Ghost</span>}
                    {/* Inline manage for a ghost I own (non-host shortcut) */}
                    {!isHost && canManageGhost(p) && (
                      <>
                        <button
                          className="btn-pill"
                          style={{ minHeight: 34, padding: '6px 10px' }}
                          onClick={() => { setEditingId(p.id); setEditName(p.name) }}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn-pill"
                          style={{ minHeight: 34, padding: '6px 10px', borderColor: 'rgba(255,59,59,.4)', color: 'var(--red)' }}
                          onClick={() => kickPlayer(roomCode, p.id)}
                        >
                          🚫
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Game mode (host) — syncs to all players */}
      {isHost && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="label" style={{ marginBottom: 0 }}>🎮 Game mode</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn ${(game?.mode ?? 'classic') === 'classic' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, minHeight: 46, fontSize: 12 }}
              onClick={() => setGameMode(roomCode, 'classic')}
            >
              Classic
            </button>
            <button
              className={`btn ${game?.mode === 'survival' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ flex: 1, minHeight: 46, fontSize: 12 }}
              onClick={() => setGameMode(roomCode, 'survival')}
            >
              Survival
            </button>
          </div>
          <div className="subtitle" style={{ fontSize: 12 }}>
            {game?.mode === 'survival'
              ? 'Tagged runners are eliminated, "It" stays "It", the zone shrinks, and the round is timed. Last survivor wins.'
              : 'Tagged runners join "It". Last runner standing wins.'}
          </div>

          {game?.mode === 'survival' && (
            <>
              <div className="label" style={{ marginBottom: 0, marginTop: 4 }}>
                Round length — {formatDuration(game?.roundSecs)}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[300, 600, 900, 1200].map(secs => (
                  <button
                    key={secs}
                    className={`btn-pill ${game?.roundSecs === secs ? 'active' : ''}`}
                    style={{ flex: '1 0 auto' }}
                    onClick={() => setRoundDuration(roomCode, secs)}
                  >
                    {formatDuration(secs)}
                  </button>
                ))}
              </div>
            </>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={game?.proximityWarnings !== false}
              onChange={e => setProximityWarnings(roomCode, e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--red)' }}
            />
            <span style={{ fontSize: 13 }}>
              Danger sense — runners feel a pulse when "It" is near
            </span>
          </label>
        </div>
      )}

      {/* Dispersal timer (host) — syncs to all players */}
      {isHost && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="label" style={{ marginBottom: 0 }}>
            ⏱ Dispersal timer — {formatDuration(game?.dispersalSecs)}
          </div>
          <div className="subtitle" style={{ fontSize: 12, marginTop: -4 }}>
            How long runners get to scatter before "It" is released
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[30, 60, 120, 180, 300].map(secs => (
              <button
                key={secs}
                className={`btn-pill ${game?.dispersalSecs === secs ? 'active' : ''}`}
                style={{ flex: '1 0 auto' }}
                onClick={() => { setDispersalDuration(roomCode, secs); setCustomMins('') }}
              >
                {formatDuration(secs)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              style={{ flex: 1, minHeight: 44 }}
              type="number"
              min="1"
              placeholder="Custom minutes"
              value={customMins}
              onChange={e => setCustomMins(e.target.value)}
            />
            <button
              className="btn btn-secondary"
              style={{ width: 'auto', padding: '0 18px' }}
              disabled={!customMins || Number(customMins) <= 0}
              onClick={() => setDispersalDuration(roomCode, Math.round(Number(customMins) * 60))}
            >
              Set
            </button>
          </div>
        </div>
      )}

      {/* Add ghost player */}
      {addingGhost ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="label" style={{ marginBottom: 0 }}>👻 Add a phoneless player</div>
          <div className="subtitle" style={{ fontSize: 12, marginTop: -4 }}>
            They play on the honor system — no map dot, no power-ups, tagged manually by "It".
          </div>
          <input
            className="input"
            placeholder="Player name"
            value={ghostName}
            onChange={e => setGhostName(e.target.value)}
            maxLength={20}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setAddingGhost(false); setGhostName('') }}>
              Cancel
            </button>
            <button className="btn btn-primary" style={{ flex: 2 }} disabled={!ghostName.trim()} onClick={handleAddGhost}>
              Add Ghost Player
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-ghost" onClick={() => setAddingGhost(true)}>
          👻 Add Phoneless Player
        </button>
      )}

      {/* CTA */}
      {isHost ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            className="btn btn-primary"
            disabled={!enoughPlayers}
            onClick={() => navigate('/setup')}
          >
            Setup Game →
          </button>
          {!enoughPlayers && (
            <p className="subtitle" style={{ textAlign: 'center' }}>
              Need at least 2 players with phones
            </p>
          )}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '20px' }}>
          <div className="pulse" style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Waiting for host to start the game…
          </div>
        </div>
      )}

      {/* Admin sheet */}
      {showAdmin && isHost && (
        <AdminSheet
          roomCode={roomCode}
          uid={uid}
          players={players}
          phase="lobby"
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  )
}

function avatarColor(name) {
  const colors = ['#ff3b3b','#448aff','#00e676','#ffd600','#d500f9','#ff9100']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}

function formatDuration(secs) {
  if (!secs) return '2m'
  if (secs < 60) return `${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s ? `${m}m ${s}s` : `${m}m`
}
