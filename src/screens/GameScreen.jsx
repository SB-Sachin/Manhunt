import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectMyRole, selectItPlayers, selectRunners, selectIsHost } from '../store/gameStore.js'
import {
  subscribeToGame, tagPlayer, confirmTag, disputeTag,
  collectPowerUp, activatePowerUp, useReveal, replenishPowerUps,
  endByTimeout, eliminatePlayer,
} from '../services/gameService.js'
import { useLocationTracking } from '../hooks/useLocation.js'
import { distanceMetres, computeClusters, pointInPolygon, shrinkPolygon } from '../utils/geo.js'
import { POWERUP_TYPES, getActiveEffect, isImmune } from '../utils/powerups.js'
import { feedback } from '../utils/feedback.js'
import AdminSheet from '../components/AdminSheet.jsx'
import SoundToggle from '../components/SoundToggle.jsx'

const TAG_PROXIMITY_M = 20          // soft proximity hint (not a hard gate)
const POWERUP_COLLECT_RADIUS_M = 15
const POWERUP_REPLENISH_MS = 3 * 60 * 1000
const DANGER_RADIUS_M = 35          // runner "danger sense" range
const OUT_OF_ZONE_GRACE_MS = 15000  // survival: time outside shrunk zone before elimination

/* Escape user-supplied names before injecting into marker HTML */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}

/* ── Notification queue hook ──────────────────────────────────────────────── */
function useNotifications() {
  const [queue, setQueue] = useState([])
  const push = useCallback((msg, type = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setQueue(q => [...q, { id, msg, type }])
    setTimeout(() => setQueue(q => q.filter(n => n.id !== id)), 4000)
  }, [])
  return [queue, push]
}

export default function GameScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
  const role = useGameStore(selectMyRole)
  const itPlayers = useGameStore(selectItPlayers)
  const runners = useGameStore(selectRunners)
  const isHost = useGameStore(selectIsHost)
  const allPlayers = Object.values(game?.players ?? {})

  const [tagRequest, setTagRequest] = useState(null)
  const [tagCountdown, setTagCountdown] = useState(5)
  const [outOfBounds, setOutOfBounds] = useState(false)
  const [showTagSheet, setShowTagSheet] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [powerUpInfo, setPowerUpInfo] = useState(null)   // {type, info} for description popup
  const [notifications, pushNotification] = useNotifications()
  const [roundLeft, setRoundLeft] = useState(null)       // survival round seconds remaining
  const [dangerLevel, setDangerLevel] = useState(0)      // 0..1 proximity intensity (runners)

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef({})
  const powerUpMarkersRef = useRef({})
  const boundaryLayerRef = useRef(null)
  const LRef = useRef(null)
  const tagTimerRef = useRef(null)
  const lastReplenishRef = useRef(Date.now())
  const hasCenteredRef = useRef(false)
  const outsideSinceRef = useRef(null)       // when I first left the zone (survival)
  const selfEliminatedRef = useRef(false)
  const lastDangerBuzzRef = useRef(0)
  const prevOutOfBoundsRef = useRef(false)

  // Track previous game state for diffing (notifications)
  const prevGameRef = useRef(null)

  useLocationTracking(roomCode, uid, true)

  /* ── Firestore subscription ────────────────────────────────────────────── */
  useEffect(() => {
    if (!roomCode) { navigate('/'); return }

    const unsub = subscribeToGame(roomCode, (g) => {
      const prev = prevGameRef.current

      // ── Diff for notifications ──────────────────────────────────────────

      if (prev) {
        // Someone just got tagged → both sides get a notification
        const prevTag = prev.tagRequest
        const newTag = g.tagRequest
        // Classic: someone converted to "It"
        Object.values(g.players).forEach(p => {
          const was = prev.players?.[p.id]
          if (was?.role === 'runner' && p.role === 'it') {
            if (p.id === uid) {
              feedback.tag()
              pushNotification('🏷️ You were tagged! You are now "It"', 'danger')
            } else {
              pushNotification(`🏷️ ${p.name} was tagged and is now "It"`, 'warning')
            }
          }
          // Survival: someone was eliminated
          if (was && !was.isEliminated && p.isEliminated) {
            if (p.id === uid) {
              feedback.eliminated()
              pushNotification('☠️ You were tagged — eliminated!', 'danger')
            } else {
              pushNotification(`☠️ ${p.name} was eliminated`, 'warning')
            }
          }
        })

        // Power-up collected by me
        const myPrev = prev.players?.[uid]?.powerUps || []
        const myCurr = g.players?.[uid]?.powerUps || []
        if (myCurr.length > myPrev.length) {
          const newType = myCurr[myCurr.length - 1]
          const info = POWERUP_TYPES[newType]
          feedback.pickup()
          pushNotification(`${info?.emoji} Picked up ${info?.label}!`, 'success')
        }

        // Active effect just added that targets me
        const prevEffectIds = new Set((prev.activeEffects || []).map(e => e.id))
        ;(g.activeEffects || []).forEach(effect => {
          if (prevEffectIds.has(effect.id)) return          // not new
          if (effect.type === 'REVEAL_RUNNER' && role === 'runner') {
            pushNotification(`📍 "It" revealed a runner's location!`, 'danger')
          }
          if (effect.type === 'CLUSTER_SCAN' && role === 'runner') {
            pushNotification('👥 "It" is scanning for runner clusters!', 'danger')
          }
          if (effect.type === 'REVEAL_IT' && role === 'it') {
            pushNotification('👁️ Runners can see your location!', 'warning')
          }
          if (effect.type === 'IMMUNITY' && effect.activatedBy === uid) {
            pushNotification(`🛡️ Immunity active — you can't be tagged!`, 'success')
          }
        })

        // Game over — winner just set
        if (!prev.winner && g.winner) {
          if (g.winner === uid) {
            feedback.win()
            pushNotification('🏆 YOU WIN — Last runner standing!', 'success')
          } else {
            const winner = g.players?.[g.winner]
            pushNotification(`🏁 Game over! ${winner?.name ?? 'Someone'} wins!`, 'info')
          }
        }
      }

      prevGameRef.current = g
      setGame(g)

      if (g.status === 'GAME_OVER') navigate('/gameover')

      // Incoming tag request targeting me
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

  /* ── Init Leaflet map ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current) return
    let resizeObserver = null

    import('leaflet').then((L) => {
      LRef.current = L
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, {
        zoomControl: true,
        attributionControl: false,
        tap: true,
        tapTolerance: 15,
      }).setView([37.7749, -122.4194], 17)
      map.zoomControl.setPosition('topright')

      // Carto Voyager — far clearer streets/labels than raw OSM tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        subdomains: 'abcd',
      }).addTo(map)

      mapRef.current = map

      // FIX: container is laid out by flexbox, so it often has zero size at
      // init → grey/blank map. Force Leaflet to re-measure once mounted, and
      // again on any container resize (keyboard, rotation, sheet open/close).
      const refresh = () => map.invalidateSize()
      requestAnimationFrame(refresh)
      setTimeout(refresh, 200)
      setTimeout(refresh, 600)

      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(refresh)
        resizeObserver.observe(container)
      }
    })

    return () => {
      resizeObserver?.disconnect()
      mapRef.current?.remove()
      mapRef.current = null
      markersRef.current = {}
      powerUpMarkersRef.current = {}
      boundaryLayerRef.current = null
    }
  }, [])

  // Recenter map on me
  const recenter = useCallback(() => {
    const myLoc = game?.players?.[uid]?.location
    if (myLoc && mapRef.current) {
      mapRef.current.setView([myLoc.lat, myLoc.lng], 18, { animate: true })
    }
  }, [game?.players, uid])

  /* ── Draw boundary once ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.boundary?.length || boundaryLayerRef.current) return
    const L = LRef.current
    boundaryLayerRef.current = L.polygon(
      game.boundary.map(p => [p.lat, p.lng]),
      { color: '#ff3b3b', weight: 3, fillOpacity: 0.05, dashArray: '10 6' }
    ).addTo(mapRef.current)
    // Fit the map to the whole play area once so players see the full boundary
    if (!hasCenteredRef.current) {
      mapRef.current.fitBounds(boundaryLayerRef.current.getBounds(), { padding: [40, 40] })
    }
  }, [game?.boundary, mapRef.current])

  /* ── Live tick: round timer, shrinking zone, out-of-bounds ─────────────── */
  useEffect(() => {
    if (!game?.boundary?.length) return
    const survival = game.mode === 'survival'

    const tick = () => {
      // Current play boundary (shrinks over time in survival)
      let boundary = game.boundary
      if (survival && game.shrinkStartAt && game.shrinkDurationSecs) {
        const elapsed = (Date.now() - game.shrinkStartAt) / 1000
        const factor = (game.maxShrink || 0) * Math.min(1, elapsed / game.shrinkDurationSecs)
        boundary = shrinkPolygon(game.boundary, factor)
        // Reflect the shrunk shape on the map
        if (boundaryLayerRef.current) {
          boundaryLayerRef.current.setLatLngs(boundary.map(p => [p.lat, p.lng]))
        }
      }

      // Out-of-bounds for me
      const myLoc = game.players?.[uid]?.location
      const me = game.players?.[uid]
      const amIActive = me && !me.isEliminated && me.role === 'runner'
      if (myLoc && boundary.length > 2) {
        const inside = pointInPolygon(myLoc, boundary)
        setOutOfBounds(!inside)

        // Survival: leaving the shrinking zone too long eliminates you
        if (survival && amIActive) {
          if (!inside) {
            if (!outsideSinceRef.current) outsideSinceRef.current = Date.now()
            else if (Date.now() - outsideSinceRef.current > OUT_OF_ZONE_GRACE_MS && !selfEliminatedRef.current) {
              selfEliminatedRef.current = true
              feedback.eliminated()
              pushNotification('☠️ You left the zone too long — eliminated!', 'danger')
              eliminatePlayer(roomCode, uid).catch(() => {})
            }
          } else {
            outsideSinceRef.current = null
          }
        }
      }

      // Survival round timer
      if (survival && game.liveEndsAt) {
        const remaining = Math.max(0, Math.ceil((game.liveEndsAt - Date.now()) / 1000))
        setRoundLeft(remaining)
        if (remaining <= 0 && isHost) endByTimeout(roomCode).catch(() => {})
      } else {
        setRoundLeft(null)
      }
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [game?.boundary, game?.mode, game?.shrinkStartAt, game?.shrinkDurationSecs,
      game?.maxShrink, game?.liveEndsAt, game?.players?.[uid]?.location, isHost, roomCode])

  /* ── Out-of-bounds haptic on entering the danger state ─────────────────── */
  useEffect(() => {
    if (outOfBounds && !prevOutOfBoundsRef.current) feedback.warning()
    prevOutOfBoundsRef.current = outOfBounds
  }, [outOfBounds])

  /* ── Proximity "danger sense" for runners ──────────────────────────────── */
  useEffect(() => {
    if (role !== 'runner' || game?.proximityWarnings === false) { setDangerLevel(0); return }
    const myLoc = game?.players?.[uid]?.location
    if (!myLoc) { setDangerLevel(0); return }

    let nearest = Infinity
    itPlayers.forEach(it => {
      if (it.location) nearest = Math.min(nearest, distanceMetres(myLoc, it.location))
    })

    if (nearest > DANGER_RADIUS_M) { setDangerLevel(0); return }
    // 0 at edge of range → 1 when right on top of you
    const level = 1 - nearest / DANGER_RADIUS_M
    setDangerLevel(level)

    // Escalating buzz/sound: closer = more frequent
    const interval = 1400 - level * 1100   // 1400ms far → 300ms close
    if (Date.now() - lastDangerBuzzRef.current > interval) {
      lastDangerBuzzRef.current = Date.now()
      feedback.warning()
    }
  }, [game?.players, role, itPlayers, game?.proximityWarnings])

  /* ── Update player markers ─────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.players) return
    const L = LRef.current
    const map = mapRef.current

    const myLoc = game.players[uid]?.location
    const activeRevealIt = getActiveEffect(game, 'REVEAL_IT')
    const activeRevealRunner = getActiveEffect(game, 'REVEAL_RUNNER')
    const activeCluster = getActiveEffect(game, 'CLUSTER_SCAN')

    if (myLoc) {
      // Center on the player only the first time we get a fix — afterwards the
      // user is free to pan/zoom; the recenter button brings them back.
      if (!hasCenteredRef.current) {
        map.setView([myLoc.lat, myLoc.lng], 18, { animate: true })
        hasCenteredRef.current = true
      }
      // out-of-bounds is computed in the live-tick effect (handles shrinking zone)
    }

    const visible = {}
    visible[uid] = { ...game.players[uid], isSelf: true }
    if (role === 'it') {
      itPlayers.forEach(p => { visible[p.id] = p })
      if (activeRevealRunner || activeCluster) runners.forEach(p => { visible[p.id] = p })
    }
    if (role === 'runner' && activeRevealIt) itPlayers.forEach(p => { visible[p.id] = p })

    const buildIcon = (player, isMe) => {
      const cls = isMe ? 'map-marker-self' : player.role === 'it' ? 'map-marker-it' : 'map-marker-runner'
      const label = isMe ? 'YOU' : player.name
      return L.divIcon({
        className: '',
        html: `<div class="map-marker ${cls}">
          ${isMe ? '<div class="map-marker-pulse"></div>' : ''}
          <div class="map-marker-dot"></div>
          <div class="map-marker-label">${escapeHtml(label)}</div>
        </div>`,
        iconSize: [60, 40],
        iconAnchor: [30, 10],
      })
    }

    const seen = new Set()
    Object.entries(visible).forEach(([pid, player]) => {
      if (!player?.location) return
      seen.add(pid)
      const isMe = pid === uid
      const latlng = [player.location.lat, player.location.lng]

      if (markersRef.current[pid]) {
        markersRef.current[pid].setLatLng(latlng)
        markersRef.current[pid].setIcon(buildIcon(player, isMe))
      } else {
        markersRef.current[pid] = L.marker(latlng, {
          icon: buildIcon(player, isMe),
          zIndexOffset: isMe ? 1000 : 0,
        }).addTo(map)
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

  /* ── Power-up spawn markers ────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapRef.current || !LRef.current || !game?.powerUpSpawns) return
    const L = LRef.current
    const seen = new Set()

    game.powerUpSpawns.forEach(spawn => {
      if (!spawn.location) return
      const info = POWERUP_TYPES[spawn.type]
      // Only show power-ups the current player can actually use
      const usable = info && (info.availableTo === role || info.availableTo === 'both')
      if (!usable) return
      seen.add(spawn.id)
      if (!powerUpMarkersRef.current[spawn.id]) {
        powerUpMarkersRef.current[spawn.id] = L.marker(
          [spawn.location.lat, spawn.location.lng],
          {
            icon: L.divIcon({
              html: `<div class="map-powerup">
                <div class="map-powerup-badge" style="border-color:${info.color};box-shadow:0 0 14px ${info.color}88;">${info?.emoji || '⭐'}</div>
                <div class="map-powerup-label" style="color:${info.color}">${escapeHtml(info?.label || 'Power-up')}</div>
              </div>`,
              className: '',
              iconSize: [70, 56],
              iconAnchor: [35, 28],
            }),
          }
        ).addTo(mapRef.current)
      }
    })

    Object.keys(powerUpMarkersRef.current).forEach(sid => {
      if (!seen.has(sid)) { powerUpMarkersRef.current[sid].remove(); delete powerUpMarkersRef.current[sid] }
    })
  }, [game?.powerUpSpawns, role])

  /* ── Auto-collect nearby power-ups (only ones my role can use) ─────────── */
  useEffect(() => {
    const myLoc = game?.players?.[uid]?.location
    if (!myLoc || !game?.powerUpSpawns) return
    game.powerUpSpawns.forEach(spawn => {
      if (!spawn.location) return
      const info = POWERUP_TYPES[spawn.type]
      const usable = info && (info.availableTo === role || info.availableTo === 'both')
      if (!usable) return
      if (distanceMetres(myLoc, spawn.location) <= POWERUP_COLLECT_RADIUS_M) {
        collectPowerUp(roomCode, uid, spawn.id).catch(() => {})
      }
    })
  }, [game?.players?.[uid]?.location, role])

  /* ── Host replenishes power-ups ────────────────────────────────────────── */
  useEffect(() => {
    if (!game || game.hostId !== uid || game.status !== 'LIVE') return
    if (Date.now() - lastReplenishRef.current < POWERUP_REPLENISH_MS) return
    lastReplenishRef.current = Date.now()
    replenishPowerUps(roomCode, game.boundary).catch(() => {})
  }, [game?.players])

  /* ── Actions ───────────────────────────────────────────────────────────── */
  async function handleTagPlayer(runnerId) {
    setShowTagSheet(false)
    const runner = game?.players?.[runnerId]
    if (!runner) return
    if (isImmune(game, runnerId)) {
      pushNotification(`🛡️ ${runner.name} has immunity — can't be tagged!`, 'warning')
      return
    }
    // Ghost (phoneless) players can't confirm — honor-system instant tag
    if (runner.isGhost) {
      await confirmTag(roomCode, runnerId, uid)
      pushNotification(`🏷️ Tagged ${runner.name} (honor system)`, 'info')
      return
    }
    await tagPlayer(roomCode, uid, runnerId)
    pushNotification(`Tag request sent to ${runner.name}!`, 'info')
  }

  async function handleActivatePowerUp(type) {
    setPowerUpInfo(null)
    await activatePowerUp(roomCode, uid, type)
  }

  async function handleReveal(type) {
    const me = game?.players?.[uid]
    if (!me || me.revealsLeft <= 0) return
    await useReveal(roomCode, uid, type)
  }

  /* ── Derived values ────────────────────────────────────────────────────── */
  const myLocation = game?.players?.[uid]?.location
  const myPowerUps = game?.players?.[uid]?.powerUps || []
  const myReveals = game?.players?.[uid]?.revealsLeft || 0

  // Only show power-ups relevant to the player's role
  const myRolePowerUps = myPowerUps.filter(type => {
    const info = POWERUP_TYPES[type]
    return info && (info.availableTo === role || info.availableTo === 'both')
  })

  // Proximity hint (not a gate)
  const nearbyRunner = role === 'it' && myLocation
    ? runners.find(r => r.location && distanceMetres(myLocation, r.location) <= TAG_PROXIMITY_M)
    : null

  const activeRunners = runners.filter(r => !r.isEliminated)

  /* ── Notification colours ──────────────────────────────────────────────── */
  const notifColors = {
    success: { bg: 'rgba(0,230,118,.12)', border: 'rgba(0,230,118,.35)', text: 'var(--green)' },
    danger:  { bg: 'rgba(255,59,59,.12)', border: 'rgba(255,59,59,.35)', text: 'var(--red)' },
    warning: { bg: 'rgba(255,214,0,.1)',  border: 'rgba(255,214,0,.35)',  text: 'var(--yellow)' },
    info:    { bg: 'rgba(68,138,255,.1)', border: 'rgba(68,138,255,.3)', text: 'var(--blue)' },
  }

  /* ── Render ────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>

      {/* ── Top HUD bar ── */}
      <div style={{
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: 'calc(var(--safe-top) + 8px) 12px 10px',
        background: 'rgba(0,0,0,.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        zIndex: 10,
      }}>
        <span style={{ color: 'var(--green)', fontFamily: 'var(--font-display)', fontSize: 13 }}>
          🏃 {activeRunners.length}
        </span>
        <span style={{ color: 'var(--red)', fontFamily: 'var(--font-display)', fontSize: 13 }}>
          🔴 {itPlayers.length}
        </span>
        {roundLeft != null && (
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 13,
            color: roundLeft <= 30 ? 'var(--red)' : 'var(--yellow)',
            animation: roundLeft <= 30 ? 'pulse 1s ease-in-out infinite' : 'none',
          }}>
            ⏱ {Math.floor(roundLeft / 60)}:{String(roundLeft % 60).padStart(2, '0')}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>
          <span className={`badge ${role === 'it' ? 'badge-red' : 'badge-green'}`}>
            {role === 'it' ? 'IT' : 'RUNNER'}
          </span>
        </span>
        <SoundToggle variant="pill" />
        {isHost && (
          <button
            className="btn-pill"
            style={{ minHeight: 30, padding: '5px 12px' }}
            onClick={() => setShowAdmin(true)}
          >
            🛠️
          </button>
        )}
        {outOfBounds && (
          <span style={{
            background: 'var(--red)', color: '#fff',
            fontFamily: 'var(--font-display)', fontSize: 10,
            letterSpacing: '0.08em', padding: '3px 8px',
            borderRadius: 'var(--radius-pill)',
            animation: 'pulse 1s ease-in-out infinite',
          }}>
            OUT OF BOUNDS
          </span>
        )}
      </div>

      {/* ── Map (fills remaining space) ── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Proximity danger vignette (runners) */}
        {dangerLevel > 0 && (
          <div className="danger-vignette" style={{ opacity: 0.25 + dangerLevel * 0.75 }} />
        )}

        {/* Recenter button */}
        <button
          className="map-fab"
          style={{ right: 12, bottom: 12 }}
          onClick={recenter}
          aria-label="Recenter on me"
        >
          🎯
        </button>

        {/* Legend */}
        <div className="map-legend" style={{ left: 12, bottom: 12 }}>
          <div className="map-legend-row">
            <span className="map-legend-dot" style={{ background: 'var(--blue)' }} /> You
          </div>
          <div className="map-legend-row">
            <span className="map-legend-dot" style={{ background: 'var(--red)' }} /> It
          </div>
          <div className="map-legend-row">
            <span className="map-legend-dot" style={{ background: 'var(--green)' }} /> Runner
          </div>
        </div>

        {/* Notification stack over map */}
        <div style={{
          position: 'absolute', top: 10, left: 10, right: 10,
          zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6,
          pointerEvents: 'none',
        }}>
          {notifications.map(n => {
            const c = notifColors[n.type] || notifColors.info
            return (
              <div key={n.id} style={{
                background: c.bg,
                border: `1px solid ${c.border}`,
                borderRadius: 'var(--radius-sm)',
                padding: '9px 14px',
                fontFamily: 'var(--font-body)',
                fontWeight: 600,
                fontSize: 13,
                color: c.text,
                backdropFilter: 'blur(8px)',
                animation: 'slideDown .2s ease',
              }}>
                {n.msg}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Bottom control panel (solid, always visible) ── */}
      <div style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '12px 12px calc(12px + var(--safe-bottom))',
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 10,
      }}>

        {/* Power-ups row */}
        {myRolePowerUps.length > 0 && (
          <div>
            <div className="label" style={{ marginBottom: 8 }}>
              Power-ups — tap to preview, hold to use
            </div>
            <div className="powerup-bar">
              {[...new Set(myRolePowerUps)].map(type => {
                const info = POWERUP_TYPES[type]
                const count = myRolePowerUps.filter(t => t === type).length
                return (
                  <button
                    key={type}
                    className="powerup-btn"
                    style={{ background: info.color + '18', borderColor: info.color + '55' }}
                    onClick={() => setPowerUpInfo({ type, info })}
                  >
                    <span style={{ fontSize: 24 }}>{info.emoji}</span>
                    {count > 1 && (
                      <span style={{
                        position: 'absolute', top: 3, right: 5,
                        fontSize: 9, fontWeight: 700,
                        fontFamily: 'var(--font-display)', color: '#fff',
                      }}>×{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Reveal buttons — It only */}
        {role === 'it' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, minHeight: 44, fontSize: 12, padding: '10px 8px' }}
              disabled={myReveals <= 0}
              onClick={() => handleReveal('REVEAL_RUNNER')}
            >
              📍 Reveal Runner <span style={{ color: 'var(--yellow)', marginLeft: 4 }}>({myReveals})</span>
            </button>
            <button
              className="btn btn-ghost"
              style={{ flex: 1, minHeight: 44, fontSize: 12, padding: '10px 8px' }}
              disabled={myReveals <= 0}
              onClick={() => handleReveal('CLUSTER_SCAN')}
            >
              👥 Clusters <span style={{ color: 'var(--yellow)', marginLeft: 4 }}>({myReveals})</span>
            </button>
          </div>
        )}

        {/* Tag button — It only */}
        {role === 'it' && (
          <button
            className="btn btn-primary"
            style={{ minHeight: 54, fontSize: 15 }}
            onClick={() => setShowTagSheet(true)}
            disabled={activeRunners.length === 0}
          >
            🏷️ Tag a Runner
            {nearbyRunner && (
              <span style={{
                marginLeft: 8, fontSize: 11,
                background: 'rgba(255,255,255,.2)',
                padding: '2px 8px', borderRadius: 'var(--radius-pill)',
              }}>
                {nearbyRunner.name} nearby!
              </span>
            )}
          </button>
        )}
      </div>

      {/* ── Power-up description popup ── */}
      {powerUpInfo && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,.7)',
            display: 'flex', alignItems: 'flex-end',
          }}
          onClick={() => setPowerUpInfo(null)}
        >
          <div
            style={{
              width: '100%',
              background: 'var(--surface)',
              borderTop: `2px solid ${powerUpInfo.info.color}`,
              borderRadius: 'var(--radius) var(--radius) 0 0',
              padding: '24px 20px calc(24px + var(--safe-bottom))',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: powerUpInfo.info.color + '22',
                border: `2px solid ${powerUpInfo.info.color}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28,
              }}>
                {powerUpInfo.info.emoji}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                  {powerUpInfo.info.label}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {powerUpInfo.info.durationMs / 1000}s duration
                </div>
              </div>
            </div>
            <div style={{
              fontSize: 15, color: 'var(--text-muted)',
              lineHeight: 1.6, marginBottom: 20,
            }}>
              {powerUpInfo.info.description}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setPowerUpInfo(null)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{
                  flex: 2,
                  background: powerUpInfo.info.color,
                  color: '#fff',
                  boxShadow: `0 4px 24px ${powerUpInfo.info.color}44`,
                }}
                onClick={() => handleActivatePowerUp(powerUpInfo.type)}
              >
                Use {powerUpInfo.info.emoji} {powerUpInfo.info.label}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tag selector sheet ── */}
      {showTagSheet && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            background: 'rgba(0,0,0,.75)',
            display: 'flex', alignItems: 'flex-end',
          }}
          onClick={() => setShowTagSheet(false)}
        >
          <div
            style={{
              width: '100%',
              background: 'var(--surface)',
              borderTop: '2px solid var(--red)',
              borderRadius: 'var(--radius) var(--radius) 0 0',
              padding: '20px 16px calc(20px + var(--safe-bottom))',
              maxHeight: '70vh',
              overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="title" style={{ fontSize: 18, marginBottom: 6 }}>🏷️ Tag a Runner</div>
            <div className="subtitle" style={{ fontSize: 13, marginBottom: 16 }}>
              Select a runner to send them a tag request
            </div>

            {activeRunners.length === 0 ? (
              <div className="subtitle" style={{ textAlign: 'center', padding: '20px 0' }}>
                No active runners
              </div>
            ) : (
              activeRunners.map(r => {
                const dist = myLocation && r.location
                  ? distanceMetres(myLocation, r.location)
                  : null
                const nearby = dist !== null && dist <= TAG_PROXIMITY_M
                const immune = isImmune(game, r.id)
                return (
                  <div
                    key={r.id}
                    className="player-row"
                    onClick={() => !immune && handleTagPlayer(r.id)}
                    style={{
                      cursor: immune ? 'not-allowed' : 'pointer',
                      opacity: immune ? 0.5 : 1,
                      padding: '12px 8px',
                      margin: '0 -8px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <div className="player-avatar" style={{
                      background: 'rgba(0,230,118,.12)',
                      border: `2px solid ${nearby ? 'var(--yellow)' : 'var(--green)'}`,
                    }}>
                      <span style={{ color: nearby ? 'var(--yellow)' : 'var(--green)' }}>
                        {r.name[0].toUpperCase()}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{r.name}</div>
                      {r.isGhost ? (
                        <div style={{ fontSize: 12, color: 'var(--purple)' }}>
                          👻 Phoneless — tag on sight
                        </div>
                      ) : dist !== null && (
                        <div style={{ fontSize: 12, color: nearby ? 'var(--yellow)' : 'var(--text-muted)' }}>
                          {nearby ? `⚡ ${Math.round(dist)}m away` : `~${Math.round(dist)}m away`}
                        </div>
                      )}
                    </div>
                    {immune
                      ? <span className="badge badge-blue">🛡️ Immune</span>
                      : r.isGhost
                        ? <span className="badge badge-purple">👻 Tag</span>
                        : nearby
                          ? <span className="badge badge-yellow">Nearby</span>
                          : <span className="badge badge-green">Tag</span>}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* ── Incoming tag confirmation overlay ── */}
      {tagRequest?.targetId === uid && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          background: 'rgba(0,0,0,.92)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: '32px 24px',
        }}>
          <div style={{
            width: 90, height: 90, borderRadius: '50%',
            background: 'rgba(255,59,59,.12)',
            border: '2px solid var(--red)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 44,
            boxShadow: '0 0 40px var(--red-glow)',
          }}>🏷️</div>

          <div className="title" style={{ textAlign: 'center', color: 'var(--red)' }}>YOU'VE BEEN TAGGED!</div>
          <div className="subtitle" style={{ textAlign: 'center' }}>
            Confirm or dispute — auto-confirms in {tagCountdown}s
          </div>

          <div style={{ width: '100%', height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${(tagCountdown / 5) * 100}%`,
              background: 'var(--red)',
              transition: 'width 1s linear',
              boxShadow: '0 0 8px var(--red-glow)',
            }} />
          </div>

          <div style={{ display: 'flex', gap: 12, width: '100%' }}>
            <button className="btn btn-ghost" style={{ flex: 1 }}
              onClick={() => { disputeTag(roomCode); setTagRequest(null); clearInterval(tagTimerRef.current) }}>
              Dispute
            </button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              onClick={() => {
                confirmTag(roomCode, uid, tagRequest.taggerId)
                setTagRequest(null)
                clearInterval(tagTimerRef.current)
              }}>
              Confirm Tag
            </button>
          </div>
        </div>
      )}

      {/* ── Host admin sheet ── */}
      {showAdmin && isHost && (
        <AdminSheet
          roomCode={roomCode}
          uid={uid}
          players={allPlayers}
          phase="game"
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  )
}
