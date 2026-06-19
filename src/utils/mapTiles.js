/* ─── Base map tiles with automatic fallback ───────────────────────────────
   Primary: Carto Voyager (clearest streets/labels). If those tiles fail to load
   — some school/corporate networks block the Carto CDN — we switch to
   OpenStreetMap so the map never ends up a blank dark rectangle.
   ─────────────────────────────────────────────────────────────────────────── */

const CARTO = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const OSM = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

export function addBaseTiles(L, map) {
  let fellBack = false
  let errors = 0

  const carto = L.tileLayer(CARTO, { maxZoom: 20, subdomains: 'abcd' })

  carto.on('tileerror', () => {
    // A few misses are normal; only fall back if loading is clearly failing.
    if (fellBack) return
    if (++errors < 4) return
    fellBack = true
    try { map.removeLayer(carto) } catch { /* ignore */ }
    L.tileLayer(OSM, { maxZoom: 19 }).addTo(map)
  })

  carto.addTo(map)
}
