/**
 * OTAAT — Werte aus der Oura-Cloud
 *
 * Holt Schlaf, Readiness und Aktivitaet fuer einen Zeitraum und gibt sie als
 * Tage zurueck, wie OTAAT sie ablegt. Das Zugangstoken bleibt hier; der
 * Browser bekommt es nie zu sehen.
 *
 *   POST /functions/v1/oura-days   { from: "2026-06-01", to: "2026-09-26" }
 *   -> { days: [ { date, values: { ... } } ], connected: true }
 *
 * Deploy:  supabase functions deploy oura-days
 *
 * Secrets:  OURA_CLIENT_ID, OURA_CLIENT_SECRET
 *
 * ---------------------------------------------------------------------------
 * Welcher Wert auf welchen Tag gehoert
 *
 * Oura datiert eine Nacht auf den Tag, an dem man **aufwacht**. OTAAT fuehrt
 * den Schlaf seit jeher auf dem Tag, an dem man **ins Bett geht** — dort steht
 * ja auch die Bettzeit, und der Checker-Tag wechselt aus genau dem Grund erst
 * um sechs Uhr morgens.
 *
 * Wer das nicht umrechnet, verschiebt die halbe Zeitreihe um einen Tag, und
 * der Zusammenhang-Finder sucht danach Effekte, die es nur durch den Versatz
 * gibt. Also:
 *
 *   Schlaf-Sitzung (Dauer, Bettzeit, HRV, Ruhepuls, Tief/REM, Effizienz)
 *     -> Checker-Tag des **Zubettgehens**
 *   Schlaf-Score  -> derselbe Tag wie die Nacht, die er bewertet
 *   Readiness, Schritte, Aktivitaet -> der Oura-Tag, das ist der wache Tag
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  // `x-client-info` und `x-supabase-api-version` schickt der Supabase-Client
  // bei jedem Aufruf mit. Fehlen sie hier, beantwortet der Vorab-Check (OPTIONS)
  // zwar mit 200, aber der Browser verwirft danach den eigentlichen Aufruf —
  // in der App steht dann "Failed to send a request to the Edge Function", und
  // im Protokoll steht ein OPTIONS ohne jedes POST dahinter.
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, x-supabase-api-version, apikey, content-type',
  'Access-Control-Max-Age': '86400',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Ab dieser Stunde faengt der Checker-Tag an. Gleich gehalten mit `dates.ts`. */
const DAY_STARTS_AT = 6

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Der Checker-Tag zu einem Zeitpunkt mit Zeitzonen-Versatz, so wie Oura ihn
 * liefert ("2026-09-21T23:15:00+02:00"). Gerechnet wird in der **oertlichen**
 * Zeit des Zeitstempels, nicht in UTC: 23:15 Ortszeit ist der Abend des 21.,
 * auch wenn UTC da schon den 22. schreibt.
 */
function checkerDayOf(stamp: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(stamp)
  if (!m) return null
  const [, y, mo, d, h] = m
  const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (Number(h) < DAY_STARTS_AT) dt.setUTCDate(dt.getUTCDate() - 1)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** "2026-09-21T23:15:00+02:00" -> "23:15" */
function clockOf(stamp: string): string | null {
  const m = /T(\d{2}):(\d{2})/.exec(stamp)
  return m ? `${m[1]}:${m[2]}` : null
}

const r1 = (n: number) => Math.round(n * 10) / 10

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return json({ error: 'Nicht angemeldet.' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt)
  if (whoErr || !who.user) return json({ error: 'Nicht angemeldet.' }, 401)

  let body: { from?: string; to?: string; disconnect?: boolean } = {}
  try { body = await req.json() } catch { /* leerer Rumpf ist erlaubt */ }

  // Verbindung loesen. Laeuft ueber diese Function, weil die Token-Tabelle
  // keine Policy hat und ein Client sie deshalb selbst nicht anfassen kann.
  if (body.disconnect) {
    await admin.from('otaat_oura_tokens').delete().eq('user_id', who.user.id)
    await admin.from('otaat_oura_state').delete().eq('user_id', who.user.id)
    return json({ connected: false, days: [] })
  }

  const to = body.to ?? new Date().toISOString().slice(0, 10)
  const from = body.from ?? new Date(Date.now() - 180 * 86400_000).toISOString().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return json({ error: 'Zeitraum unverstaendlich.' }, 400)
  }

  const { data: row } = await admin
    .from('otaat_oura_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', who.user.id)
    .maybeSingle()

  if (!row) return json({ connected: false, days: [] })

  let token = row.access_token as string

  // Eine Minute Luft: ein Token, das waehrend des Abrufs ablaeuft, ist so
  // gut wie abgelaufen.
  if (new Date(row.expires_at as string).getTime() - 60_000 < Date.now()) {
    const res = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token as string,
        client_id: Deno.env.get('OURA_CLIENT_ID')!,
        client_secret: Deno.env.get('OURA_CLIENT_SECRET')!,
      }),
    })
    if (!res.ok) {
      console.error('Auffrischen fehlgeschlagen', res.status, await res.text())
      // Das Auffrischungstoken ist verbraucht oder zurueckgezogen. Die Zeile
      // muss weg, sonst versucht es die App bei jedem Start wieder.
      await admin.from('otaat_oura_tokens').delete().eq('user_id', who.user.id)
      return json({ connected: false, days: [], error: 'Die Oura-Verbindung ist abgelaufen. Bitte neu verbinden.' })
    }
    const tok = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
    token = tok.access_token
    await admin.from('otaat_oura_tokens').update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token ?? row.refresh_token,
      expires_at: new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString(),
    }).eq('user_id', who.user.id)
  }

  /** Eine Sammlung abrufen. Oura blaettert ueber `next_token`. */
  async function collect(pfad: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = []
    let next: string | null = null
    for (let seite = 0; seite < 20; seite++) {
      const u = new URL(`https://api.ouraring.com/v2/usercollection/${pfad}`)
      u.searchParams.set('start_date', from)
      u.searchParams.set('end_date', to)
      if (next) u.searchParams.set('next_token', next)
      const res = await fetch(u, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) {
        console.error(`Oura ${pfad}`, res.status, await res.text())
        return out
      }
      const j = await res.json() as { data?: Record<string, unknown>[]; next_token?: string | null }
      out.push(...(j.data ?? []))
      next = j.next_token ?? null
      if (!next) break
    }
    return out
  }

  const [sessions, sleepScores, readiness, activity] = await Promise.all([
    collect('sleep'),
    collect('daily_sleep'),
    collect('daily_readiness'),
    collect('daily_activity'),
  ])

  const days: Record<string, Record<string, number | string>> = {}
  const put = (tag: string | null, key: string, v: number | string | null | undefined) => {
    if (!tag || v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return
    ;(days[tag] ??= {})[key] = v
  }

  /* Oura-Tag -> Checker-Tag des Zubettgehens. Fuellt sich aus den Sitzungen
     und traegt danach den Schlaf-Score an die richtige Stelle. */
  const bettTag: Record<string, string> = {}

  for (const s of sessions) {
    // Nickerchen sind kein Nachtschlaf und haetten in der Dauer nichts verloren.
    if (s.type && s.type !== 'long_sleep' && s.type !== 'sleep') continue
    const start = String(s.bedtime_start ?? '')
    const tag = checkerDayOf(start)
    if (!tag) continue
    if (s.day) bettTag[String(s.day)] = tag

    const total = Number(s.total_sleep_duration ?? NaN)
    if (Number.isFinite(total)) put(tag, 'sleep', r1(total / 3600))
    put(tag, 'sleep@time', clockOf(start))

    const inBed = Number(s.time_in_bed ?? NaN)
    if (Number.isFinite(inBed)) put(tag, 'oura_in_bed', r1(inBed / 3600))
    for (const [key, feld, teiler] of [
      ['oura_deep', 'deep_sleep_duration', 60],
      ['oura_rem', 'rem_sleep_duration', 60],
      ['oura_light', 'light_sleep_duration', 60],
      ['oura_awake', 'awake_time', 60],
      ['oura_latency', 'latency', 60],
    ] as const) {
      const v = Number(s[feld] ?? NaN)
      if (Number.isFinite(v)) put(tag, key, Math.round(v / teiler))
    }
    put(tag, 'oura_efficiency', Number(s.efficiency ?? NaN))
    put(tag, 'oura_hrv', Number(s.average_hrv ?? NaN))
    put(tag, 'oura_rhr', Number(s.lowest_heart_rate ?? NaN))
    put(tag, 'oura_breath', Number(s.average_breath ?? NaN))
  }

  for (const d of sleepScores) {
    const oura = String(d.day ?? '')
    put(bettTag[oura] ?? null, 'oura_sleep_score', Number(d.score ?? NaN))
  }

  for (const d of readiness) {
    const tag = String(d.day ?? '')
    put(tag, 'oura_readiness', Number(d.score ?? NaN))
    const temp = (d as { temperature_deviation?: number }).temperature_deviation
    if (typeof temp === 'number') put(tag, 'oura_temp', Math.round(temp * 100) / 100)
  }

  for (const d of activity) {
    const tag = String(d.day ?? '')
    put(tag, 'oura_steps', Number(d.steps ?? NaN))
    put(tag, 'oura_active_kcal', Number(d.active_calories ?? NaN))
    put(tag, 'oura_met', Number(d.average_met_minutes ?? NaN))
  }

  return json({
    connected: true,
    days: Object.entries(days)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, values]) => ({ date, values })),
  })
})
