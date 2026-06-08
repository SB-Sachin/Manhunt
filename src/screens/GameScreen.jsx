import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectMyRole, selectItPlayers, selectRunners } from '../store/gameStore.js'
import {
  subscribeToGame, tagPlayer, confirmTag, disputeTag,
  collectPowerUp, activatePowerUp, useReveal, replenishPowerUps
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

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})        // pid → L.circleMarker
  const powerUpMarkersRef = useRef({}) // spawnId → L.marker
  const boundaryLayerRef = useRef(null)
  const lastReplenishRef = useRef(Date.now())
  const LRef = useRef(null)

  useLocationTracking(roomCode, uid, true)

  // Subscribe to game state
  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'GAME_OVER') navigate('/gameover')

      if (g.tagRequest?.targetId === uid && g.tagRequest?.status === 'pending') {
        setTagRequest(g.tagRequest)
        const t = setTimeout(() => {
          confirmTag(roomCode, uid, g.tagRequest.taggerId).catch(() => {})
          setTagRequest(null)
        }, 5000)
        return () => clearTimeout(t)
      } else {
        setTagRequest(null)
      }
    })
    return unsub
  }, [roomCode])

  // Init Leaflet map
  useEffect(() => {
    if (mapRef.current) return
    import('leaflet').then((L) => {
      LRef.current = L
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, {
        zoomControl: false,
        attributionControl: false,
      }).setView([37.7749, -122.4194], 17)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map)

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        markersRef.current = {}
        powerUpMarkersRef.current = {}
        boundaryLayerRef.current = null
      }
    }
  }, [])

  // Draw boundary once
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.boundary?.length) return
    if (boundaryLayerRef.current) return // already drawn

    const L = LRef.current
    const latlngs = game.boundary.map(p => [p.lat, p.lng])
    boundaryLayerRef.current = L.polygon(latlngs, {
      color: '#ef4444',
      weight: 2,
      fillOpacity: 0.06,
    }).addTo(mapRef.current)
  }, [game?.boundary, mapRef.current])

  // Update player markers whenever game state changes
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.players) return
    const L = LRef.current
    const map = mapRef.current

    const myLoc = game.players[uid]?.location
    const activeRevealIt = getActiveEffect(game, 'REVEAL_IT')
    const activeRevealRunner = getActiveEffect(game, 'REVEAL_RUNNER')
    const activeCluster = getActiveEffect(game, 'CLUSTER_SCAN')

    // Pan to self
    if (myLoc) {
      map.setView([myLoc.lat, myLoc.lng], map.getZoom(), { animate: true })
      if (game.boundary?.length > 2) {
        setOutOfBounds(!pointInPolygon(myLoc, game.boundary))
      }
    }

    // Decide which players to show
    const visible = {}
    visible[uid] = { ...game.players[uid], isSelf: true }

    if (role === 'it') {
      itPlayers.forEach(p => { visible[p.id] = p })
      if (activeRevealRunner || activeCluster) {
        runners.forEach(p => { visible[p.id] = p })
      }
    }
    if (role === 'runner' && activeRevealIt) {
      itPlayers.forEach(p => { visible[p.id] = p })
    }

    const seen = new Set()

    Object.entries(visible).forEach(([pid, player]) => {
      if (!player?.location) return
      seen.add(pid)

      const color = pid === uid ? '#3b82f6' : player.role === 'it' ? '#ef4444' : '#22c55e'
      const radius = pid === uid ? 10 : 8
      const latlng = [player.location.lat, player.location.lng]

      if (markersRef.current[pid]) {
        markersRef.current[pid].setLatLng(latlng)
      } else {
        const marker = L.circleMarker(latlng, {
          radius,
          color: '#fff',
          weight: 2,
          fillColor: color,
          fillOpacity: 1,
        })
          .bindTooltip(player.isSelf ? 'You' : player.name, { permanent: false, direction: 'top' })
          .addTo(map)
        markersRef.current[pid] = marker
      }

      // Update colour in case role changed
      markersRef.current[pid].setStyle({ fillColor: color, radius })
    })

    // Cluster blobs for "It" with CLUSTER_SCAN
    if (role === 'it' && activeCluster) {
      const clusters = computeClusters(game.players)
      clusters.forEach((c, i) => {
        const key = `cluster_${i}`
        seen.add(key)
        const latlng = [c.lat, c.lng]
        if (!markersRef.current[key]) {
          markersRef.current[key] = L.circleMarker(latlng, {
            radius: 14 + c.count * 4,
            color: '#f97316',
            weight: 1,
            fillColor: '#f97316',
            fillOpacity: 0.35,
          })
            .bindTooltip(`${c.count} runners`, { permanent: true, direction: 'center', className: 'cluster-label' })
            .addTo(map)
        } else {
          markersRef.current[key].setLatLng(latlng)
        }
      })
    }

    // Remove stale markers
    Object.keys(markersRef.current).forEach(pid => {
      if (!seen.has(pid)) {
        markersRef.current[pid].remove()
        delete markersRef.current[pid]
      }
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
        const icon = L.divIcon({
          html: `<div style="font-size:24px;line-height:1;">${info?.emoji || '⭐'}</div>`,
          className: '',
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        })
        powerUpMarkersRef.current[spawn.id] = L.marker(
          [spawn.location.lat, spawn.location.lng],
          { icon }
        )
          .bindTooltip(info?.label || 'Power-up', { direction: 'top' })
          .addTo(mapRef.current)
      }
    })

    Object.keys(powerUpMarkersRef.current).forEach(sid => {
      if (!seen.has(sid)) {
        powerUpMarkersRef.current[sid].remove()
        delete powerUpMarkersRef.current[sid]
      }
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

  // Host replenishes power-ups every 3 min
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
    notify(`Reveal used! ${me.revealsLeft - 1} remaining.`)
  }

  function notify(msg) {
    setNotification(msg)
    setTimeout(() => setNotification(null), 3000)
  }

  const myPowerUps = game?.players?.[uid]?.powerUps || []
  const myReveals = game?.players?.[uid]?.revealsLeft || 0

  return (
    <div className="screen" style={{ height: '100dvh', position: 'relative' }}>

      {/* Map */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Top HUD */}
      <div className="map-overlay-top">
        <div className="map-chip" style={{ display: 'flex', gap: 12, flex: 1 }}>
          <span>🏃 {runners.length}</span>
          <span>🔴 {itPlayers.length}</span>
          <span style={{ marginLeft: 'auto' }}>
            <span className={`badge ${role === 'it' ? 'badge-red' : 'badge-green'}`}>
              {role === 'it' ? 'IT' : 'Runner'}
            </span>
          </span>
        </div>
      </div>

      {/* Out of bounds */}
      {outOfBounds && (
        <div style={{
          position: 'absolute', top: 70, left: 12, right: 12, zIndex: 1000,
          background: 'rgba(239,68,68,0.9)', borderRadius: 8,
          padding: '10px 14px', textAlign: 'center', fontWeight: 700,
        }}>
          ⚠️ You are OUT OF BOUNDS
        </div>
      )}

      {/* Toast */}
      {notification && (
        <div style={{
          position: 'absolute', top: outOfBounds ? 120 : 70, left: 12, right: 12, zIndex: 1001,
          background: 'rgba(15,23,42,0.95)', borderRadius: 8,
          padding: '10px 14px', textAlign: 'center', fontWeight: 600,
          border: '1px solid var(--border)',
        }}>
          {notification}
        </div>
      )}

      {/* Incoming tag confirmation */}
      {tagRequest?.targetId === uid && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: 24,
        }}>
          <div style={{ fontSize: 56 }}>🏷️</div>
          <div className="title" style={{ textAlign: 'center' }}>You've been tagged!</div>
          <div className="subtitle">Confirm or dispute within 5 seconds</div>
          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button className="btn btn-ghost" style={{ flex: 1 }}
              onClick={() => { disputeTag(roomCode); setTagRequest(null) }}>
              Dispute
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => { confirmTag(roomCode, uid, tagRequest.taggerId); setTagRequest(null) }}>
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="map-overlay-bottom">
        {myPowerUps.length > 0 && (
          <div className="card" style={{ padding: 12 }}>
            <div className="label" style={{ marginBottom: 8 }}>Power-ups</div>
            <div className="powerup-bar">
              {[...new Set(myPowerUps)].map(type => {
                const info = POWERUP_TYPES[type]
                const count = myPowerUps.filter(t => t === type).length
                const wrongRole = info.availableTo !== 'both' && info.availableTo !== role
                return (
                  <button
                    key={type}
                    className="powerup-btn"
                    style={{ background: info.color + '33', position: 'relative' }}
                    onClick={() => handleActivatePowerUp(type)}
                    disabled={wrongRole}
                    title={info.description}
                  >
                    {info.emoji}
                    {count > 1 && (
                      <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, fontWeight: 800 }}>
                        ×{count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {role === 'it' && (
          <div className="card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="label">Reveals</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: myReveals > 0 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                {myReveals} left
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 8px', fontSize: 13 }}
                disabled={myReveals <= 0} onClick={() => handleReveal('REVEAL_RUNNER')}>
                📍 Reveal Runner
              </button>
              <button className="btn btn-ghost" style={{ flex: 1, padding: '10px 8px', fontSize: 13 }}
                disabled={myReveals <= 0} onClick={() => handleReveal('CLUSTER_SCAN')}>
                👥 Clusters
              </button>
            </div>
          </div>
        )}

        {role === 'it' && (
          <button
            className="btn btn-primary"
            style={{
              fontSize: 18, padding: '18px',
              opacity: nearbyRunner ? 1 : 0.3,
              background: nearbyRunner ? 'var(--red)' : 'var(--surface2)',
            }}
            disabled={!nearbyRunner}
            onClick={handleTag}
          >
            {nearbyRunner ? `🏷️ Tag ${nearbyRunner.name}!` : '🏷️ Get within 10m to tag'}
          </button>
        )}
      </div>
    </div>
  )
}
