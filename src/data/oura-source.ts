/**
 * Quelle der Schlaf- und Gesundheitswerte: der Oura-Ring.
 *
 * Anders als beim Kalorienbrudi-Bestand gibt es hier keinen oeffentlichen
 * Schluessel. Oura hat die persoenlichen Zugangstoken im Dezember 2025
 * abgeschafft; es laeuft ueber OAuth, und das Tokenpaar gehoert nicht in ein
 * Browser-Bundle. Die App redet deshalb nie mit Oura, sondern mit drei
 * Edge Functions, die das Token halten: `oura-connect`, `oura-callback`,
 * `oura-days`.
 */

export interface OuraField {
  key: string
  name: string
  unit?: string
}

/**
 * Was als Rubrik im Checker steht.
 *
 * `sleep` ist mit Absicht die **bestehende** Kennung: die Rubrik gab es vom
 * ersten Tag an, von Hand gefuehrt, und die alten Tage sollen mit den neuen
 * eine Reihe bleiben. Es wechselt nur die Quelle, nicht die Groesse.
 */
export const OURA_CHECKS: OuraField[] = [
  { key: 'sleep',             name: 'Schlaf',      unit: 'h' },
  { key: 'oura_sleep_score',  name: 'Schlaf-Score' },
  { key: 'oura_readiness',    name: 'Tagesform' },
  { key: 'oura_steps',        name: 'Schritte' },
]

/**
 * Was mitkommt, ohne auf einer Karte zu stehen — dieselbe Regel wie bei den
 * Mikronaehrwerten. Ruhepuls und HRV stehen hier bewusst: sie sind die
 * interessantesten Groessen ueberhaupt fuer den Zusammenhang-Finder, aber
 * niemand hakt sie abends ab.
 */
export const OURA_HIDDEN: OuraField[] = [
  { key: 'oura_rhr',         name: 'Ruhepuls',      unit: 'bpm' },
  { key: 'oura_hrv',         name: 'HRV',           unit: 'ms' },
  { key: 'oura_temp',        name: 'Temperatur',    unit: '°C' },
  { key: 'oura_breath',      name: 'Atemfrequenz',  unit: '/min' },
  { key: 'oura_efficiency',  name: 'Schlafeffizienz', unit: '%' },
  { key: 'oura_in_bed',      name: 'Zeit im Bett',  unit: 'h' },
  { key: 'oura_deep',        name: 'Tiefschlaf',    unit: 'min' },
  { key: 'oura_rem',         name: 'REM-Schlaf',    unit: 'min' },
  { key: 'oura_light',       name: 'Leichtschlaf',  unit: 'min' },
  { key: 'oura_awake',       name: 'Wach in der Nacht', unit: 'min' },
  { key: 'oura_latency',     name: 'Einschlafdauer', unit: 'min' },
  { key: 'oura_active_kcal', name: 'Aktivkalorien', unit: 'kcal' },
  { key: 'oura_met',         name: 'MET-Minuten' },
]

export const OURA_HIDDEN_KEYS = new Set(OURA_HIDDEN.map((f) => f.key))
