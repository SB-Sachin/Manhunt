import { useEffect, useRef, useCallback, useState } from 'react'
import { updateLocation, heartbeat, reassignHostIfStale } from '../services/gameService.js'

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 3000,
  timeout: 10000,
}

export function useLocationTracking(roomCode, uid, enabled = true) {
  const watchId = useRef(null)
  // 'ok' once we've had a fix, 'error' if GPS/permission fails, null before either
  const [status, setStatus] = useState(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !roomCode || !uid) return
    if (!navigator.geolocation) { setStatus('error'); return }

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('ok')
        updateLocation(roomCode, uid, pos.coords.latitude, pos.coords.longitude).catch(() => {})
      },
      (err) => { setStatus('error'); console.warn('Location error:', err.message) },
      LOCATION_OPTIONS
    )

    return stop
  }, [enabled, roomCode, uid, stop])

  return { stop, status }
}

/*
 * Presence: write a lastSeen heartbeat every 10s and opportunistically promote a
 * new host if the current one has gone stale. Used on all in-game screens so the
 * game survives a host whose phone dies — including in the lobby (no GPS yet).
 */
export function usePresence(roomCode, uid) {
  useEffect(() => {
    if (!roomCode || !uid) return
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      heartbeat(roomCode, uid).catch(() => {})
      reassignHostIfStale(roomCode).catch(() => {})
    }
    tick()
    const id = setInterval(tick, 10000)
    return () => { cancelled = true; clearInterval(id) }
  }, [roomCode, uid])
}

export function requestLocationPermission() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })
}

/* Friendly message for a geolocation failure (raw messages are cryptic). */
export function locationErrorMessage(err) {
  if (err?.code === 1) return 'Location access was blocked. Enable it for this site, then try again.'
  if (err?.code === 2) return "Couldn't get your location. Check your GPS/signal and try again."
  if (err?.code === 3) return 'Location timed out. Move somewhere with better signal and try again.'
  return 'Location is required to play. Enable it and try again.'
}
