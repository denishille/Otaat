import type { AppState, CheckDef, CheckValue } from './types'
import { addDays, today } from './dates'
import { activeChecks, scoreDay } from './scoring'

/* Zusammenhaenge zwischen den Checks.
   Laeuft automatisch, sobald genug Tage erfasst sind, und sucht Paare, die
   sich auffaellig gleich- oder gegenlaeufig verhalten — am selben Tag und
   mit einem Tag Versatz ("Alkohol heute, Schlaf morgen").

   Das ist Korrelation, keine Kausalitaet, und bei einem Dutzend Checks werden
   viele Paare gleichzeitig geprueft. Die Schwellen unten sind deshalb bewusst
   streng, und es werden nur die staerksten Treffer gezeigt. */

/** Ab so vielen erfassten Tagen laeuft die Analyse. */
export const MIN_DAYS = 21
/** So viele Tage muessen fuer ein Paar gemeinsam Werte haben. */
const MIN_PAIRS = 14
/** Mindeststaerke des Zusammenhangs. */
const MIN_R = 0.4
/** t-Schwelle, grob p < 0.01 zweiseitig — haelt Zufallstreffer draussen. */
const MIN_T = 2.8
/** So viele Tage schaut die Analyse zurueck. */
const WINDOW = 120

export interface Insight {
  a: CheckDef
  b: CheckDef
  r: number
  n: number
  /** true = b wird am Folgetag betrachtet */
  lagged: boolean
}

/** Uebersetzt einen Check-Wert in eine Zahl, mit der sich rechnen laesst. */
export function numeric(def: CheckDef, v: CheckValue | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  switch (def.kind) {
    case 'bool':
      return v === true ? 1 : 0
    case 'scale':
    case 'number':
    case 'external':
      return typeof v === 'number' ? v : null
    case 'multi': {
      // "hat ueberhaupt was gemacht" — verstaendlicher als die Anzahl der Haken
      if (!Array.isArray(v)) return null
      const real = v.filter((o) => o !== def.noneOption)
      return real.length > 0 ? 1 : 0
    }
    case 'choice':
    case 'text':
      return null
  }
}

/** Nur Checks, mit denen sich rechnen laesst. */
const measurable = (s: AppState) =>
  activeChecks(s).filter((c) => c.kind !== 'text' && c.kind !== 'choice')

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  // Ein Check ohne jede Schwankung hat keine Korrelation, sondern gar keine Varianz.
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

/** Anzahl der Tage, die ueberhaupt erfasst sind — Basis fuer MIN_DAYS. */
export function loggedDays(s: AppState, window = WINDOW): number {
  let n = 0
  for (let i = 0; i < window; i++) if (scoreDay(s, addDays(today(), -i)).logged) n++
  return n
}

export function findInsights(s: AppState, window = WINDOW): Insight[] {
  const defs = measurable(s)
  const dates: string[] = []
  for (let i = window - 1; i >= 0; i--) dates.push(addDays(today(), -i))

  // Werte einmal vorrechnen statt in jeder Paarung neu
  const series = new Map<string, (number | null)[]>()
  for (const d of defs) series.set(d.id, dates.map((date) => numeric(d, s.days[date]?.values[d.id])))

  const out: Insight[] = []

  const test = (a: CheckDef, b: CheckDef, lagged: boolean) => {
    const xa = series.get(a.id)!
    const yb = series.get(b.id)!
    const xs: number[] = []
    const ys: number[] = []
    for (let i = 0; i < dates.length - (lagged ? 1 : 0); i++) {
      const x = xa[i]
      const y = yb[lagged ? i + 1 : i]
      if (x === null || y === null) continue
      xs.push(x)
      ys.push(y)
    }
    if (xs.length < MIN_PAIRS) return
    const r = pearson(xs, ys)
    if (r === null || Math.abs(r) < MIN_R) return
    const t = Math.abs(r) * Math.sqrt((xs.length - 2) / (1 - r * r))
    if (!Number.isFinite(t) || t < MIN_T) return
    out.push({ a, b, r, n: xs.length, lagged })
  }

  for (let i = 0; i < defs.length; i++) {
    for (let j = i + 1; j < defs.length; j++) test(defs[i], defs[j], false)
  }
  // Versetzt ist die Richtung nicht symmetrisch, also beide Wege pruefen
  for (const a of defs) {
    for (const b of defs) if (a.id !== b.id) test(a, b, true)
  }

  return out.sort((p, q) => Math.abs(q.r) - Math.abs(p.r))
}

export function strengthLabel(r: number): string {
  const a = Math.abs(r)
  if (a >= 0.7) return 'sehr deutlich'
  if (a >= 0.55) return 'deutlich'
  return 'erkennbar'
}
