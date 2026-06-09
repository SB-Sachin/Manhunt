// Haversine distance in metres between two {lat,lng} points
export function distanceMetres(a, b) {
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

function toRad(deg) { return (deg * Math.PI) / 180 }

// Ray-casting point-in-polygon for [{lat,lng}] polygon
export function pointInPolygon(point, polygon) {
  let inside = false
  const { lat: py, lng: px } = point
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const { lat: iy, lng: ix } = polygon[i]
    const { lat: jy, lng: jx } = polygon[j]
    const intersect =
      iy > py !== jy > py && px < ((jx - ix) * (py - iy)) / (jy - iy) + ix
    if (intersect) inside = !inside
  }
  return inside
}

// Bounding box of a polygon
function bbox(polygon) {
  const lats = polygon.map(p => p.lat)
  const lngs = polygon.map(p => p.lng)
  return {
    minLat: Math.min(...lats), maxLat: Math.max(...lats),
    minLng: Math.min(...lngs), maxLng: Math.max(...lngs),
  }
}

// Random point inside a polygon (rejection sampling)
export function randomPointInPolygon(polygon) {
  if (!polygon || polygon.length < 3) return null
  const box = bbox(polygon)
  let attempts = 0
  while (attempts < 100) {
    const point = {
      lat: box.minLat + Math.random() * (box.maxLat - box.minLat),
      lng: box.minLng + Math.random() * (box.maxLng - box.minLng),
    }
    if (pointInPolygon(point, polygon)) return point
    attempts++
  }
  return polygon[0]
}

// Centroid (average vertex) of a polygon
export function polygonCentroid(polygon) {
  if (!polygon || !polygon.length) return null
  const sum = polygon.reduce(
    (acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }),
    { lat: 0, lng: 0 }
  )
  return { lat: sum.lat / polygon.length, lng: sum.lng / polygon.length }
}

// Shrink a polygon toward its centroid. factor 0 = unchanged, 1 = collapsed.
export function shrinkPolygon(polygon, factor) {
  if (!polygon || polygon.length < 3 || !factor) return polygon
  const c = polygonCentroid(polygon)
  const t = Math.max(0, Math.min(1, factor))
  return polygon.map(p => ({
    lat: p.lat + (c.lat - p.lat) * t,
    lng: p.lng + (c.lng - p.lng) * t,
  }))
}

// Compute simple cluster centres from player locations
export function computeClusters(players, radiusMetres = 50) {
  const locations = Object.values(players)
    .filter(p => p.role === 'runner' && p.location && !p.isEliminated)
    .map(p => p.location)

  if (locations.length === 0) return []

  const visited = new Set()
  const clusters = []

  for (let i = 0; i < locations.length; i++) {
    if (visited.has(i)) continue
    const members = [locations[i]]
    for (let j = i + 1; j < locations.length; j++) {
      if (!visited.has(j) && distanceMetres(locations[i], locations[j]) <= radiusMetres) {
        members.push(locations[j])
        visited.add(j)
      }
    }
    visited.add(i)
    const centre = {
      lat: members.reduce((s, p) => s + p.lat, 0) / members.length,
      lng: members.reduce((s, p) => s + p.lng, 0) / members.length,
      count: members.length,
    }
    clusters.push(centre)
  }

  return clusters.filter(c => c.count > 1)
}
