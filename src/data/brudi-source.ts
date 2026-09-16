/**
 * Quelle der Essens-Rubrik: das Kalorienbrudi-Projekt.
 *
 * Gelesen wird die View `brudi_tag_public`, die ausschliesslich Datum,
 * Kalorien und Tagesziel von Denis enthaelt — kein Gewicht, keine Symptome,
 * keine Lebensmittelliste. Die drei Basistabellen bleiben fuer diesen
 * Schluessel gesperrt (RLS an, keine Policy), geprueft mit `set role anon`.
 *
 * Der Schluessel steht hier bewusst im Klartext: er ist als oeffentlicher
 * Schluessel gedacht und gibt genau diese eine View frei, sonst nichts.
 * Ueber die Umgebungsvariablen laesst er sich ueberschreiben.
 */
export const BRUDI_URL =
  (import.meta.env.VITE_BRUDI_URL as string | undefined) ??
  'https://xrreswpociuovpxhjavo.supabase.co'

export const BRUDI_KEY =
  (import.meta.env.VITE_BRUDI_KEY as string | undefined) ??
  'sb_publishable_61Fx-jFJvUIEc2nJXENaZQ_llHar01M'

export const BRUDI_VIEW = 'brudi_tag_public'
