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
  /**
   * Welche Messung der Wert beschreibt.
   *
   * Eine Nacht liefert ein Dutzend Zahlen, die alle dieselbe Nacht sind:
   * Dauer, Tiefschlaf, Effizienz, HRV, Schlaf-Score, Tagesform. Dass die
   * miteinander laufen, ist keine Entdeckung, sondern die Messung selbst —
   * der Zusammenhang-Finder laesst Paare aus derselben Gruppe deshalb aus.
   * Die Tagesform haengt hier mit dran: Oura rechnet sie aus HRV, Ruhepuls
   * und Schlaf aus, sie ist kein unabhaengiger Wert.
   */
  gruppe: 'nacht' | 'bewegung'
}

/**
 * Was als Rubrik im Checker steht.
 *
 * `sleep` ist mit Absicht die **bestehende** Kennung: die Rubrik gab es vom
 * ersten Tag an, von Hand gefuehrt, und die alten Tage sollen mit den neuen
 * eine Reihe bleiben. Es wechselt nur die Quelle, nicht die Groesse.
 */
export const OURA_CHECKS: OuraField[] = [
  { key: 'sleep',             name: 'Schlaf',      unit: 'h', gruppe: 'nacht' },
  { key: 'oura_sleep_score',  name: 'Schlaf-Score',           gruppe: 'nacht' },
  { key: 'oura_readiness',    name: 'Tagesform',              gruppe: 'nacht' },
  { key: 'oura_steps',        name: 'Schritte',               gruppe: 'bewegung' },
]

/**
 * Was mitkommt, ohne auf einer Karte zu stehen — dieselbe Regel wie bei den
 * Mikronaehrwerten. Ruhepuls und HRV stehen hier bewusst: sie sind die
 * interessantesten Groessen ueberhaupt fuer den Zusammenhang-Finder, aber
 * niemand hakt sie abends ab.
 */
export const OURA_HIDDEN: OuraField[] = [
  { key: 'oura_rhr',         name: 'Ruhepuls',      unit: 'bpm', gruppe: 'nacht' },
  { key: 'oura_hrv',         name: 'HRV',           unit: 'ms', gruppe: 'nacht' },
  { key: 'oura_temp',        name: 'Temperatur',    unit: '°C', gruppe: 'nacht' },
  { key: 'oura_breath',      name: 'Atemfrequenz',  unit: '/min', gruppe: 'nacht' },
  { key: 'oura_efficiency',  name: 'Schlafeffizienz', unit: '%', gruppe: 'nacht' },
  { key: 'oura_in_bed',      name: 'Zeit im Bett',  unit: 'h', gruppe: 'nacht' },
  { key: 'oura_deep',        name: 'Tiefschlaf',    unit: 'min', gruppe: 'nacht' },
  { key: 'oura_rem',         name: 'REM-Schlaf',    unit: 'min', gruppe: 'nacht' },
  { key: 'oura_light',       name: 'Leichtschlaf',  unit: 'min', gruppe: 'nacht' },
  { key: 'oura_awake',       name: 'Wach in der Nacht', unit: 'min', gruppe: 'nacht' },
  { key: 'oura_latency',     name: 'Einschlafdauer', unit: 'min', gruppe: 'nacht' },
  { key: 'oura_active_kcal', name: 'Aktivkalorien', unit: 'kcal', gruppe: 'bewegung' },
  { key: 'oura_met',         name: 'MET-Minuten', gruppe: 'bewegung' },
]

export const OURA_HIDDEN_KEYS = new Set(OURA_HIDDEN.map((f) => f.key))

/** Alles vom Ring, mit Karte und ohne — fuer die Gruppenzuordnung. */
export const OURA_FIELDS: OuraField[] = [...OURA_CHECKS, ...OURA_HIDDEN]
