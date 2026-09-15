import type { Reminder } from './types'
import { fromISO } from './dates'

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
const dateOnly = (iso: string) => iso.replace(/-/g, '')

/** RFC 5545: max. 75 Zeichen pro Zeile, Fortsetzung beginnt mit einem Leerzeichen. */
function fold(line: string): string {
  if (line.length <= 75) return line
  const parts = [line.slice(0, 75)]
  let rest = line.slice(75)
  while (rest.length > 74) {
    parts.push(' ' + rest.slice(0, 74))
    rest = rest.slice(74)
  }
  parts.push(' ' + rest)
  return parts.join('\r\n')
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

const RRULE: Record<string, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }

/**
 * Erzeugt einen ICS-Kalender aus den Reminders.
 * Ganztagstermine mit Alarm `lead` Tage vorher — genau das, was Apple Kalender
 * dann als Benachrichtigung ausspielt.
 */
export function buildICS(reminders: Reminder[], name = 'OTAAT — Future Me Problems'): string {
  const now = stamp(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OTAAT//Future Me Problems//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(name)}`,
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ]

  for (const r of reminders) {
    if (r.done) continue
    const end = new Date(fromISO(r.due))
    end.setDate(end.getDate() + 1)
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${r.id}@otaat`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART;VALUE=DATE:${dateOnly(r.due)}`)
    lines.push(`DTEND;VALUE=DATE:${dateOnly(`${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`)}`)
    lines.push(fold(`SUMMARY:${esc(r.title)}`))
    lines.push(fold(`DESCRIPTION:${esc([r.category, r.notes].filter(Boolean).join(' · '))}`))
    lines.push(fold(`CATEGORIES:${esc(r.category)}`))
    lines.push('TRANSP:TRANSPARENT')
    if (r.cadence.type === 'every') {
      lines.push(`RRULE:FREQ=${RRULE[r.cadence.unit]};INTERVAL=${r.cadence.n}`)
    }
    if (r.lead > 0) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(r.title)}`), `TRIGGER:-P${r.lead}D`, 'END:VALARM')
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(reminders: Reminder[]) {
  const blob = new Blob([buildICS(reminders)], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'otaat-future-me.ics'
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
