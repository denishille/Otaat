import { supabase } from './supabase'
import type { AppState, DayEntry } from './types'

/* Schlaf- und Gesundheitswerte vom Ring.
   -----------------------------------------------------------------------
   Die App spricht nie direkt mit Oura: das Zugangstoken liegt in einer
   Edge Function, und Oura gibt Browser-Aufrufen ohnehin keine CORS-Freigabe. */

export interface OuraDay {
  date: string
  /** Schluessel -> Wert. Die Bettzeit kommt als "HH:MM". */
  values: Record<string, number | string>
}

export interface OuraAnswer {
  connected: boolean
  days: OuraDay[]
  error?: string
}

const leer: OuraAnswer = { connected: false, days: [] }

/**
 * Die Meldung aus der Function herausholen.
 *
 * Bei einem Fehlercode gibt supabase-js nur "Edge Function returned a non-2xx
 * status code" zurueck — der Rumpf, in dem der eigentliche Grund auf Deutsch
 * steht, haengt unter `context`. Ohne das hier steht in der App eine Zeile,
 * mit der niemand etwas anfangen kann.
 */
async function grund(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown })?.context
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json() as { error?: string }
      if (body?.error) return body.error
    } catch { /* kein JSON — dann bleibt die Standardmeldung */ }
  }
  const msg = error instanceof Error ? error.message : String(error)
  // Der haeufigste Fall, und als Satz voellig unbrauchbar: der Aufruf hat die
  // Function gar nicht erreicht. Netz weg, oder CORS.
  if (msg.includes('Failed to send a request')) {
    return 'Der Server war nicht erreichbar.'
  }
  return msg
}

/**
 * Holt die Tage ab `from`. Wirft nicht — ohne Netz oder bei einem Fehler
 * bleibt stehen, was schon lokal liegt.
 */
export async function fetchOura(from: string, to: string): Promise<OuraAnswer> {
  if (!supabase) return leer
  try {
    const { data, error } = await supabase.functions.invoke('oura-days', { body: { from, to } })
    if (error) return { ...leer, error: await grund(error) }
    return (data as OuraAnswer) ?? leer
  } catch (e) {
    return { ...leer, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * Startet die Verbindung. Gibt die Adresse zurueck, auf die der Nutzer
 * geschickt werden muss — der Aufruf selbst oeffnet nichts, damit die
 * aufrufende Stelle entscheiden kann, ob das ein neues Fenster wird.
 */
export async function ouraConnectUrl(): Promise<{ url?: string; error?: string }> {
  if (!supabase) return { error: 'Ohne Konto geht das nicht.' }
  try {
    const { data, error } = await supabase.functions.invoke('oura-connect', { body: {} })
    if (error) return { error: await grund(error) }
    const url = (data as { url?: string; error?: string })?.url
    return url ? { url } : { error: (data as { error?: string })?.error ?? 'Unbekannter Fehler.' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** Steht eine Verbindung? Liest die View, nie die Token-Tabelle. */
export async function ouraConnected(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.from('otaat_oura_status').select('connected_at').maybeSingle()
  return (data?.connected_at as string | undefined) ?? null
}

/** Verbindung loesen. Die Token-Zeile ist nur fuer die Function erreichbar,
    also macht das auch die Function — ueber denselben Weg wie der Abruf. */
export async function ouraDisconnect(): Promise<string | null> {
  if (!supabase) return 'Ohne Konto geht das nicht.'
  const { error } = await supabase.functions.invoke('oura-days', { body: { disconnect: true } })
  return error ? await grund(error) : null
}

/**
 * Die Ringwerte in den Bestand schreiben.
 *
 * Steht hier und nicht im Effekt, weil die eine interessante Regel darin
 * steckt und eine Regel, die man nicht pruefen kann, keine ist.
 *
 * **Wo der Ring etwas weiss, gilt der Ring** — auch fuer Schlafdauer, Zubett-
 * und Aufstehzeit, und auch rueckwirkend. Die hat frueher die Hand gefuehrt,
 * und eine Weile lang hat der Ring sie nur gefuellt, wo nichts stand; das
 * hiess aber, dass auf der Karte weiter geschaetzte Zahlen standen, obwohl
 * gemessene daneben lagen. Wo der Ring nichts hat — Nacht ohne Ring, Zeit vor
 * der Verbindung —, bleibt der Handeintrag stehen und bleibt aenderbar.
 */
export function applyOuraDays(
  draft: AppState,
  days: OuraDay[],
  leererTag: (date: string) => DayEntry,
): number {
  let geschrieben = 0
  for (const row of days) {
    const day = (draft.days[row.date] ??= leererTag(row.date))
    const weg = new Set(day.dropped ?? [])
    for (const [key, v] of Object.entries(row.values)) {
      // Was fuer diesen Tag weggeworfen wurde, kommt nicht wieder.
      if (weg.has(key)) continue
      if (day.values[key] === v) continue
      day.values[key] = v
      geschrieben++
    }
    // Einmal vom Ring gefuellt heisst: die Uebernahme vom Vortag hat hier
    // nichts mehr zu suchen.
    day.carried = [...new Set([...(day.carried ?? []), ...Object.keys(row.values)])]
  }
  return geschrieben
}
