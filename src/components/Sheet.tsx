import { useEffect, type ReactNode } from 'react'
import { X } from './Icons'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/* Wie viele Blaetter gerade offen sind. Ein Blatt kann ein zweites oeffnen —
   dann darf das erste beim Schliessen des zweiten nicht schon aufsperren. */
let locks = 0
let lockedAt = 0

/**
 * Sperrt die Seite dahinter. Auf dem iPhone reicht `overflow: hidden` am Body
 * nicht, Safari scrollt trotzdem weiter — deshalb wird der Body festgestellt
 * und die Scrollposition beim Schliessen wiederhergestellt.
 */
function lockPage(): () => void {
  if (locks++ === 0) {
    lockedAt = window.scrollY
    const b = document.body
    b.style.position = 'fixed'
    b.style.top = `-${lockedAt}px`
    b.style.left = '0'
    b.style.right = '0'
    b.style.overflow = 'hidden'
  }
  return () => {
    if (--locks > 0) return
    const b = document.body
    b.style.position = ''
    b.style.top = ''
    b.style.left = ''
    b.style.right = ''
    b.style.overflow = ''
    window.scrollTo(0, lockedAt)
  }
}

export function Sheet({ title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(lockPage, [])

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" style={wide ? { width: 'min(900px, 100%)' } : undefined} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="iconbtn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Schließen"><X /></button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}
