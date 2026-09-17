/**
 * Wohin OTAAT schreibt.
 *
 * Der Schluessel steht hier im Klartext und das ist kein Versehen: ein
 * Publishable Key ist dafuer gemacht, im Browser zu stehen. Er liegt ohnehin
 * in jedem ausgelieferten Bundle, jede Seite kann ihn aus dem Quelltext
 * lesen. Was die Daten schuetzt, ist RLS — jede Zeile traegt ihren Besitzer,
 * und ohne Login sieht man gar nichts. Wer ueberhaupt einen Account anlegen
 * darf, steht in `otaat_invited` (siehe `supabase/migrations/0001_init.sql`).
 *
 * Genau so macht es `brudi-source.ts` mit demselben Projekt.
 *
 * Ueber `.env` laesst sich beides ueberschreiben, etwa um lokal gegen eine
 * eigene Instanz zu entwickeln.
 */

export const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://xrreswpociuovpxhjavo.supabase.co'

export const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  'sb_publishable_61Fx-jFJvUIEc2nJXENaZQ_llHar01M'

/**
 * Das Projekt DenisInc ist geteilt — dort liegen auch Kalorienbrudi und
 * Malena Cosmetics. Deshalb traegt jede Tabelle von OTAAT dieses Praefix.
 */
export const T = {
  profiles: 'otaat_profiles',
  checks: 'otaat_checks',
  days: 'otaat_days',
  reminders: 'otaat_reminders',
  nodes: 'otaat_board_nodes',
  frames: 'otaat_board_frames',
  edges: 'otaat_board_edges',
} as const
