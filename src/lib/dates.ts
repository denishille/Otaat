import type { Cadence } from './types'

export const today = (): string => toISO(new Date())

/** Um diese Stunde faengt im Checker der neue Tag an. */
export const DAY_STARTS_AT = 6

/**
 * Welchen Tag der Checker gerade meint.
 *
 * Um halb zwei nachts ist man noch beim gestrigen Tag — man traegt dann ein,
 * wann man ins Bett geht, nicht wie der neue Tag war. Um Mitternacht
 * umzuspringen hiesse, sich mitten in der Auswertung des Abends einen leeren
 * Tag vorgesetzt zu bekommen. Also wechselt er erst um sechs.
 *
 * Nur fuer den Checker und alles, was daraus rechnet — Serie, Statistik,
 * Zusammenhaenge. Der Kalender in Future Me bleibt beim Datum, das auf der
 * Uhr steht: was am 21. faellig ist, ist am 21. faellig, auch um eins nachts.
 */
export function checkerToday(now = new Date()): string {
  const d = new Date(now)
  if (d.getHours() < DAY_STARTS_AT) d.setDate(d.getDate() - 1)
  return toISO(d)
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

export function addMonths(iso: string, n: number): string {
  const d = fromISO(iso)
  const targetMonth = d.getMonth() + n
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(targetMonth)
  // Ueberlauf abfangen: 31.01. + 1 Monat = 28./29.02., nicht 03.03.
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return toISO(d)
}

/** Ganze Tage zwischen zwei ISO-Daten (b - a). */
export function daysBetween(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Naechste Faelligkeit nach `from`, gemaess Rhythmus. */
export function advance(from: string, c: Cadence): string {
  if (c.type === 'once') return from
  switch (c.unit) {
    case 'day':   return addDays(from, c.n)
    case 'week':  return addDays(from, c.n * 7)
    case 'month': return addMonths(from, c.n)
    case 'year':  return addMonths(from, c.n * 12)
  }
}

export function cadenceLabel(c: Cadence): string {
  if (c.type === 'once') return 'einmalig'
  const { n, unit } = c
  const one: Record<typeof unit, string> = { day: 'täglich', week: 'wöchentlich', month: 'monatlich', year: 'jährlich' }
  if (n === 1) return one[unit]
  const many: Record<typeof unit, string> = { day: 'Tage', week: 'Wochen', month: 'Monate', year: 'Jahre' }
  if (unit === 'month' && n === 6) return 'halbjährlich'
  if (unit === 'month' && n === 3) return 'quartalsweise'
  return `alle ${n} ${many[unit]}`
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function longDate(iso: string): string {
  const d = fromISO(iso)
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`
}

export function shortDate(iso: string): string {
  const d = fromISO(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

/** "heute", "morgen", "in 12 Tagen", "seit 4 Tagen überfällig" */
export function relativeDue(due: string, ref = today()): string {
  const d = daysBetween(ref, due)
  if (d === 0) return 'heute'
  if (d === 1) return 'morgen'
  if (d === -1) return 'seit gestern fällig'
  if (d < 0) return `${-d} Tage überfällig`
  if (d < 14) return `in ${d} Tagen`
  if (d < 60) return `in ${Math.round(d / 7)} Wochen`
  if (d < 365) return `in ${Math.round(d / 30)} Monaten`
  const years = d / 365
  return years < 1.5 ? 'in einem Jahr' : `in ${Math.round(years)} Jahren`
}
