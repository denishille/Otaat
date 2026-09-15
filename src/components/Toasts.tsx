import { useEffect, useState } from 'react'

export interface Toast { id: number; text: string; xp?: number }

let push: ((t: Omit<Toast, 'id'>) => void) | null = null
let seq = 0

/** Von ueberall aufrufbar, ohne Context-Gefrickel. */
export const toast = (text: string, xp?: number) => push?.({ text, xp })

export function Toasts() {
  const [items, setItems] = useState<Toast[]>([])

  useEffect(() => {
    push = (t) => {
      const item = { ...t, id: ++seq }
      setItems((cur) => [...cur, item])
      setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== item.id)), 2600)
    }
    return () => { push = null }
  }, [])

  if (!items.length) return null
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div className="toast" key={t.id}>
          {t.text}
          {t.xp ? <b>+{t.xp} XP</b> : null}
        </div>
      ))}
    </div>
  )
}
