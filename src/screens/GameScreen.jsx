import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectMyRole, selectItPlayers, selectRunners } from '../store/gameStore.js'
import {
  subscribeToGame, tagPlayer, confirmTag, disputeTag,
  collectPowerUp, activatePowerUp, useReveal, replenishPowerUps,
} from '../services/gameService.js'
import { useLocationTracking } from '../hooks/useLocation.js'
import { distanceMetres, computeClusters, pointInPolygon } from '../utils/geo.js'
import { POWERUP_TYPES, getActiveEffect, isImmune } from '../utils/powerups.js'

const TAG_RADIUS_M = 10
const POWERUP_COLLECT_RADIUS_M = 15
const POWERUP_REPLENISH_MS = 3 * 60 * 1000

export default function GameScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const role = useGameStore(selectMyRole)
  const itPlayers = useGameStore(selectItPlayers)
  const runners = useGameStore(selectRunners)

  const [tagRequest, setTagRequest] = useState(null)
  const [notification, setNotification] = useState(null)
  const [outOfBounds, setOutOfBounds] = useState(false)
  const [tagCountdown, setTagCountdown] = useState(5)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const powerUpMarkersRef = useRef({})
  const boundaryLayerRef = useRef(null)
  const lastReplenishRef = useRef(Date.now())
  const LRef = useRef(null)
  const tagTimerRef = useRef(null)

  useLocationTracking(roomCode, uid, true)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'GAME_OVER') navigate('/gameover')

      if (g.tagRequest?.targetId === uid && g.tagRequest?.status === 'pending') {
        setTagRequest(g.tagRequest)
        setTagCountdown(5)
        clearInterval(tagTimerRef.current)
        tagTimerRef.current = setInterval(() => {
          setTagCountdown(prev => {
            if (prev <= 1) {
              clearInterval(tagTimerRef.current)
              confirmTag(roomCode, uid, g.tagRequest.taggerId).catch(() => {})
              setTagRequest(null)
              return 5
            }
            return prev - 1
          })
        }, 1000)
      } else if (!g.tagRequest) {
        setTagRequest(null)
        clearInterval(tagTimerRef.current)
      }
    })
    return () => { unsub(); clearInterval(tagTimerRef.current) }
  }, [roomCode])

  // Init Leaflet
  useEffect(() => {
    if (mapRef.current) return
    import('leaflet').then((L) => {
      LRef.current = L
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, { zoomControl: false, attributionControl: false })
        .setView([37.7749, -122.4194], 17)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)
      mapRef.current = map
    })
    return () => {
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = {}
      powerUpMarkersRef.current = {}
      boundaryLayerRef.current = null
    }
  }, [])

  // Draw boundary once
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.boundary?.length || boundaryLayerRef.current) return
    boundaryLayerRef.current = LRef.current.polygon(
      game.boundary.map(p => [p.lat, p.lng]),
      { color: '#ff3b3b', weight: 2, fillOpacity: 0.06 }
    ).addTo(mapRef.current)
  }, [game?.boundary, mapRef.current])

  // Update player markers
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.players) return
    const L = LRef.current
    const map = mapRef.current

    const myLoc = game.players[uid]?.location
    const activeRevealIt = getActiveEffect(game, 'REVEAL_IT')
    const activeRevealRunner = getActiveEffect(game, 'REVEAL_RUNNER')
    const activeCluster = getActiveEffect(game, 'CLUSTER_SCAN')

    if (myLoc) {
      map.setView([myLoc.lat, myLoc.lng], map.getZoom(), { animate: true })
      if (game.boundary?.length > 2) setOutOfBounds(!pointInPolygon(myLoc, game.boundary))
    }

    const visible = {}
    visible[uid] = { ...game.players[uid], isSelf: true }
    if (role === 'it') {
      itPlayers.forEach(p => { visible[p.id] = p })
      if (activeRevealRunner || activeCluster) runners.forEach(p => { visible[p.id] = p })
    }
    if (role === 'runner' && activeRevealIt) itPlayers.forEach(p => { visible[p.id] = p })

    const seen = new Set()
    Object.entries(visible).forEach(([pid, player]) => {
      if (!player?.location) return
      seen.add(pid)
      const isMe = pid === uid
      const color = isMe ? '#448aff' : player.role === 'it' ? '#ff3b3b' : '#00e676'
      const radius = isMe ? 11 : 9
      const latlng = [player.location.lat, player.location.lng]

      if (markersRef.current[pid]) {
        markersRef.current[pid].setLatLng(latlng)
        markersRef.current[pid].setStyle({ fillColor: color, radius })
      } else {
        markersRef.current[pid] = L.circleMarker(latlng, {
          radius, color: '#000', weight: 2, fillColor: color, fillOpacity: 1,
        })
          .bindTooltip(isMe ? 'You' : player.name, { permanent: false, direction: 'top' })
          .addTo(map)
      }
    })

    // Cluster blobs
    if (role === 'it' && activeCluster) {
      computeClusters(game.players).forEach((c, i) => {
        const key = `cluster_${i}`
        seen.add(key)
        if (!markersRef.current[key]) {
          markersRef.current[key] = L.circleMarker([c.lat, c.lng], {
            radius: 14 + c.count * 5,
            color: '#ff9100', weight: 1, fillColor: '#ff9100', fillOpacity: 0.3,
          })
            .bindTooltip(`${c.count}`, { permanent: true, direction: 'center', className: 'cluster-label' })
            .addTo(map)
        } else {
          markersRef.current[key].setLatLng([c.lat, c.lng])
        }
      })
    }

    Object.keys(markersRef.current).forEach(pid => {
      if (!seen.has(pid)) { markersRef.current[pid].remove(); delete markersRef.current[pid] }
    })
  }, [game, role])

  // Power-up spawn markers
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.powerUpSpawns) return
    const L = LRef.current
    const seen = new Set()

    game.powerUpSpawns.forEach(spawn => {
      if (!spawn.location) return
      seen.add(spawn.id)
      if (!powerUpMarkersRef.current[spawn.id]) {
        const info = POWERUP_TYPES[spawn.type]
        powerUpMarkersRef.current[spawn.id] = L.marker(
          [spawn.location.lat, spawn.location.lng],
          {
            icon: L.divIcon({
              html: `<div style="font-size:26px;filter:drop-shadow(0 0 6px rgba(255,214,0,.6));">${info?.emoji || '⭐'}</div>`,
              className: '',
              iconSize: [30, 30],
              iconAnchor: [15, 15],
            }),
          }
        )
          .bindTooltip(info?.label || 'Power-up', { direction: 'top' })
          .addTo(mapRef.current)
      }
    })

    Object.keys(powerUpMarkersRef.current).forEach(sid => {
      if (!seen.has(sid)) { powerUpMarkersRef.current[sid].remove(); delete powerUpMarkersRef.current[sid] }
    })
  }, [game?.powerUpSpawns])

  // Auto-collect nearby power-ups
  useEffect(() => {
    const myLoc = game?.players?.[uid]?.location
    if (!myLoc || !game?.powerUpSpawns) return
    game.powerUpSpawns.forEach(spawn => {
      if (!spawn.location) return
      if (distanceMetres(myLoc, spawn.location) <= POWERUP_COLLECT_RADIUS_M) {
        collectPowerUp(roomCode, uid, spawn.id).catch(() => {})
        notify(`Picked up ${POWERUP_TYPES[spawn.type]?.emoji} ${POWERUP_TYPES[spawn.type]?.label}!`)
      }
    })
  }, [game?.players?.[uid]?.location])

  // Host replenishes power-ups
  useEffect(() => {
    if (!game || game.hostId !== uid || game.status !== 'LIVE') return
    if (Date.now() - lastReplenishRef.current < POWERUP_REPLENISH_MS) return
    lastReplenishRef.current = Date.now()
    replenishPowerUps(roomCode, game.boundary).catch(() => {})
  }, [game?.players])

  const myLocation = game?.players?.[uid]?.location
  const nearbyRunner = role === 'it' && myLocation
    ? runners.find(r => r.location && distanceMetres(myLocation, r.location) <= TAG_RADIUS_M)
    : null

  async function handleTag() {
    if (!nearbyRunner) return
    if (isImmune(game, nearbyRunner.id)) { notify('🛡️ That runner is immune!'); return }
    await tagPlayer(roomCode, uid, nearbyRunner.id)
    notify(`Tag request sent to ${nearbyRunner.name}!`)
  }

  async function handleActivatePowerUp(type) {
    await activatePowerUp(roomCode, uid, type)
    notify(`${POWERUP_TYPES[type]?.emoji} ${POWERUP_TYPES[type]?.label} activated!`)
  }

  async function handleReveal(type) {
    const me = game?.players?.[uid]
    if (!me || me.revealsLeft <= 0) return
    await useReveal(roomCode, uid, type)
    notify(`Reveal used — ${me.revealsLeft - 1} remaining`)
  }

  function notify(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  const myPowerUps = game?.players?.[uid]?.powerUps || []
  const myReveals = game?.players?.[uid]?.revealsLeft || 0
  const notifTop = outOfBounds ? 70 : 'calc(var(--safe-top) + 66px)'

  return (
    <div className="screen" style={{ height: '100dvh', position: 'relative' }}>

      {/* Map */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top HUD */}
      <div className="map-overlay-top">
        <div className="map-chip" style={{ display: 'flex', gap: 14, flex: 1, alignItems: 'center' }}>
          <span style={{ color: 'var(--green)' }}>🏃 {runners.length}</span>
          <span style={{ color: 'var(--red)' }}>🔴 {itPlayers.length}</span>
          <span style={{ marginLeft: 'auto' }}>
            <span className={`badge ${role === 'it' ? 'badge-red' : 'badge-green'}`}>
              {role === 'it' ? 'IT' : 'RUNNER'}
            </span>
          </span>
        </div>
      </div>

      {/* Out of bounds warning */}
      {outOfBounds && (
        <div style={{
          position: 'absolute',
          top: 'calc(var(--safe-top) + 64px)',
          left: 12, right: 12, zIndex: 1000,
          background: 'rgba(255,59,59,.92)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 16px',
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          letterSpacing: '0.06em',
        }}>
          ⚠ OUT OF BOUNDS — RETURN TO PLAY AREA
        </div>
      )}

      {/* Toast */}
      {notification && (
        <div className="toast" style={{ top: outOfBounds ? 118 : 'calc(var(--safe-top) + 64px)' }}>
          {notification}
        </div>
      )}

      {/* Tag confirmation overlay */}
      {tagRequest?.targetId === uid && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,.92)',
          zIndex: 2000,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: '32px 24px',
          animation: 'fadeIn .2s ease',
        }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: 'rgba(255,59,59,.12)',
            border: '2px solid var(--red)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44,
            boxShadow: '0 0 40px var(--red-glow)',
          }}>🏷️</div>

          <div className="title" style={{ textAlign: 'center', color: 'var(--red)' }}>
            TAGGED!
          </div>
          <div className="subtitle" style={{ textAlign: 'center' }}>
            Confirm or dispute — auto-confirms in {tagCountdown}s
          </div>

          {/* Countdown bar */}
          <div style={{
            width: '100%', height: 4,
            background: 'var(--surface2)',
            borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${(tagCountdown / 5) * 100}%`,
              background: 'var(--red)',
              transition: 'width 1s linear',
              boxShadow: '0 0 8px var(--red-glow)',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1 }}
              onClick={() => { disputeTag(roomCode); setTagRequest(null); clearInterval(tagTimerRef.current) }}
            >
              Dispute
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={() => {
                confirmTag(roomCode, uid, tagRequest.taggerId)
                setTagRequest(null)
                clearInterval(tagTimerRef.current)
              }}
            >
              Confirm Tag
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="map-overlay-bottom">

        {/* Power-ups */}
        {myPowerUps.length > 0 && (
          <div className="map-card">
            <div className="label" style={{ marginBottom: 10 }}>Power-ups</div>
            <div className="powerup-bar">
              {[...new Set(myPowerUps)].map(type => {
                const info = POWERUP_TYPES[type]
                const count = myPowerUps.filter(t => t === type).length
                const wrongRole = info.availableTo !== 'both' && info.availableTo !== role
                return (
                  <button
                    key={type}
                    className="powerup-btn"
                    style={{ background: info.color + '18', borderColor: info.color + '44' }}
                    onClick={() => handleActivatePowerUp(type)}
                    disabled={wrongRole}
                    title={info.description}
                  >
                    {info.emoji}
                    {count > 1 && (
                      <span style={{
                        position: 'absolute', top: 2, right: 4,
                        fontSize: 9, fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                        color: '#fff',
                      }}>×{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Reveal buttons (It only) */}
        {role === 'it' && (
          <div className="map-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="label" style={{ marginBottom: 0 }}>Reveals</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                color: myReveals > 0 ? 'var(--yellow)' : 'var(--text-muted)',
              }}>
                {myReveals} left
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minHeight: 44, fontSize: 12, padding: '10px 8px' }}
                disabled={myReveals <= 0}
                onClick={() => handleReveal('REVEAL_RUNNER')}
              >
                📍 Runner
              </button>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, minHeight: 44, fontSize: 12, padding: '10px 8px' }}
                disabled={myReveals <= 0}
                onClick={() => handleReveal('CLUSTER_SCAN')}
              >
                👥 Clusters
              </button>
            </div>
          </div>
        )}

        {/* Tag button (It only) */}
        {role === 'it' && (
          <button
            className="btn btn-primary"
            style={{
              fontSize: 16,
              minHeight: 58,
              opacity: nearbyRunner ? 1 : 0.28,
              background: nearbyRunner ? 'var(--red)' : 'var(--surface)',
              boxShadow: nearbyRunner ? '0 4px 28px var(--red-glow)' : 'none',
              border: nearbyRunner ? 'none' : '1px solid var(--border-light)',
            }}
            disabled={!nearbyRunner}
            onClick={handleTag}
          >
            {nearbyRunner
              ? `🏷️ TAG ${nearbyRunner.name.toUpperCase()}!`
              : '🏷️ Get within 10m to tag'}
          </button>
        )}
      </div>
    </div>
  )
}
