import { useMemo, useRef, useState } from 'react'
import type { AppState, CheckDef } from '../lib/types'
import { byWeekday, fmt, series, summarize, type Point } from '../lib/stats'
import { findInsights, loggedDays, MIN_DAYS, strengthLabel } from '../lib/insights'
import { longDate, shortDate } from '../lib/dates'
import { Sheet } from '../components/Sheet'

const RANGES = [30, 60, 90] as const

export function CheckStats({
  state, def, onClose, onEdit,
}: {
  state: AppState
  def: CheckDef
  onClose: () => void
  onEdit: () => void
}) {
  const [days, setDays] = useState<number>(30)

  const points = useMemo(() => series(state, def, days), [state, def, days])
  const sum = useMemo(() => summarize(def, points), [def, points])
  const week = useMemo(() => byWeekday(points), [points])
  const related = useMemo(() => {
    if (loggedDays(state) < MIN_DAYS) return []
    return findInsights(state).filter((i) => i.a.id === def.id || i.b.id === def.id).slice(0, 4)
  }, [state, def])

  return (
    <Sheet
      title={def.name}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" onClick={onEdit} style={{ marginRight: 'auto' }}>Bearbeiten</button>
          <button className="btn btn--primary" onClick={onClose}>Schließen</button>
        </>
      }
    >
      {/* Nur Beschreibendes. Serie und "Ziel getroffen" haengen beide am
          Zielwert und sind hier raus. */}
      <div className="stat-row">
        <Tile k="Schnitt" v={fmt(def, sum.avg, sum.isRate)} />
        {!sum.isRate && <Tile k="Höchstwert" v={fmt(def, sum.max)} />}
        {!sum.isRate && <Tile k="Tiefstwert" v={fmt(def, sum.min)} />}
        <Tile k="Erfasst" v={String(sum.n)} sub={`von ${days}`} />
      </div>

      <section>
        <div className="chart-head">
          <h4>Verlauf</h4>
          <div className="choice">
            {RANGES.map((r) => (
              <button key={r} aria-pressed={days === r} onClick={() => setDays(r)}>{r} T</button>
            ))}
          </div>
        </div>
        {sum.n === 0
          ? <div className="empty"><strong>Noch nichts erfasst.</strong>Trag den Check ein paar Tage ein, dann steht hier ein Verlauf.</div>
          : <Trend def={def} points={points} rate={sum.isRate} avg={sum.avg} />}
      </section>

      {sum.n >= 7 && (
        <section>
          <div className="chart-head"><h4>Nach Wochentag</h4></div>
          <Weekdays def={def} week={week} rate={sum.isRate} />
        </section>
      )}

      {related.length > 0 && (
        <section>
          <div className="chart-head"><h4>Hängt zusammen mit</h4></div>
          {related.map((i) => (
            <div className="insight" key={`${i.a.id}-${i.b.id}-${i.lagged}`}>
              <div className="insight-text">
                War <b>{i.a.name}</b> hoch, war <b>{i.b.name}</b>{' '}
                {i.lagged ? 'am nächsten Tag' : 'am selben Tag'} meist <b>{i.r > 0 ? 'hoch' : 'niedrig'}</b>.
              </div>
              <div className="insight-meta">
                <span>{strengthLabel(i.r)}</span>
                <div className={'insight-bar ' + (i.r > 0 ? 'insight-bar--up' : 'insight-bar--down')}>
                  <i style={{ width: `${Math.min(100, Math.abs(i.r) * 100)}%` }} />
                </div>
                <span>{i.n} T</span>
              </div>
            </div>
          ))}
        </section>
      )}

    </Sheet>
  )
}

function Tile({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="stat-tile">
      <div className="daysum-k">{k}</div>
      <div className="stat-tile-v">{v}{sub && <small> {sub}</small>}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- */

/** Ein Balken je Tag. Fehlende Tage bleiben leer statt interpoliert zu werden. */
function Trend({ def, points, rate, avg }: { def: CheckDef; points: Point[]; rate: boolean; avg: number | null }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null)
  const top = Math.max(...vals, rate ? 1 : 0) || 1

  /**
   * Bei 90 Tagen ist ein Balken drei Pixel breit — zu schmal, um ihn zu
   * treffen. Gegriffen wird deshalb auf der ganzen Flaeche: die x-Position
   * bestimmt den Tag, und Ziehen faehrt den Verlauf ab. Der `title`-Text
   * bleibt fuer die Maus, auf dem Handy gibt es ihn nicht.
   */
  const plotRef = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<string | null>(null)
  const sel = pick ? points.find((p) => p.date === pick) ?? null : null

  const pickAt = (clientX: number) => {
    const r = plotRef.current?.getBoundingClientRect()
    if (!r || !points.length) return
    const i = Math.floor(((clientX - r.left) / r.width) * points.length)
    setPick(points[Math.max(0, Math.min(points.length - 1, i))].date)
  }

  return (
    <div className="chart">
      <div
        className="chart-plot chart-plot--pick"
        ref={plotRef}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); pickAt(e.clientX) }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) pickAt(e.clientX) }}
        onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
      >
        {points.map((p) => (
          <div
            key={p.date}
            className={'chart-bar' + (p.value === null ? ' chart-bar--empty' : '') + (p.date === pick ? ' chart-bar--pick' : '')}
            style={{ height: p.value === null ? '2px' : `max(3px, ${(p.value / top) * 100}%)` }}
            title={`${shortDate(p.date)} — ${p.value === null ? 'nichts erfasst' : fmt(def, p.value, rate)}`}
          />
        ))}
      </div>
      {/* Dieselbe Zeile traegt entweder den Zeitraum oder den gegriffenen Tag —
          so springt beim Antippen nichts. */}
      <div className="chart-axis">
        {sel ? (
          <span className="chart-pick">
            <b>{longDate(sel.date)}</b>
            <span>{sel.value === null ? 'nichts erfasst' : fmt(def, sel.value, rate)}</span>
            {sel.value !== null && avg !== null && <span>{compare(def, sel.value, avg, rate)}</span>}
          </span>
        ) : (
          <>
            <span>{shortDate(points[0].date)}</span>
            <span>{shortDate(points[points.length - 1].date)}</span>
          </>
        )}
      </div>
    </div>
  )
}

/** Wie der Tag zum eigenen Schnitt steht. Ohne Wertung, nur die Richtung. */
function compare(def: CheckDef, value: number, avg: number, rate: boolean): string {
  const d = value - avg
  const step = rate ? 0.005 : 0.05
  if (Math.abs(d) < step) return 'im Schnitt'
  return `${fmt(def, Math.abs(d), rate)} ${d > 0 ? 'über' : 'unter'} Schnitt`
}

function Weekdays({ def, week, rate }: { def: CheckDef; week: ReturnType<typeof byWeekday>; rate: boolean }) {
  const top = Math.max(...week.map((w) => w.avg ?? 0), rate ? 1 : 0) || 1
  return (
    <div className="chart">
      {/* Balken und Beschriftung liegen in getrennten Zeilen — sonst schieben
          die Labels die Balken aus dem Diagramm. */}
      <div className="chart-plot chart-plot--wide">
        {week.map((w) => (
          <div
            key={w.label}
            className={'chart-bar' + (w.avg === null ? ' chart-bar--empty' : '')}
            style={{ height: w.avg === null ? '2px' : `max(3px, ${(w.avg / top) * 100}%)` }}
            title={w.avg === null ? `${w.label} — nichts erfasst` : `${w.label} — ${fmt(def, w.avg, rate)} (${w.n} ${w.n === 1 ? 'Tag' : 'Tage'})`}
          />
        ))}
      </div>
      <div className="chart-legend">
        {week.map((w) => (
          <span key={w.label}>
            <b>{w.label}</b>
            {fmt(def, w.avg, rate)}
          </span>
        ))}
      </div>
    </div>
  )
}
