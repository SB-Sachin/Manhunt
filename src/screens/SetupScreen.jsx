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
  const [polygon, setPolygon] = useState([])

  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const drawnItemsRef = useRef(null)

  useEffect(() => {
    if (!roomCode) { navigate('/'); return }
    const unsub = subscribeToGame(roomCode, (g) => {
      setGame(g)
      if (g.status === 'DISPERSAL') navigate('/dispersal')
      if (g.status === 'LIVE') navigate('/game')
    })
    return unsub
  }, [roomCode])

  useEffect(() => {
    if (!isHost || step !== 'boundary') return
    if (mapRef.current) return

    Promise.all([import('leaflet'), import('leaflet-draw')]).then(([L]) => {
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, { zoomControl: true }).setView([37.7749, -122.4194], 16)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      navigator.geolocation.getCurrentPosition(pos => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 17)
      })

      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems

      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: false },
        draw: {
          polygon: { shapeOptions: { color: '#ff3b3b', fillOpacity: 0.12 }, showArea: false },
          polyline: false, rectangle: false, circle: false, circlemarker: false, marker: false,
        },
      })
      map.addControl(drawControl)

      map.on(L.Draw.Event.CREATED, (e) => {
        drawnItems.clearLayers()
        drawnItems.addLayer(e.layer)
        setPolygon(e.layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng })))
      })
      map.on(L.Draw.Event.EDITED, () => {
        const layers = drawnItems.getLayers()
        if (layers.length) setPolygon(layers[0].getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng })))
      })

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
    }
  }, [isHost, step])

  function redrawBoundary() {
    drawnItemsRef.current?.clearLayers()
    setPolygon([])
  }

  async function confirmBoundary() {
    await setBoundary(roomCode, polygon)
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

  if (!isHost) {
    return (
      <div className="screen screen-padded" style={{ justifyContent: 'center', alignItems: 'center', gap: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 52 }}>⚙️</div>
        <div className="title" style={{ fontSize: 22 }}>Host is setting up</div>
        <div className="subtitle pulse">Hang tight…</div>
      </div>
    )
  }

  /* ── Boundary drawing step ── */
  if (step === 'boundary') {
    return (
      <div className="screen" style={{ height: '100dvh' }}>
        {/* Top bar */}
        <div style={{
          padding: '16px 20px 12px',
          background: 'rgba(0,0,0,.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div className="title" style={{ fontSize: 20 }}>Draw Boundary</div>
          <div className="subtitle" style={{ fontSize: 12, marginTop: 4 }}>
            Tap the polygon tool (top-left) → click points → double-click to close
          </div>
        </div>

        {/* Map */}
        <div ref={mapContainerRef} style={{ flex: 1, width: '100%' }} />

        {/* Bottom bar */}
        <div style={{
          padding: '14px 16px calc(14px + var(--safe-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'rgba(0,0,0,.9)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          {polygon.length > 0 && (
            <button className="btn btn-ghost" onClick={redrawBoundary}>Redraw</button>
          )}
          <button
            className="btn btn-primary"
            disabled={polygon.length < 3}
            onClick={confirmBoundary}
          >
            {polygon.length < 3
              ? `Place ${Math.max(0, 3 - polygon.length)} more point${polygon.length === 2 ? '' : 's'}`
              : 'Confirm Boundary →'}
          </button>
        </div>
      </div>
    )
  }

  /* ── Select "It" step ── */
  const itCount = selectedIt.length
  const runnerCount = players.length - itCount

  return (
    <div className="screen screen-padded">
      <div>
        <div className="title" style={{ fontSize: 22 }}>Select "It" Players</div>
        <div className="subtitle" style={{ marginTop: 4 }}>
          Tap a player to toggle their role
        </div>
      </div>

      {/* Tally */}
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

      {/* Player list */}
      <div className="card" style={{ flex: 1 }}>
        {players.map(p => {
          const isIt = selectedIt.includes(p.id)
          return (
            <div
              key={p.id}
              className="player-row"
              onClick={() => toggleIt(p.id)}
              style={{ cursor: 'pointer', padding: '12px 8px', margin: '0 -8px', borderRadius: 'var(--radius-sm)', transition: 'background .1s' }}
            >
              <div
                className="player-avatar"
                style={{
                  background: isIt ? 'rgba(255,59,59,.15)' : 'rgba(0,230,118,.12)',
                  border: `2px solid ${isIt ? 'var(--red)' : 'var(--green)'}`,
                }}
              >
                <span style={{ color: isIt ? 'var(--red)' : 'var(--green)' }}>
                  {p.name[0].toUpperCase()}
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
              </div>
              {isIt
                ? <span className="badge badge-red">IT</span>
                : <span className="badge badge-green">RUNNER</span>}
            </div>
          )
        })}
      </div>

      <button
        className="btn btn-primary"
        disabled={itCount === 0 || itCount >= players.length}
        onClick={launchGame}
        style={{ marginTop: 'auto' }}
      >
        {itCount === 0
          ? 'Select at least 1 "It"'
          : `Launch — ${itCount} It · ${runnerCount} Runners`}
      </button>
    </div>
  )
}
