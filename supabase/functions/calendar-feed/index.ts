/**
 * OTAAT — Kalender-Feed
 *
 * Liefert die Future Me Problems eines Nutzers als ICS aus, damit Apple
 * Kalender (oder Google) den Link abonnieren und die Erinnerungen selbst
 * ausspielen kann. Kein OAuth noetig — der Kalender zieht sich den Feed.
 *
 *   GET /functions/v1/calendar-feed?t=<calendar_token>
 *
 * Deploy:  supabase functions deploy calendar-feed --no-verify-jwt
 * (--no-verify-jwt ist noetig, weil Kalender-Clients keinen Bearer-Token
 *  schicken. Die Autorisierung laeuft ueber das unguessbare Token in der URL,
 *  das in otaat_profiles.calendar_token steht.)
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

type Cadence =
  | { type: 'once'; on: string }
  | { type: 'every'; n: number; unit: 'day' | 'week' | 'month' | 'year' }

interface Reminder {
  id: string
  title: string
  category: string
  cadence: Cadence
  due: string
  lead: number
  notes?: string
  done?: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')

const stampNow = () => {
  const d = new Date()
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

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

const nextDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}`
}

const FREQ: Record<string, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' }

function buildICS(reminders: Reminder[]): string {
  const now = stampNow()
  const out: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OTAAT//Future Me Problems//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OTAAT — Future Me Problems',
    'X-PUBLISHED-TTL:PT6H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
  ]

  for (const r of reminders) {
    if (r.done) continue
    out.push('BEGIN:VEVENT')
    out.push(`UID:${r.id}@otaat`)
    out.push(`DTSTAMP:${now}`)
    out.push(`DTSTART;VALUE=DATE:${r.due.replace(/-/g, '')}`)
    out.push(`DTEND;VALUE=DATE:${nextDay(r.due)}`)
    out.push(fold(`SUMMARY:${esc(r.title)}`))
    out.push(fold(`DESCRIPTION:${esc([r.category, r.notes].filter(Boolean).join(' · '))}`))
    out.push(fold(`CATEGORIES:${esc(r.category)}`))
    out.push('TRANSP:TRANSPARENT')
    if (r.cadence.type === 'every') out.push(`RRULE:FREQ=${FREQ[r.cadence.unit]};INTERVAL=${r.cadence.n}`)
    if (r.lead > 0) {
      out.push('BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(r.title)}`), `TRIGGER:-P${r.lead}D`, 'END:VALARM')
    }
    out.push('END:VEVENT')
  }

  out.push('END:VCALENDAR')
  return out.join('\r\n')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get('t')
  if (!token || !UUID_RE.test(token)) {
    return new Response('missing or malformed token', { status: 400 })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { data: profile, error: pErr } = await admin
    .from('otaat_profiles')
    .select('id')
    .eq('calendar_token', token)
    .maybeSingle()

  if (pErr) return new Response('lookup failed', { status: 500 })
  if (!profile) return new Response('unknown token', { status: 404 })

  const { data, error } = await admin
    .from('otaat_reminders')
    .select('payload')
    .eq('user_id', profile.id)
    .order('due', { ascending: true })

  if (error) return new Response('query failed', { status: 500 })

  const ics = buildICS((data ?? []).map((r) => r.payload as Reminder))

  return new Response(ics, {
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': 'inline; filename="otaat.ics"',
      'cache-control': 'public, max-age=1800',
    },
  })
})
