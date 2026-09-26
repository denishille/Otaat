import type { AppState, CheckDef, CheckValue, DayEntry } from './types'
import { addDays, checkerToday } from './dates'
import { HIDDEN_KEYS } from '../data/measured'
import { CATALOG_CHECKS } from '../data/checks'

/** Wo die Uhrzeit eines Checks im Tag liegt. Neben dem Wert, nicht darin. */
export const timeKey = (id: string): string => `${id}@time`
/** Das Gegenstueck: wann es vorbei war. Beim Schlaf das Aufstehen. */
export const endKey = (id: string): string => `${id}@end`

export const isFilled = (v: CheckValue | undefined): boolean => {
  if (v === undefined || v === null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  return true
}

/** Wurde der eigene Anspruch an diesem Tag getroffen? */
export function meetsTarget(def: CheckDef, v: CheckValue | undefined): boolean {
  if (!isFilled(v)) return false
  switch (def.kind) {
    case 'bool':
      return v === true
    case 'scale':
    case 'number':
    case 'external': {
      if (typeof v !== 'number') return false
      if (def.target === undefined) return true
      return def.inverse ? v <= def.target : v >= def.target
    }
    case 'multi': {
      // Nur "Nix" angehakt heisst: nichts gemacht.
      if (!Array.isArray(v)) return false
      return v.some((o) => o !== def.noneOption)
    }
    case 'choice':
    case 'text':
      return true
  }
}

/** Wie weit zurueck nach einem Wert gesucht wird, den man uebernehmen kann. */
const CARRY_WINDOW = 30

/**
 * Vorschlaege fuer einen Tag: was zuletzt eingetragen wurde, gilt als Default.
 * Gesucht wird der juengste Tag davor, der fuer den Check einen Wert hat —
 * eine Luecke von ein paar Tagen bricht die Uebernahme also nicht.
 * Ohne Vortag greift `fallback` aus der Check-Definition.
 */
export function carriedDefaults(s: AppState, date: string): Record<string, CheckValue> {
  const out: Record<string, CheckValue> = {}
  for (const def of activeChecks(s)) {
    // Gelesene Rubriken holen ihre Werte selbst — ein Vortagswert waere hier
    // eine Erfindung.
    if (def.kind === 'external') continue
    // Was gemessen wird, faengt leer an — siehe `noCarry`.
    if (def.noCarry) continue
    // Eine Notiz gehoert zu genau einem Tag. Uebernommen stuende dort heute
    // wieder "Lange Autofahrt", und man muesste jeden Morgen erst loeschen,
    // was gestern war. Notizen fangen leer an.
    if (def.kind === 'text') continue
    let found: CheckValue | undefined
    for (let i = 1; i <= CARRY_WINDOW; i++) {
      // Nur aus bestaetigten Tagen uebernehmen — sonst wird ein Vorschlag
      // aus einem Vorschlag abgeleitet.
      const v = countedValues(s, addDays(date, -i))[def.id]
      if (isFilled(v)) { found = v; break }
    }
    let value = found ?? def.fallback
    // Eine Option, die es nicht mehr gibt, darf nicht ueber den Vortag
    // zurueckkommen — sonst laesst sie sich nie entfernen.
    if (def.kind === 'multi' && Array.isArray(value)) {
      const offered = new Set(def.options ?? [])
      const kept = value.filter((o) => offered.has(o))
      value = kept.length ? kept : null
    }
    if (isFilled(value)) out[def.id] = value as CheckValue

    // Die Uhrzeiten wandern wie jeder andere Wert mit.
    if (!def.withTime) continue
    for (const key of [timeKey(def.id), endKey(def.id)]) {
      for (let i = 1; i <= CARRY_WINDOW; i++) {
        const v = countedValues(s, addDays(date, -i))[key]
        if (isFilled(v)) { out[key] = v; break }
      }
    }
  }
  return out
}

/**
 * Die Werte eines Tages, soweit sie zaehlen.
 *
 * Ein Tag zaehlt, sobald er bestaetigt ist. Gemessene Rubriken — die Kalorien
 * aus dem Kalorienbrudi-Bestand — zaehlen immer: die sind keine Annahme,
 * sondern kommen aus einer anderen Erfassung.
 */
export function countedValues(s: AppState, date: string): Record<string, CheckValue> {
  const day = s.days[date]
  if (!day) return {}
  if (day.confirmed) return day.values
  const out: Record<string, CheckValue> = {}
  for (const def of s.checks) {
    if (def.kind === 'external' && isFilled(day.values[def.id])) out[def.id] = day.values[def.id]
  }
  // Die Mikronaehrwerte und die Ringwerte haben keine Rubrik, sind aber aus
  // demselben Holz: gemessen, nicht geschaetzt. Ohne sie hier saehe die
  // Zusammenhangs-Suche an unbestaetigten Tagen die Kalorien, aber nicht das
  // Magnesium daneben, und den Schlaf-Score, aber nicht die HRV.
  for (const key of HIDDEN_KEYS) {
    if (isFilled(day.values[key])) out[key] = day.values[key]
  }
  return out
}

/**
 * Tage, die abgeschickt wurden. Nur die zaehlen. Ein Tag, an dem bloss
 * gemessene Werte liegen — die Kalorien-Historie aus dem Abgleich —, ist
 * keiner: die stammen aus einer anderen Erfassung, nicht von hier.
 */
export const confirmedDays = (s: AppState): number =>
  Object.values(s.days).filter((d) => d.confirmed).length

/**
 * Die Rubriken einer verbundenen Quelle nachtragen.
 *
 * Wer den Ring verbindet oder sein Essens-Konto waehlt, will dessen Werte
 * sehen — sie danach noch einzeln im Regal zu suchen, ist ein Schritt zu
 * viel, und ohne ihn steht die Verbindung da und tut scheinbar nichts.
 *
 * Was man rausgeworfen hat, bleibt draussen: `meta.droppedChecks` haelt das
 * fest. Sonst waere das hier dieselbe Falle wie damals bei den
 * Sport-Optionen, die nach jedem Loeschen wiederkamen.
 *
 * Gibt zurueck, was dazugekommen ist — fuer die Meldung.
 */
export function ensureSourceChecks(d: AppState, source: 'brudi' | 'oura'): string[] {
  const da = new Set(d.checks.map((c) => c.id))
  const raus = new Set(d.meta.droppedChecks ?? [])
  const fehlt = CATALOG_CHECKS.filter(
    (t) => t.def.source === source && !da.has(t.def.id) && !raus.has(t.def.id),
  )
  if (!fehlt.length) return []
  let sort = Math.max(0, ...d.checks.map((c) => c.sort))
  for (const t of fehlt) {
    sort += 10
    d.checks.push({ ...t.def, sort })
  }
  return fehlt.map((t) => t.def.name)
}

/** Merkt sich, dass eine Rubrik absichtlich weg ist. */
export function dropCheck(d: AppState, id: string) {
  d.checks = d.checks.filter((c) => c.id !== id)
  d.meta.droppedChecks = [...new Set([...(d.meta.droppedChecks ?? []), id])]
}

export const activeChecks = (s: AppState): CheckDef[] =>
  s.checks.filter((c) => !c.archived).sort((a, b) => a.sort - b.sort)

export interface DayScore {
  filled: number
  total: number
  met: number
  ratio: number
  /** ab hier zaehlt der Tag als erfasst und haelt die Serie am Leben */
  logged: boolean
}

export function scoreDay(s: AppState, date: string): DayScore {
  const defs = activeChecks(s)
  // Die Kopfzeile zeigt, was im Formular steht — auch unbestaetigt. Nur
  // `logged` haengt an der Bestaetigung, und daran haengen Serie und Analyse.
  const entry: DayEntry | undefined = s.days[date]
  let filled = 0
  let met = 0
  for (const d of defs) {
    const v = entry?.values[d.id]
    if (isFilled(v)) {
      filled++
      if (meetsTarget(d, v)) met++
    }
  }
  const total = defs.length
  const ratio = total ? filled / total : 0
  return { filled, total, met, ratio, logged: entry?.confirmed === true }
}

/** Serie erfasster Tage, rueckwaerts. Der heutige Tag bricht sie nicht, solange er laeuft. */
export function streak(s: AppState, from = checkerToday()): number {
  let n = 0
  let cursor = from
  if (!scoreDay(s, cursor).logged) cursor = addDays(cursor, -1)
  while (scoreDay(s, cursor).logged) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/** Serie fuer einen einzelnen Check — nur Tage, an denen das Ziel getroffen wurde. */
export function checkStreak(s: AppState, def: CheckDef, from = checkerToday()): number {
  let n = 0
  let cursor = from
  if (!meetsTarget(def, countedValues(s, cursor)[def.id])) cursor = addDays(cursor, -1)
  while (meetsTarget(def, countedValues(s, cursor)[def.id])) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/** Erfuellungsquote der letzten `n` Tage, aeltester Tag zuerst — fuer den Balkenstreifen. */
export function recentRatios(s: AppState, n: number, from = checkerToday()): number[] {
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) out.push(scoreDay(s, addDays(from, -i)).ratio)
  return out
}

/** Wie stark ein Board-Ziel in den letzten 30 Tagen bedient wurde. */
export function goalMomentum(s: AppState, goalId: string, days = 30): { hits: number; possible: number } {
  const defs = activeChecks(s).filter((c) => c.goals?.includes(goalId))
  let hits = 0
  for (let i = 0; i < days; i++) {
    const values = countedValues(s, addDays(checkerToday(), -i))
    for (const d of defs) if (meetsTarget(d, values[d.id])) hits++
  }
  return { hits, possible: defs.length * days }
}
