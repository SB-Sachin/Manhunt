import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore, selectIsHost, selectAllPlayers } from '../store/gameStore.js'
import { subscribeToGame, setBoundary, setItPlayers, startDispersal } from '../services/gameService.js'

export default function SetupScreen() {
  const navigate = useNavigate()
  const { roomCode, uid, setGame, game } = useGameStore()
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

  // Init Leaflet map once we're on the boundary step and container is mounted
  useEffect(() => {
    if (!isHost || step !== 'boundary') return
    if (mapRef.current) return // already init'd

    // Dynamic import so SSR/build doesn't break
    Promise.all([
      import('leaflet'),
      import('leaflet-draw'),
    ]).then(([L]) => {
      const container = mapContainerRef.current
      if (!container || mapRef.current) return

      const map = L.map(container, { zoomControl: true }).setView([37.7749, -122.4194], 16)

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map)

      // Center on user
      navigator.geolocation.getCurrentPosition((pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 17)
      })

      const drawnItems = new L.FeatureGroup()
      map.addLayer(drawnItems)
      drawnItemsRef.current = drawnItems

      const drawControl = new L.Control.Draw({
        edit: { featureGroup: drawnItems, remove: false },
        draw: {
          polygon: {
            shapeOptions: { color: '#ef4444', fillOpacity: 0.15 },
            showArea: false,
          },
          polyline: false,
          rectangle: false,
          circle: false,
          circlemarker: false,
          marker: false,
        },
      })
      map.addControl(drawControl)

      map.on(L.Draw.Event.CREATED, (e) => {
        drawnItems.clearLayers()
        drawnItems.addLayer(e.layer)
        const coords = e.layer.getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng }))
        setPolygon(coords)
      })

      map.on(L.Draw.Event.EDITED, () => {
        const layers = drawnItems.getLayers()
        if (layers.length) {
          const coords = layers[0].getLatLngs()[0].map(ll => ({ lat: ll.lat, lng: ll.lng }))
          setPolygon(coords)
        }
      })

      mapRef.current = map
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [isHost, step])

  function redrawBoundary() {
    if (drawnItemsRef.current) drawnItemsRef.current.clearLayers()
    setPolygon([])
  }

  async function confirmBoundary() {
    await setBoundary(roomCode, polygon)
    setStep('select_it')
  }

  function toggleIt(playerId) {
    setSelectedIt(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    )
  }

  async function launchGame() {
    if (selectedIt.length === 0) return
    await setItPlayers(roomCode, selectedIt, 3)
    await startDispersal(roomCode)
    navigate('/dispersal')
  }

  if (!isHost) {
    return (
      <div className="screen screen-padded" style={{ justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>⏳</div>
        <div className="title" style={{ fontSize: 22 }}>Host is setting up</div>
        <div className="subtitle">Hang tight…</div>
      </div>
    )
  }

  if (step === 'boundary') {
    return (
      <div className="screen" style={{ height: '100dvh' }}>
        <div style={{ padding: '16px 16px 8px', background: 'var(--bg)', flexShrink: 0 }}>
          <div className="title" style={{ fontSize: 20 }}>Draw Boundary</div>
          <div className="subtitle" style={{ fontSize: 13 }}>
            Tap the polygon tool (toolbar top-left) then click to place points. Double-click to close.
          </div>
        </div>

        <div ref={mapContainerRef} style={{ flex: 1, width: '100%' }} />

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg)', flexShrink: 0 }}>
          {polygon.length > 0 && (
            <button className="btn btn-ghost" onClick={redrawBoundary}>Redraw</button>
          )}
          <button
            className="btn btn-primary"
            disabled={polygon.length < 3}
            onClick={confirmBoundary}
          >
            {polygon.length < 3 ? 'Draw a polygon to continue' : 'Confirm Boundary →'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen screen-padded">
      <div>
        <div className="title" style={{ fontSize: 22 }}>Select "It" Players</div>
        <div className="subtitle">Tap players to assign them as "It"</div>
      </div>

      <div className="card">
        {players.map(p => {
          const isIt = selectedIt.includes(p.id)
          return (
            <div
              key={p.id}
              className="player-row"
              onClick={() => toggleIt(p.id)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div className="player-avatar" style={{ background: isIt ? 'var(--red)' : avatarColor(p.name) }}>
                {p.name[0].toUpperCase()}
              </div>
              <div style={{ flex: 1, fontWeight: 600 }}>{p.name}</div>
              {isIt
                ? <span className="badge badge-red">IT</span>
                : <span className="badge badge-green">Runner</span>}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 'auto' }}>
        <button
          className="btn btn-primary"
          disabled={selectedIt.length === 0 || selectedIt.length >= players.length}
          onClick={launchGame}
        >
          {selectedIt.length === 0
            ? 'Select at least 1 "It"'
            : `Start Game — ${selectedIt.length} It, ${players.length - selectedIt.length} Runners`}
        </button>
      </div>
    </div>
  )
}

function avatarColor(name) {
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#db2777']
  let hash = 0
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  return colors[Math.abs(hash) % colors.length]
}
