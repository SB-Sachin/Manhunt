import { useState } from 'react'
import {
  kickPlayer, renamePlayer, reassignRole,
  eliminatePlayer, forceEndGame,
} from '../services/gameService.js'

/*
 * Host-only admin panel. Rendered as a bottom sheet from the Lobby and the
 * live Game screen. `phase` controls which actions are available:
 *   'lobby' → rename, kick
 *   'game'  → rename, swap role, eliminate, force-end
 */
export default function AdminSheet({ roomCode, uid, players, phase, onClose }) {
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState(false)

  const inGame = phase === 'game'

  async function run(fn) {
    setBusy(true)
    try { await fn() } catch (e) { console.warn('Admin action failed:', e.message) }
    finally { setBusy(false) }
  }

  function startRename(p) {
    setEditingId(p.id)
    setEditName(p.name)
  }

  async function saveRename() {
    const name = editName.trim()
    if (name && editingId) await run(() => renamePlayer(roomCode, editingId, name))
    setEditingId(null)
    setEditName('')
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 5000,
        background: 'rgba(0,0,0,.75)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          background: 'var(--surface)',
          borderTop: '2px solid var(--yellow)',
          borderRadius: 'var(--radius) var(--radius) 0 0',
          padding: '20px 16px calc(20px + var(--safe-bottom))',
          maxHeight: '82vh',
          overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🛠️</span>
          <div className="title" style={{ fontSize: 18 }}>Host Controls</div>
          <button
            className="btn-pill"
            style={{ marginLeft: 'auto', minHeight: 32 }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
        <div className="subtitle" style={{ fontSize: 13, marginBottom: 16 }}>
          {inGame
            ? 'Manage roles, eliminations, and end the game'
            : 'Rename or remove players before the game starts'}
        </div>

        {/* Player list */}
        {players.map(p => {
          const isMe = p.id === uid
          const isEditing = editingId === p.id
          return (
            <div
              key={p.id}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              {/* Row top: avatar + name + badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div className="player-avatar" style={{
                  background: p.role === 'it' ? 'rgba(255,59,59,.15)' : 'rgba(0,230,118,.12)',
                  border: `2px solid ${p.role === 'it' ? 'var(--red)' : 'var(--green)'}`,
                  opacity: p.isEliminated ? 0.4 : 1,
                }}>
                  <span style={{ color: p.role === 'it' ? 'var(--red)' : 'var(--green)' }}>
                    {p.name[0].toUpperCase()}
                  </span>
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
                    <div style={{ fontWeight: 600, fontSize: 15, opacity: p.isEliminated ? 0.5 : 1 }}>
                      {p.name}
                    </div>
                    <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                      {p.isHost && <span className="badge badge-yellow">Host</span>}
                      {isMe && <span className="badge badge-blue">You</span>}
                      {p.isGhost && <span className="badge badge-purple">👻 Ghost</span>}
                      {inGame && (
                        <span className={`badge ${p.role === 'it' ? 'badge-red' : 'badge-green'}`}>
                          {p.role === 'it' ? 'IT' : 'RUNNER'}
                        </span>
                      )}
                      {p.isEliminated && <span className="badge badge-red">OUT</span>}
                    </div>
                  </div>
                )}

                {isEditing && (
                  <button className="btn-pill active" style={{ minHeight: 38 }} onClick={saveRename}>
                    Save
                  </button>
                )}
              </div>

              {/* Row actions */}
              {!isEditing && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn-pill"
                    style={{ minHeight: 34 }}
                    disabled={busy}
                    onClick={() => startRename(p)}
                  >
                    ✏️ Rename
                  </button>

                  {inGame && (
                    <button
                      className="btn-pill"
                      style={{ minHeight: 34 }}
                      disabled={busy}
                      onClick={() => run(() => reassignRole(roomCode, p.id, p.role === 'it' ? 'runner' : 'it'))}
                    >
                      🔄 Make {p.role === 'it' ? 'Runner' : 'It'}
                    </button>
                  )}

                  {inGame && !p.isEliminated && (
                    <button
                      className="btn-pill"
                      style={{ minHeight: 34, borderColor: 'rgba(255,59,59,.4)', color: 'var(--red)' }}
                      disabled={busy}
                      onClick={() => run(() => eliminatePlayer(roomCode, p.id))}
                    >
                      ☠️ Eliminate
                    </button>
                  )}

                  {!isMe && !p.isHost && (
                    <button
                      className="btn-pill"
                      style={{ minHeight: 34, borderColor: 'rgba(255,59,59,.4)', color: 'var(--red)' }}
                      disabled={busy}
                      onClick={() => run(() => kickPlayer(roomCode, p.id))}
                    >
                      🚫 Kick
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Force-end game */}
        {inGame && (
          <div style={{ marginTop: 18 }}>
            {confirmEnd ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmEnd(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  disabled={busy}
                  onClick={() => run(() => forceEndGame(roomCode))}
                >
                  Yes, end the game now
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                style={{ borderColor: 'rgba(255,59,59,.4)', color: 'var(--red)' }}
                onClick={() => setConfirmEnd(true)}
              >
                🏁 Force-End Game
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
