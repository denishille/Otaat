import { useEffect, useRef } from 'react'

/* Wischen, um zu blaettern.
   -----------------------------------------------------------------------
   Absichtlich nur `touch`: mit der Maus gibt es die Pfeile, und ein Zug mit
   gedrueckter Taste ist dort fast immer eine Textmarkierung. Pointer-Events
   waeren der modernere Weg, taugen hier aber schlecht — sobald die Seite
   mitscrollt, schickt der Browser ein `pointercancel` und die Geste ist weg,
   noch bevor man weiss, ob sie waagerecht war. */

/** Ab hier ist es ein Wisch und kein verrutschter Finger. */
const MIN_X = 55
/** Wie viel gerader der Wisch sein muss als das Scrollen daneben. */
const RATIO = 1.5
/** Was laenger dauert, ist Ziehen oder Nachdenken, kein Wischen. */
const MAX_MS = 700

interface Opts {
  /** Finger nach links: der Inhalt wandert mit, es kommt das Naechste. */
  onLeft: () => void
  onRight: () => void
}

export function useSwipe({ onLeft, onRight }: Opts) {
  // Die Handler wechseln bei jedem Rendern die Identitaet. Ueber ein Ref
  // bleiben die Listener trotzdem einmal haengen, statt sich im Takt der
  // Tastatureingaben ab- und wieder anzumelden.
  const cb = useRef({ onLeft, onRight })
  cb.current = { onLeft, onRight }

  useEffect(() => {
    let x = 0
    let y = 0
    let t = 0
    let live = false

    const start = (e: TouchEvent) => {
      live = false
      if (e.touches.length !== 1) return
      const el = e.target as HTMLElement | null
      // Ein offenes Blatt hat seine eigene Bedienung. Und wo man etwas
      // eintraegt, eine Karte am Griff verschiebt oder ueber eine Skala
      // faehrt, ist ein waagerechter Zug alles Moegliche, nur kein Blaettern.
      if (el?.closest('.scrim, input, textarea, select, .grip, .scale')) return
      const p = e.touches[0]
      x = p.clientX
      y = p.clientY
      t = Date.now()
      live = true
    }

    const end = (e: TouchEvent) => {
      if (!live) return
      live = false
      const p = e.changedTouches[0]
      if (!p || Date.now() - t > MAX_MS) return
      const dx = p.clientX - x
      const dy = p.clientY - y
      if (Math.abs(dx) < MIN_X || Math.abs(dx) < Math.abs(dy) * RATIO) return
      if (dx < 0) cb.current.onLeft()
      else cb.current.onRight()
    }

    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchend', end)
    }
  }, [])
}
