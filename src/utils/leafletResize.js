/* ─── Loop-safe auto-resize for Leaflet maps in flex containers ─────────────
   Leaflet maps inside a flexbox column often initialise with zero size (grey
   map), so we must call invalidateSize() once the layout settles. Doing that
   straight from a ResizeObserver is dangerous: invalidateSize() can nudge
   layout, which re-fires the observer, which calls invalidateSize() again — a
   feedback loop that can peg the main thread and FREEZE the tab.

   This helper makes it safe by:
     • debouncing every call through requestAnimationFrame (never synchronous),
     • ignoring observer events where the box size didn't actually change,
     • guarding against the map having been removed.
   Returns a cleanup function.
   ─────────────────────────────────────────────────────────────────────────── */
export function attachAutoResize(map, container, isAlive = () => true) {
  let raf = 0
  let lastW = 0
  let lastH = 0

  const run = () => {
    raf = 0
    if (!isAlive() || !map._container) return
    try { map.invalidateSize() } catch { /* map already removed */ }
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(run) }

  // Initial settle passes (mount, fonts/tiles, late layout)
  schedule()
  const t1 = setTimeout(schedule, 200)
  const t2 = setTimeout(schedule, 600)

  let observer = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      const w = Math.round(cr.width)
      const h = Math.round(cr.height)
      if (w === lastW && h === lastH) return   // no real change → break the loop
      lastW = w
      lastH = h
      schedule()
    })
    observer.observe(container)
  }

  return () => {
    if (raf) cancelAnimationFrame(raf)
    clearTimeout(t1)
    clearTimeout(t2)
    observer?.disconnect()
  }
}
