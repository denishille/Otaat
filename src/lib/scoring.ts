import type { AppState, CheckDef, CheckValue, DayEntry } from './types'
import { addDays, today } from './dates'

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
    case 'number': {
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
    let found: CheckValue | undefined
    for (let i = 1; i <= CARRY_WINDOW; i++) {
      const v = s.days[addDays(date, -i)]?.values[def.id]
      if (isFilled(v)) { found = v; break }
    }
    const value = found ?? def.fallback
    if (isFilled(value)) out[def.id] = value as CheckValue
  }
  return out
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
  return { filled, total, met, ratio, logged: total > 0 && ratio >= 0.6 }
}

/** Serie erfasster Tage, rueckwaerts. Der heutige Tag bricht sie nicht, solange er laeuft. */
export function streak(s: AppState, from = today()): number {
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
export function checkStreak(s: AppState, def: CheckDef, from = today()): number {
  let n = 0
  let cursor = from
  if (!meetsTarget(def, s.days[cursor]?.values[def.id])) cursor = addDays(cursor, -1)
  while (meetsTarget(def, s.days[cursor]?.values[def.id])) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

/** Erfuellungsquote der letzten `n` Tage, aeltester Tag zuerst — fuer den Balkenstreifen. */
export function recentRatios(s: AppState, n: number, from = today()): number[] {
  const out: number[] = []
  for (let i = n - 1; i >= 0; i--) out.push(scoreDay(s, addDays(from, -i)).ratio)
  return out
}

/** Wie stark ein Board-Ziel in den letzten 30 Tagen bedient wurde. */
export function goalMomentum(s: AppState, goalId: string, days = 30): { hits: number; possible: number } {
  const defs = activeChecks(s).filter((c) => c.goals?.includes(goalId))
  let hits = 0
  for (let i = 0; i < days; i++) {
    const date = addDays(today(), -i)
    for (const d of defs) if (meetsTarget(d, s.days[date]?.values[d.id])) hits++
  }
  return { hits, possible: defs.length * days }
}
