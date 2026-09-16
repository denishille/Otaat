import type { AppState, CheckDef } from './types'
import { addDays, fromISO, today } from './dates'
import { countedValues, meetsTarget } from './scoring'
import { numeric } from './insights'

/* Zahlen zu einem einzelnen Check. Alles hier arbeitet auf derselben
   Umrechnung wie die Korrelationsanalyse (`numeric`), damit die Statistik
   im Detail und die Zusammenhaenge oben nicht auseinanderlaufen. */

export interface Point {
  date: string
  /** null = an dem Tag nichts erfasst */
  value: number | null
  met: boolean
}

export function series(s: AppState, def: CheckDef, days: number, from = today()): Point[] {
  const out: Point[] = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(from, -i)
    const raw = countedValues(s, date)[def.id]
    out.push({ date, value: numeric(def, raw), met: meetsTarget(def, raw) })
  }
  return out
}

export interface Summary {
  n: number
  avg: number | null
  min: number | null
  max: number | null
  metDays: number
  bestRun: number
  /** bei Ja/Nein und Mehrfachauswahl ist der Schnitt ein Anteil */
  isRate: boolean
}

export function summarize(def: CheckDef, points: Point[]): Summary {
  const vals = points.filter((p) => p.value !== null).map((p) => p.value as number)
  const n = vals.length
  let bestRun = 0
  let run = 0
  for (const p of points) {
    run = p.met ? run + 1 : 0
    if (run > bestRun) bestRun = run
  }
  return {
    n,
    avg: n ? vals.reduce((a, b) => a + b, 0) / n : null,
    min: n ? Math.min(...vals) : null,
    max: n ? Math.max(...vals) : null,
    metDays: points.filter((p) => p.met).length,
    bestRun,
    isRate: def.kind === 'bool' || def.kind === 'multi',
  }
}

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export interface WeekdayStat { label: string; avg: number | null; n: number }

/** Schnitt je Wochentag — zeigt Muster, die im Verlauf untergehen. */
export function byWeekday(points: Point[]): WeekdayStat[] {
  const buckets: number[][] = Array.from({ length: 7 }, () => [])
  for (const p of points) {
    if (p.value === null) continue
    // getDay() zaehlt ab Sonntag, die Woche faengt hier montags an
    buckets[(fromISO(p.date).getDay() + 6) % 7].push(p.value)
  }
  return buckets.map((b, i) => ({
    label: WD[i],
    n: b.length,
    avg: b.length ? b.reduce((x, y) => x + y, 0) / b.length : null,
  }))
}

/** Zahl so formatieren, wie der Check sie meint. */
export function fmt(def: CheckDef, v: number | null, rate = false): string {
  if (v === null) return '–'
  if (rate) return `${Math.round(v * 100)} %`
  const rounded = Math.round(v * 10) / 10
  return def.unit ? `${rounded} ${def.unit}` : String(rounded)
}
