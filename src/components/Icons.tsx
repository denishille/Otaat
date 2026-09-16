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

/** Die Bildmarke: acht Punkte auf der Kreisbahn, einer gefuellt. */
export const Mark = ({ className }: P) => {
  const R = 29
  const dots = Array.from({ length: 8 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 8
    return { x: 50 + R * Math.cos(a), y: 50 + R * Math.sin(a), on: i === 1 }
  })
  return (
    <svg viewBox="0 0 100 100" width="1em" height="1em" className={className} aria-hidden="true">
      <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="0.8" opacity=".3" />
      {dots.map((d, i) =>
        d.on ? (
          <circle key={i} cx={d.x} cy={d.y} r="7.1" fill="var(--cobalt)" />
        ) : (
          <circle key={i} cx={d.x} cy={d.y} r="5.8" fill="none" stroke="currentColor" strokeWidth="2.4" opacity=".55" />
        ),
      )}
    </svg>
  )
}
