/**
 * OTAAT — Oura verbinden, Schritt 1
 *
 * Gibt die Adresse zurueck, auf die der Nutzer geschickt wird, damit er bei
 * Oura zustimmt. Dazu wird ein einmaliges Zufallswort hinterlegt, das den
 * Rueckkehrer spaeter wieder diesem Konto zuordnet — der Rueckweg von Oura
 * kommt ohne Anmeldung an unserer Seite an.
 *
 *   POST /functions/v1/oura-connect     (mit dem Supabase-Token des Nutzers)
 *   -> { url }
 *
 * Deploy:  supabase functions deploy oura-connect
 *
 * Secrets:  OURA_CLIENT_ID, OURA_REDIRECT_URI
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/* Was OTAAT von Oura sehen will. Mehr nicht — `personal` (Name, Geschlecht,
   Geburtsjahr) und `email` bleiben draussen, die braucht hier niemand. */
const SCOPE = 'daily heartrate workout session spo2'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })

  const clientId = Deno.env.get('OURA_CLIENT_ID')
  const redirect = Deno.env.get('OURA_REDIRECT_URI')
  if (!clientId || !redirect) return json({ error: 'Oura ist auf dem Server nicht eingerichtet.' }, 500)

  const auth = req.headers.get('Authorization') ?? ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return json({ error: 'Nicht angemeldet.' }, 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: who, error: whoErr } = await admin.auth.getUser(jwt)
  if (whoErr || !who.user) return json({ error: 'Nicht angemeldet.' }, 401)

  // 32 Byte aus dem Zufallsgenerator des Systems, nicht aus Math.random.
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const state = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

  // Liegengebliebene Zwischenschritte dieses Nutzers raeumen wir gleich mit
  // weg — abgebrochene Versuche sollen sich nicht ansammeln.
  await admin.from('otaat_oura_state').delete().eq('user_id', who.user.id)
  const { error } = await admin.from('otaat_oura_state').insert({ state, user_id: who.user.id })
  if (error) return json({ error: error.message }, 500)

  const url =
    'https://cloud.ouraring.com/oauth/authorize' +
    `?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirect)}` +
    `&scope=${encodeURIComponent(SCOPE)}` +
    `&state=${state}`

  return json({ url })
})
