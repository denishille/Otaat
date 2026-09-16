import { useMemo, useState } from 'react'
import type { AppState, CheckDef } from '../lib/types'
import { byWeekday, fmt, series, summarize, type Point } from '../lib/stats'
import { checkStreak } from '../lib/scoring'
import { findInsights, loggedDays, MIN_DAYS, strengthLabel } from '../lib/insights'
import { shortDate } from '../lib/dates'
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
  const run = checkStreak(state, def)

  const related = useMemo(() => {
    if (loggedDays(state) < MIN_DAYS) return []
    return findInsights(state).filter((i) => i.a.id === def.id || i.b.id === def.id).slice(0, 4)
  }, [state, def])

  const goals = (def.goals ?? [])
    .map((g) => state.nodes.find((n) => n.id === g))
    .filter(Boolean)

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
      <div className="stat-row">
        <Tile k="Schnitt" v={fmt(def, sum.avg, sum.isRate)} />
        <Tile k="Ziel getroffen" v={`${sum.metDays}`} sub={`von ${days} Tagen`} />
        <Tile k="Serie" v={String(run)} sub={run === 1 ? 'Tag' : 'Tage'} />
        <Tile k="Längste Serie" v={String(sum.bestRun)} sub={sum.bestRun === 1 ? 'Tag' : 'Tage'} />
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
          : <Trend def={def} points={points} rate={sum.isRate} />}
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

      <section>
        <div className="chart-head"><h4>Zahlt ein auf</h4></div>
        {goals.length === 0 ? (
          <p className="chart-note" style={{ margin: 0 }}>
            Noch auf kein Ziel. Auf <b>Mind my Business</b> einen Eintrag auswählen und
            in der Leiste unten <b>Als Ziel</b> antippen — danach lässt er sich hier
            über <b>Bearbeiten</b> mit diesem Check verbinden.
          </p>
        ) : (
          <div className="choice">
            {goals.map((g) => (
              <span className="chip" key={g!.id}>
                <i className="contrib-dot" style={{ background: `var(--n-${g!.color})` }} />
                {g!.text || 'Unbenanntes Ziel'}
              </span>
            ))}
          </div>
        )}
      </section>
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
function Trend({ def, points, rate }: { def: CheckDef; points: Point[]; rate: boolean }) {
  const vals = points.map((p) => p.value).filter((v): v is number => v !== null)
  const top = Math.max(...vals, def.target ?? 0, rate ? 1 : 0) || 1

  return (
    <div className="chart">
      <div className="chart-plot">
        {def.target !== undefined && !rate && (
          <div
            className="chart-target"
            style={{ bottom: `${(def.target / top) * 100}%` }}
            aria-hidden="true"
          >
            <span>{def.inverse ? 'höchstens' : 'mindestens'} {def.target}</span>
          </div>
        )}
        {points.map((p) => (
          <div
            key={p.date}
            className={'chart-bar' + (p.value === null ? ' chart-bar--empty' : '')}
            style={{ height: p.value === null ? '2px' : `max(3px, ${(p.value / top) * 100}%)` }}
            title={`${shortDate(p.date)} — ${p.value === null ? 'nichts erfasst' : fmt(def, p.value, rate)}`}
          />
        ))}
      </div>
      <div className="chart-axis">
        <span>{shortDate(points[0].date)}</span>
        <span>{shortDate(points[points.length - 1].date)}</span>
      </div>
    </div>
  )
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
