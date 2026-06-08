import { useEffect, useRef, useCallback } from 'react'
import { updateLocation } from '../services/gameService.js'

const LOCATION_OPTIONS = {
  enableHighAccuracy: true,
  maximumAge: 3000,
  timeout: 10000,
}

export function useLocationTracking(roomCode, uid, enabled = true) {
  const watchId = useRef(null)

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current)
      watchId.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || !roomCode || !uid) return
    if (!navigator.geolocation) return

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        updateLocation(roomCode, uid, pos.coords.latitude, pos.coords.longitude).catch(() => {})
      },
      (err) => console.warn('Location error:', err.message),
      LOCATION_OPTIONS
    )

    return stop
  }, [enabled, roomCode, uid, stop])

  return { stop }
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
