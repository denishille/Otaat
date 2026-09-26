/**
 * OTAAT — Oura verbinden, Schritt 2
 *
 * Hier kommt der Nutzer von Oura zurueck. Ohne Anmeldung an unserer Seite —
 * das ist ein blanker Browser-Aufruf, deshalb `--no-verify-jwt`. Zugeordnet
 * wird ueber das Zufallswort aus Schritt 1, das genau einmal gilt.
 *
 *   GET /functions/v1/oura-callback?code=...&state=...
 *
 * Deploy:  supabase functions deploy oura-callback --no-verify-jwt
 *
 * Secrets:  OURA_CLIENT_ID, OURA_CLIENT_SECRET, OURA_REDIRECT_URI
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

/** Zwischenschritte, die aelter sind als das, gelten als verfallen. */
const STATE_MAX_MIN = 10

const page = (titel: string, text: string, ok: boolean) =>
  new Response(
    `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titel}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100dvh; display:grid; place-items:center;
         font:16px/1.5 -apple-system, system-ui, sans-serif;
         background:#FBFAF7; color:#14161C; padding:24px; }
  @media (prefers-color-scheme: dark) { body { background:#14161C; color:#F2F0EA; } }
  .k { max-width:30rem; text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 .6rem; }
  p  { margin:0; color:#7C8493; }
  .p { display:inline-block; margin-top:1.4rem; padding:.55rem 1rem; border-radius:999px;
       background:${ok ? '#2B4BF2' : '#7C8493'}; color:#fff; font-size:.9rem; }
</style>
<div class="k"><h1>${titel}</h1><p>${text}</p>
<span class="p">Dieses Fenster kannst du schließen.</span></div>`,
    { status: ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  // Oura meldet einen Abbruch ueber `error`, nicht ueber einen Fehlercode.
  const abbruch = url.searchParams.get('error')
  if (abbruch) return page('Abgebrochen', 'Bei Oura wurde nicht zugestimmt. Es wurde nichts gespeichert.', false)
  if (!code || !state) return page('Etwas fehlt', 'Der Rückweg von Oura war unvollständig. Versuch es noch einmal.', false)

  const clientId = Deno.env.get('OURA_CLIENT_ID')
  const secret = Deno.env.get('OURA_CLIENT_SECRET')
  const redirect = Deno.env.get('OURA_REDIRECT_URI')
  if (!clientId || !secret || !redirect) return page('Nicht eingerichtet', 'Auf dem Server fehlen die Oura-Zugangsdaten.', false)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: row } = await admin
    .from('otaat_oura_state')
    .select('user_id, created_at')
    .eq('state', state)
    .maybeSingle()

  // Sofort verbrauchen, egal wie es weitergeht: ein Zufallswort, das zweimal
  // gilt, ist keins.
  await admin.from('otaat_oura_state').delete().eq('state', state)

  if (!row) return page('Abgelaufen', 'Dieser Verbindungsversuch gilt nicht mehr. Fang in OTAAT noch einmal an.', false)
  const alter = (Date.now() - new Date(row.created_at as string).getTime()) / 60000
  if (alter > STATE_MAX_MIN) return page('Abgelaufen', 'Zwischen Anfang und Rückweg lag zu viel Zeit. Fang noch einmal an.', false)

  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirect,
      client_id: clientId,
      client_secret: secret,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    console.error('Oura-Token-Tausch fehlgeschlagen', res.status, text)
    return page('Oura hat abgelehnt', 'Der Tausch des Codes hat nicht geklappt. Versuch es noch einmal.', false)
  }

  const tok = await res.json() as { access_token: string; refresh_token: string; expires_in: number }
  const expires = new Date(Date.now() + (tok.expires_in ?? 86400) * 1000).toISOString()

  const { error } = await admin.from('otaat_oura_tokens').upsert({
    user_id: row.user_id,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: expires,
    connected_at: new Date().toISOString(),
  }, { onConflict: 'user_id' })

  if (error) {
    console.error('Token speichern fehlgeschlagen', error.message)
    return page('Fast', 'Die Verbindung stand, ließ sich aber nicht speichern.', false)
  }

  return page('Oura ist verbunden', 'Zurück in OTAAT holt der Checker die Werte beim nächsten Öffnen.', true)
})
