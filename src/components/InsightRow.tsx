import { isFlag, spanLabel, strengthLabel, whenLabel, type Feature, type Insight } from '../lib/insights'

/** Eindeutig fuer React, ohne den ganzen Datensatz zu serialisieren. */
export const insightKey = (i: Insight) =>
  `${i.a.id}|${i.b.id}|${i.shift.kind}|${'days' in i.shift ? i.shift.days : 0}`

/**
 * Eine Zeile Zusammenhang. Steht im Checker unter der Kopfzeile und im
 * Detail einer Rubrik — deshalb hier und nicht zweimal.
 *
 * Ja/Nein-Rubriken brauchen eigene Worte. "War Kreatin hoch" ergibt keinen
 * Satz: an einem Haken gibt es keine Hoehe, nur ob er dran war. Dasselbe auf
 * der anderen Seite — "war Sauna meist hoch" statt "gab es Sauna meist auch".
 */
export function InsightRow({ i }: { i: Insight }) {
  return (
    <div className={'insight' + (i.solid ? '' : ' insight--weak')}>
      <div className="insight-text">
        {ursache(i.a, i.shift)} {wirkung(i.b, i.shift, i.r)}.
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

/** "An Tagen mit Sauna", "War Schlaf hoch,", "Nach einer Woche mit viel Sport" */
function ursache(a: Feature, shift: Insight['shift']) {
  const name = <b>{a.name}</b>
  if (shift.kind === 'load') {
    return <>Nach <b>{spanLabel(shift.days)}</b> mit {isFlag(a) ? 'oft' : 'viel'} {name}</>
  }
  return isFlag(a) ? <>An Tagen mit {name}</> : <>War {name} hoch,</>
}

/** "war Fokus am nächsten Tag meist hoch", "gab es Sauna am selben Tag meist nicht" */
function wirkung(b: Feature, shift: Insight['shift'], r: number) {
  const name = <b>{b.name}</b>
  const wann = shift.kind === 'load' ? '' : ` ${whenLabel(shift)}`
  if (isFlag(b)) {
    return <>gab es {name}{wann} meist <b>{r > 0 ? 'auch' : 'nicht'}</b></>
  }
  return <>war {name}{wann} meist <b>{r > 0 ? 'hoch' : 'niedrig'}</b></>
}
