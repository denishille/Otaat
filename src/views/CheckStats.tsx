import { useMemo, useRef, useState } from 'react'
import type { AppState, CheckDef } from '../lib/types'
import { byWeekday, fmt, series, summarize, type Point } from '../lib/stats'
import { findInsights, loggedDays, MIN_DAYS } from '../lib/insights'
import { InsightRow, insightKey } from '../components/InsightRow'
import { addDays, checkerToday, longDate, shortDate } from '../lib/dates'
import { Sheet } from '../components/Sheet'
import { countedValues } from '../lib/scoring'
import { update } from '../lib/store'
import { toast } from '../components/Toasts'
import { BRUDI_MACROS } from '../data/brudi-source'

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
    return findInsights(state)
      .filter((i) => i.a.check.id === def.id || i.b.check.id === def.id)
      .slice(0, 5)
  }, [state, def])

  /**
   * Die Makros zur Essens-Kachel. Keine eigene Rubrik mehr, aber im Detail
   * gehoeren sie her — eine Kalorienzahl ohne die Aufteilung sagt wenig.
   *
   * Neben dem Schnitt in Gramm steht, wie viel der Energie daraus kam:
   * Eiweiss und Kohlenhydrate mit 4 kcal je Gramm, Fett mit 9. Gerechnet
   * wird ueber dieselben Tage wie der Verlauf daneben, und nur ueber Tage,
   * an denen ueberhaupt Kalorien stehen.
   */
  const makros = useMemo(() => {
    if (def.id !== 'brudi_kcal') return []
    const ATOME: Record<string, number> = { brudi_protein: 4, brudi_carbs: 4, brudi_fat: 9 }
    const summe: Record<string, { g: number; n: number }> = {}
    let kcal = 0
    for (let i = days - 1; i >= 0; i--) {
      const v = countedValues(state, addDays(checkerToday(), -i))
      if (typeof v['brudi_kcal'] !== 'number') continue
      kcal += v['brudi_kcal']
      for (const m of BRUDI_MACROS) {
        const g = v[m.key]
        if (typeof g !== 'number') continue
        const a = (summe[m.key] ??= { g: 0, n: 0 })
        a.g += g
        a.n++
      }
    }
    return BRUDI_MACROS.flatMap((m) => {
      const a = summe[m.key]
      if (!a?.n) return []
      const anteil = kcal > 0 ? Math.round((a.g * ATOME[m.key] * 100) / kcal) : null
      return [{ name: m.name, schnitt: Math.round(a.g / a.n), anteil }]
    })
  }, [state, def, days])

  /**
   * Einen gemessenen Wert fuer einen Tag wegwerfen.
   *
   * Stand frueher als Papierkorb auf jeder gelesenen Kachel und war dort
   * jeden Tag im Weg, obwohl man ihn im Monat einmal braucht. Hier, am
   * gegriffenen Balken, ist er da, wo man den Ausreisser ohnehin sieht —
   * und er gilt fuer jeden Tag, nicht nur fuer heute.
   */
  function verwirf(datum: string) {
    update((d) => {
      const day = (d.days[datum] ??= { date: datum, values: {}, confirmed: false })
      delete day.values[def.id]
      day.dropped = [...new Set([...(day.dropped ?? []), def.id])]
    })
    toast(`${shortDate(datum)} verworfen`)
  }

  function zurueck(datum: string) {
    update((d) => {
      const day = d.days[datum]
      if (day) day.dropped = (day.dropped ?? []).filter((k) => k !== def.id)
    })
    toast('kommt beim nächsten Abruf wieder')
  }

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
          : <Trend def={def} points={points} rate={sum.isRate} avg={sum.avg}
              verwirf={def.kind === 'external' ? verwirf : undefined}
              zurueck={def.kind === 'external' ? zurueck : undefined}
              weggeworfen={(datum) => (state.days[datum]?.dropped ?? []).includes(def.id)} />}
      </section>

      {makros.length > 0 && (
        <section>
          <div className="chart-head"><h4>Makros im Schnitt</h4></div>
          <div className="stat-row">
            {makros.map((m) => (
              <Tile key={m.name} k={m.name} v={`${m.schnitt} g`}
                note={m.anteil === null ? undefined : `${m.anteil} % der Energie`} />
            ))}
          </div>
        </section>
      )}

      {sum.n >= 7 && (
        <section>
          <div className="chart-head"><h4>Nach Wochentag</h4></div>
          <Weekdays def={def} week={week} rate={sum.isRate} />
        </section>
      )}

      {related.length > 0 && (
        <section>
          <div className="chart-head"><h4>Hängt zusammen mit</h4></div>
          {related.map((i) => <InsightRow key={insightKey(i)} i={i} />)}
        </section>
      )}

    </Sheet>
  )
}

function Tile({ k, v, sub, note }: { k: string; v: string; sub?: string; note?: string }) {
  return (
    <div className="stat-tile">
      <div className="daysum-k">{k}</div>
      <div className="stat-tile-v">{v}{sub && <small> {sub}</small>}</div>
      {/* `sub` steht neben der Zahl und taugt nur fuer zwei Worte ("von 30").
          Alles, was einen Satz braucht, kommt darunter. */}
      {note && <div className="stat-tile-note">{note}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- */

/** Ein Balken je Tag. Fehlende Tage bleiben leer statt interpoliert zu werden. */
function Trend({ def, points, rate, avg, verwirf, zurueck, weggeworfen }: {
  def: CheckDef
  points: Point[]
  rate: boolean
  avg: number | null
  /** Nur bei gemessenen Rubriken gesetzt. */
  verwirf?: (datum: string) => void
  zurueck?: (datum: string) => void
  weggeworfen: (datum: string) => boolean
}) {
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
            <span>
              {weggeworfen(sel.date) ? 'verworfen'
                : sel.value === null ? 'nichts erfasst'
                : fmt(def, sel.value, rate)}
            </span>
            {sel.value !== null && avg !== null && !weggeworfen(sel.date) && <span>{compare(def, sel.value, avg, rate)}</span>}
            {/* Der Ring meldet auch Tage, an denen er nur nachts am Finger
                war. So ein Wert gehoert nicht in den Schnitt. */}
            {weggeworfen(sel.date)
              ? zurueck && <button className="btn btn--quiet btn--sm" onClick={() => zurueck(sel.date)}>zurückholen</button>
              : sel.value !== null && verwirf &&
                <button className="btn btn--quiet btn--sm" onClick={() => verwirf(sel.date)}>verwerfen</button>}
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
