/* Bewusst klein gehalten. Ein Icon nur da, wo Text laenger waere als klar. */

type P = { className?: string }
const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export const Check = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M3 8.5 6.3 12 13 4.5" /></svg>
)
export const Plus = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M8 3v10M3 8h10" /></svg>
)
export const X = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M4 4l8 8M12 4l-8 8" /></svg>
)
export const ChevL = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M10 3 5 8l5 5" /></svg>
)
export const ChevR = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M6 3l5 5-5 5" /></svg>
)
export const Trash = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5 5 13h6l.5-8.5" /></svg>
)
export const Sun = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><circle cx="8" cy="8" r="3" /><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.2 3.2l1 1M11.8 11.8l1 1M12.8 3.2l-1 1M4.2 11.8l-1 1" /></svg>
)
export const Moon = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7Z" /></svg>
)
export const Link = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M6.5 9.5a3 3 0 0 0 4.2 0l1.8-1.8a3 3 0 0 0-4.2-4.2l-1 1M9.5 6.5a3 3 0 0 0-4.2 0L3.5 8.3a3 3 0 0 0 4.2 4.2l1-1" /></svg>
)
export const Pencil = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}>
    <path d="M11.1 2.6a1.6 1.6 0 0 1 2.3 2.3L5.6 12.7l-3 .7.7-3Z" />
    <path d="M10 3.7 12.3 6" />
  </svg>
)
export const Cal = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><rect x="2" y="3.5" width="12" height="10" rx="2" /><path d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5" /></svg>
)
export const Grip = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" {...p}>
    <circle cx="6" cy="4" r="1.15" /><circle cx="10" cy="4" r="1.15" />
    <circle cx="6" cy="8" r="1.15" /><circle cx="10" cy="8" r="1.15" />
    <circle cx="6" cy="12" r="1.15" /><circle cx="10" cy="12" r="1.15" />
  </svg>
)
export const Dots = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" fill="currentColor" {...p}><circle cx="4" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12" cy="8" r="1.3" /></svg>
)

/**
 * Die Bildmarke: ein Bogen laeuft ueber den Kranz bis zum gefuellten Punkt.
 * Ein Feld ausgefuellt in einer Menge — der Kreis ist der Tag, der Bogen das
 * Stueck, das schon hinter einem liegt. Die Punkte werden zum aktiven hin
 * praesenter, damit der Kranz eine Richtung bekommt.
 */
export const Mark = ({ className }: P) => {
  const C = 50
  const R = 30
  const N = 12
  const ON = 4
  const TOP = -Math.PI / 2
  const step = (Math.PI * 2) / N
  const pol = (r: number, a: number) => [C + r * Math.cos(a), C + r * Math.sin(a)] as const

  const [sx, sy] = pol(R, TOP)
  const [ex, ey] = pol(R, TOP + (ON - 0.42) * step)
  const [ax, ay] = pol(R, TOP + ON * step)

  return (
    <svg viewBox="0 0 100 100" width="1em" height="1em" className={className} aria-hidden="true">
      <path
        d={`M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`}
        fill="none" stroke="var(--cobalt)" strokeWidth="3.6" strokeLinecap="round"
      />
      {Array.from({ length: N }, (_, i) => {
        if (i === ON) return null
        const [x, y] = pol(R, TOP + i * step)
        const near = 1 - Math.min(Math.abs(i - ON), N - Math.abs(i - ON)) / (N / 2)
        return <circle key={i} cx={x} cy={y} r="3" fill="currentColor" opacity={0.45 + near * 0.45} />
      })}
      <circle cx={ax} cy={ay} r="7.2" fill="var(--cobalt)" />
    </svg>
  )
}

/* Drei Striche, von lang nach kurz: sortieren. */
export const Sort = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}>
    <path d="M2.5 4h11M2.5 8h7M2.5 12h3.5" />
  </svg>
)

/* Pfeil nach oben / unten, fuer das Umsortieren in der Liste. */
export const Up = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M8 13V3.5M3.5 8 8 3.5 12.5 8" /></svg>
)
export const Down = (p: P) => (
  <svg viewBox="0 0 16 16" width="1em" height="1em" {...base} {...p}><path d="M8 3v9.5M3.5 8 8 12.5 12.5 8" /></svg>
)
