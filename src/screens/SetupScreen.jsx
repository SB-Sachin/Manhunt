import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectIsHost, selectAllPlayers } from '../store/gameStore.js'
import { subscribeToGame, setBoundary, setItPlayers, startDispersal } from '../services/gameService.js'

export default function SetupScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame } = useGameStore()
  const isHost = useGameStore(selectIsHost)
  const players = useGameStore(selectAllPlayers)

  const [step, setStep] = useState('boundary')
  const [selectedIt, setSelectedIt] = useState([])
  const [points, setPoints] = useState([])

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const LRef = useRef(null)
  const dotMarkersRef = useRef([])
  const polylineRef = useRef(null)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'DISPERSAL') navigate('/dispersal')
      if (g.status === 'LIVE') navigate('/game')
    })
    return unsub
  }, [roomCode])

  /* ── Init Leaflet ──────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!isHost || step !== 'boundary') return
    if (mapRef.current) return

    import('leaflet').then((L) => {
      LRef.current = L
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, {
        zoomControl: true,
        attributionControl: false,
        tap: true,
        tapTolerance: 15,
      }).setView([37.7749, -122.4194], 16)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map)

      navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 17)
      })

      map.on('click', (e) => {
        setPoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }])
      })

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
      dotMarkersRef.current = []
      polylineRef.current = null
    }
  }, [isHost, step])

  /* ── Sync dots + preview polygon ───────────────────────────────────────── */
  useEffect(() => {
    const map = mapRef.current
    const L = LRef.current
    if (!map || !L) return

    dotMarkersRef.current.forEach(m => m.remove())
    dotMarkersRef.current = []
    polylineRef.current?.remove()
    polylineRef.current = null

    if (points.length === 0) return

    const latlngs = points.map(p => [p.lat, p.lng])

    points.forEach((p, i) => {
      const dot = L.circleMarker([p.lat, p.lng], {
        radius: i === 0 ? 9 : 6,
        color: '#fff', weight: 2,
        fillColor: i === 0 ? '#ffd600' : '#ff3b3b',
        fillOpacity: 1,
      }).addTo(map)
      dotMarkersRef.current.push(dot)
    })

    if (points.length >= 3) {
      polylineRef.current = L.polygon(latlngs, {
        color: '#ff3b3b', weight: 2,
        dashArray: '6 4', fillOpacity: 0.1, fillColor: '#ff3b3b',
      }).addTo(map)
    } else if (points.length >= 2) {
      polylineRef.current = L.polyline(latlngs, {
        color: '#ff3b3b', weight: 2, dashArray: '6 4',
      }).addTo(map)
    }
  }, [points])

  async function confirmBoundary() {
    await setBoundary(roomCode, points)
    setStep('select_it')
  }

  function toggleIt(id) {
    setSelectedIt(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function launchGame() {
    if (!selectedIt.length) return
    await setItPlayers(roomCode, selectedIt, 3)
    await startDispersal(roomCode)
    navigate('/dispersal')
  }

  /* ── Non-host waiting ─────────────────────────────────────────────────── */
  if (!isHost) {
    return (
      <div className="screen screen-padded" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>⚙️</div>
        <div className="title" style={{ fontSize: 22 }}>Host is setting up</div>
        <div className="subtitle pulse">Hang tight…</div>
      </div>
    )
  }

  /* ── Boundary drawing ─────────────────────────────────────────────────── */
  if (step === 'boundary') {
    const canConfirm = points.length >= 3

    return (
      /* Flex column — top bar + map + bottom bar. Map fills the gap. */
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>

        {/* Top bar */}
        <div style={{
          flexShrink: 0,
          padding: 'calc(var(--safe-top) + 12px) 16px 12px',
          background: 'rgba(0,0,0,.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          zIndex: 10,
        }}>
          <div className="title" style={{ fontSize: 18, marginBottom: 2 }}>Draw Boundary</div>
          <div className="subtitle" style={{ fontSize: 12 }}>
            {points.length === 0 && 'Tap the map to place your first point'}
            {points.length === 1 && 'Tap more points'}
            {points.length === 2 && 'One more point to go'}
            {points.length >= 3 && `${points.length} points — tap Confirm or keep adding`}
          </div>
        </div>

        {/* Map — fills remaining vertical space */}
        <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

          {/* Point count chip over the map */}
          {points.length > 0 && (
            <div style={{
              position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
              zIndex: 20, pointerEvents: 'none',
              background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)',
              border: `1px solid ${canConfirm ? 'rgba(0,230,118,.4)' : 'rgba(255,214,0,.4)'}`,
              borderRadius: 'var(--radius-pill)',
              padding: '5px 14px',
              fontFamily: 'var(--font-display)', fontSize: 12,
              color: canConfirm ? 'var(--green)' : 'var(--yellow)',
            }}>
              {points.length} point{points.length !== 1 ? 's' : ''}
              {canConfirm ? ' ✓ ready' : ` — need ${3 - points.length} more`}
            </div>
          )}
        </div>

        {/* Bottom controls */}
        <div style={{
          flexShrink: 0,
          padding: '12px 16px calc(12px + var(--safe-bottom))',
          background: 'rgba(0,0,0,.92)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', gap: 8,
          zIndex: 10,
        }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ flex: 1, minHeight: 44 }}
              disabled={points.length === 0} onClick={() => setPoints(p => p.slice(0, -1))}>
              ↩ Undo
            </button>
            <button className="btn btn-ghost" style={{ flex: 1, minHeight: 44 }}
              disabled={points.length === 0} onClick={() => setPoints([])}>
              ✕ Clear
            </button>
          </div>
          <button className="btn btn-primary" disabled={!canConfirm} onClick={confirmBoundary}>
            {canConfirm ? 'Confirm Boundary →' : `Add ${3 - points.length} more point${3 - points.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    )
  }

  /* ── Select "It" ──────────────────────────────────────────────────────── */
  const itCount = selectedIt.length
  const runnerCount = players.length - itCount

  return (
    <div className="screen screen-padded">
      <div>
        <div className="title" style={{ fontSize: 22 }}>Select "It" Players</div>
        <div className="subtitle" style={{ marginTop: 4 }}>Tap to toggle a player's role</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--red)' }}>{itCount}</div>
          <div className="label" style={{ marginBottom: 0, color: 'var(--red)' }}>It</div>
        </div>
        <div className="card" style={{ flex: 1, textAlign: 'center', padding: '12px 8px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--green)' }}>{runnerCount}</div>
          <div className="label" style={{ marginBottom: 0, color: 'var(--green)' }}>Runners</div>
        </div>
      </div>

      <div className="card" style={{ flex: 1, overflowY: 'auto' }}>
        {players.map(p => {
          const isIt = selectedIt.includes(p.id)
          return (
            <div key={p.id} className="player-row" onClick={() => toggleIt(p.id)}
              style={{ cursor: 'pointer', padding: '12px 8px', margin: '0 -8px', borderRadius: 'var(--radius-sm)' }}>
              <div className="player-avatar" style={{
                background: isIt ? 'rgba(255,59,59,.15)' : 'rgba(0,230,118,.12)',
                border: `2px solid ${isIt ? 'var(--red)' : 'var(--green)'}`,
              }}>
                <span style={{ color: isIt ? 'var(--red)' : 'var(--green)' }}>
                  {p.name[0].toUpperCase()}
                </span>
              </div>
              <div style={{ flex: 1, fontWeight: 600 }}>{p.name}</div>
              {isIt
                ? <span className="badge badge-red">IT</span>
                : <span className="badge badge-green">RUNNER</span>}
            </div>
          )
        })}
      </div>

      <button className="btn btn-primary" disabled={itCount === 0 || itCount >= players.length} onClick={launchGame}>
        {itCount === 0 ? 'Select at least 1 "It"' : `Launch — ${itCount} It · ${runnerCount} Runners`}
      </button>
    </div>
  )
}
