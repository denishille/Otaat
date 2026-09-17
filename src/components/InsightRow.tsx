import { spanLabel, strengthLabel, whenLabel, type Insight } from '../lib/insights'

/** Eindeutig fuer React, ohne den ganzen Datensatz zu serialisieren. */
export const insightKey = (i: Insight) =>
  `${i.a.id}|${i.b.id}|${i.shift.kind}|${'days' in i.shift ? i.shift.days : 0}`

/**
 * Eine Zeile Zusammenhang. Steht im Checker unter der Kopfzeile und im
 * Detail einer Rubrik — deshalb hier und nicht zweimal.
 */
export function InsightRow({ i }: { i: Insight }) {
  const dir = i.r > 0 ? 'hoch' : 'niedrig'
  return (
    <div className={'insight' + (i.solid ? '' : ' insight--weak')}>
      <div className="insight-text">
        {i.shift.kind === 'load' ? (
          <>
            Nach <b>{spanLabel(i.shift.days)}</b> mit viel <b>{i.a.name}</b> war <b>{i.b.name}</b>{' '}
            meist <b>{dir}</b>.
          </>
        ) : (
          <>
            War <b>{i.a.name}</b> hoch, war <b>{i.b.name}</b> {whenLabel(i.shift)} meist <b>{dir}</b>.
          </>
        )}
      </div>
      <div className="insight-meta">
        <span>{strengthLabel(i.r)}</span>
        <div className={'insight-bar ' + (i.r > 0 ? 'insight-bar--up' : 'insight-bar--down')}>
          <i style={{ width: `${Math.min(100, Math.abs(i.r) * 100)}%` }} />
        </div>
        <span>{i.n} T</span>
      </div>
    </div>
  )
}
