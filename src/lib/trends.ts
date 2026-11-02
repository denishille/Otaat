import type { AppState, CheckDef } from './types'
import { addDays, checkerToday } from './dates'
import { activeChecks, countedValues, endKey, timeKey } from './scoring'
import { clockMinutes, dayMinutes, numeric } from './insights'
import { HIDDEN_MEASURES } from '../data/measured'
import { dauer } from './stats'

/* Was im Dashboard als Linie gezeichnet werden kann.
   -----------------------------------------------------------------------
   Dieselbe Umrechnung wie in der Zusammenhangs-Suche (`numeric`) und
   dieselbe Quelle wie im Checker (`countedValues`) — sonst zeigt der Graph
   eine andere Zahl als die Kachel daneben, und eine davon ist falsch. */

export interface Param {
  /** Schluessel im Tag, oder `<id>@time` / `<id>@end` fuer die Uhrzeiten. */
  id: string
  name: string
  unit?: string
  /** Niedriger ist besser. */
  inverse: boolean
  /** Ab wo es gut ist, wenn es dafuer eine Zahl gibt. */
  target?: number
  /** Woher die Zahl kommt — fuer die Gruppierung im Waehler. */
  gruppe: 'eigen' | 'ring' | 'essen'
  /** Wie der Wert gelesen wird: als Zahl, Dauer, Uhrzeit oder Anteil. */
  art: 'zahl' | 'dauer' | 'uhrzeit' | 'anteil'
  def?: CheckDef
}

const HIDDEN_NAMEN = new Map(HIDDEN_MEASURES.map((f) => [f.key, f]))

/** Ring oder Essen — fuer die Ueberschriften im Waehler. */
function gruppeVon(id: string, def?: CheckDef): Param['gruppe'] {
  if (id.startsWith('oura_') || def?.source === 'oura') return 'ring'
  if (id.startsWith('brudi_') || def?.source === 'brudi') return 'essen'
  return 'eigen'
}

/**
 * Alles, was sich zeichnen laesst.
 *
 * Die eigenen Rubriken, die Uhrzeiten neben einem Wert als eigene Groessen,
 * und die gemessenen Werte ohne Karte — HRV, Ruhepuls, Magnesium. Gerade die
 * will man hier sehen koennen: sie stehen auf keiner Kachel, liegen aber im
 * Tag und sind oft das Interessanteste am Bestand.
 *
 * Draussen bleibt, wozu es keine Zahl gibt (Notizen, Einfachauswahl) und
 * wozu im Fenster nichts steht — ein Waehler voller leerer Zeilen ist keine
 * Auswahl.
 */
export function availableParams(s: AppState, fenster = 180): Param[] {
  const out: Param[] = []

  for (const def of activeChecks(s)) {
    if (def.kind === 'text' || def.kind === 'choice') continue
    out.push({
      id: def.id,
      name: def.name,
      unit: def.unit,
      inverse: !!def.inverse,
      target: def.target,
      gruppe: gruppeVon(def.id, def),
      art: def.asDuration ? 'dauer' : def.kind === 'bool' || def.kind === 'multi' ? 'anteil' : 'zahl',
      def,
    })
    // Die Uhrzeiten liegen neben dem Wert und sind eigene Groessen: wann man
    // ins Bett geht, ist eine andere Frage als wie lange man schlaeft.
    if (def.withTime) {
      out.push({ id: timeKey(def.id), name: `${def.name}: ab`, inverse: false, gruppe: gruppeVon(def.id, def), art: 'uhrzeit', def })
      out.push({ id: endKey(def.id), name: `${def.name}: bis`, inverse: false, gruppe: gruppeVon(def.id, def), art: 'uhrzeit', def })
    }
  }

  for (const f of HIDDEN_MEASURES) {
    out.push({
      id: f.key, name: f.name, unit: f.unit, inverse: false,
      gruppe: gruppeVon(f.key), art: 'zahl',
    })
  }

  // Nur was im Fenster ueberhaupt Zahlen hat.
  const bis = checkerToday()
  return out.filter((p) => {
    let n = 0
    for (let i = 0; i < fenster && n < 2; i++) {
      if (wertAn(s, p, addDays(bis, -i)) !== null) n++
    }
    return n >= 2
  })
}

/** Der Wert eines Parameters an einem Tag, oder null. */
function wertAn(s: AppState, p: Param, datum: string): number | null {
  const werte = countedValues(s, datum)
  if (p.art === 'uhrzeit') {
    // Die Bettzeit geht ueber Mitternacht, das Aufstehen nicht — zwei
    // verschiedene Umrechnungen, sonst laege 01:30 vor 23:15.
    const roh = werte[p.id]
    return p.id.endsWith('@time') ? clockMinutes(roh) : dayMinutes(roh)
  }
  if (p.def && !HIDDEN_NAMEN.has(p.id)) return numeric(p.def, werte[p.id])
  const v = werte[p.id]
  return typeof v === 'number' ? v : null
}

export interface Reihe {
  param: Param
  /** Ein Eintrag je Tag im Fenster, aelteste zuerst. */
  werte: (number | null)[]
  min: number
  max: number
  /** Wie viele Tage ueberhaupt eine Zahl haben. */
  n: number
}

/** Die Tage des Fensters, aelteste zuerst. */
export function fensterTage(tage: number, bis = checkerToday()): string[] {
  const out: string[] = []
  for (let i = tage - 1; i >= 0; i--) out.push(addDays(bis, -i))
  return out
}

export function reihe(s: AppState, p: Param, tage: string[]): Reihe {
  const werte = tage.map((d) => wertAn(s, p, d))
  const da = werte.filter((v): v is number => v !== null)
  return {
    param: p,
    werte,
    min: da.length ? Math.min(...da) : 0,
    max: da.length ? Math.max(...da) : 1,
    n: da.length,
  }
}

/**
 * Wie gut ein Wert ist, von 0 (schlecht) bis 1 (gut).
 *
 * **Der Zielwert ist der Massstab, wo es einen gibt.** Beim Schlaf steht das
 * Ziel auf acht Stunden: acht und mehr sind gruen, und wie rot vier Stunden
 * sind, haengt daran, wie weit der schlechteste Tag im Fenster darunter lag.
 * Das ist die Frage, die hinter der Einfaerbung steht — nicht "besser als
 * sonst", sondern "gut oder schlecht".
 *
 * Ohne Ziel bleibt nur der eigene Bestand: der Rang im Fenster. Dasselbe,
 * wenn das Ziel ausserhalb der Spanne liegt (ein Ziel von 10 bei einer
 * Zehnerskala faerbt sonst jeden Tag gruen).
 *
 * `inverse` dreht beides um — weniger Alkohol ist besser.
 */
export function guete(r: Reihe, v: number): number {
  const { target, inverse } = r.param
  if (target !== undefined) {
    const spanne = inverse ? r.max - target : target - r.min
    if (spanne > 0) {
      const g = inverse ? (target + spanne - v) / spanne : (v - (target - spanne)) / spanne
      return Math.max(0, Math.min(1, g))
    }
  }
  // Rang im Fenster. Bindungen zaehlen halb, sonst kaeme ein Tag, der acht
  // weitere wie ihn hat, je nach Reihenfolge auf 0 oder auf 1.
  const da = r.werte.filter((x): x is number => x !== null)
  if (da.length < 2) return 0.5
  let kleiner = 0
  let gleich = 0
  for (const x of da) {
    if (x < v) kleiner++
    else if (x === v) gleich++
  }
  const rang = (kleiner + gleich / 2) / da.length
  return inverse ? 1 - rang : rang
}

/** "7 h 43 min", "23:15", "1.720 kcal", "60 %" */
export function zeigeWert(p: Param, v: number | null): string {
  if (v === null) return '–'
  switch (p.art) {
    case 'dauer':
      return dauer(v)
    case 'uhrzeit': {
      // Die Bettzeit liegt ab Mittag gezaehlt vor; zurueck auf die Uhr.
      const min = p.id.endsWith('@time') ? (v + 720) % 1440 : v
      return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`
    }
    case 'anteil':
      return v >= 0.5 ? 'ja' : 'nein'
    default: {
      const z = Math.abs(v) >= 100 ? Math.round(v).toLocaleString('de-DE') : String(Math.round(v * 10) / 10)
      return p.unit ? `${z} ${p.unit}` : z
    }
  }
}

/**
 * Kurz fuer die Achse: "7:43" statt "7 h 43 min".
 *
 * Links neben dem Graphen ist auf einem Handy kein Platz fuer Fliesstext —
 * mit der langen Schreibweise stand dort "h 30 min", weil der Anfang
 * abgeschnitten war. Im Verlauf und in der Legende bleibt es ausgeschrieben,
 * dort ist Platz und dort liest man es als Satz.
 */
export function achsenWert(p: Param, v: number): string {
  switch (p.art) {
    case 'dauer': {
      const min = Math.round(v * 60)
      return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
    }
    case 'uhrzeit':
      return zeigeWert(p, v)
    case 'anteil':
      return v >= 0.5 ? 'ja' : 'nein'
    default: {
      if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`
      if (Math.abs(v) >= 100) return Math.round(v).toLocaleString('de-DE')
      return String(Math.round(v * 10) / 10)
    }
  }
}

/**
 * Achsenmarken auf runden Zahlen.
 *
 * Gleichmaessig ueber die Spanne geteilt kamen Marken wie "8 h 8 min"
 * heraus — richtig gerechnet und trotzdem unlesbar. Gesucht wird deshalb
 * eine Schrittweite aus 1, 2, 2,5 oder 5 mal einer Zehnerpotenz, und die
 * Spanne wird darauf aufgerundet. Dann steht da 6:00, 7:00, 8:00.
 */
export function niceTicks(min: number, max: number, wunsch = 4): { ticks: number[]; lo: number; hi: number } {
  if (!(max > min)) return { ticks: [min], lo: min - 0.5, hi: min + 0.5 }
  const roh = (max - min) / Math.max(1, wunsch - 1)
  const pot = Math.pow(10, Math.floor(Math.log10(roh)))
  const schritt = [1, 2, 2.5, 5, 10].map((f) => f * pot).find((s) => s >= roh) ?? 10 * pot
  const lo = Math.floor(min / schritt) * schritt
  const hi = Math.ceil(max / schritt) * schritt
  const ticks: number[] = []
  // Rundungsreste aufraeumen, sonst steht da 6.999999999999999.
  for (let v = lo; v <= hi + schritt / 1000; v += schritt) {
    ticks.push(Math.round(v / schritt) * schritt)
  }
  return { ticks, lo, hi }
}
