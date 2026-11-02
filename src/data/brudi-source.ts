/**
 * Quelle der Essens-Rubrik: das Kalorienbrudi-Projekt.
 *
 * Gelesen wird die View `brudi_tag_public` — Tageswerte von Denis, sonst
 * nichts. Kein Gewicht, keine Symptome, keine Lebensmittelliste. Die drei
 * Basistabellen bleiben fuer diesen Schluessel gesperrt (RLS an, keine
 * Policy), geprueft mit `set role anon`: 124 Zeilen aus der View, 0 aus
 * `tagesuebersicht` und `lebensmittel_analyse`.
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

export interface BrudiField {
  /** Schluessel im Tag, unter dem der Wert landet. */
  key: string
  /** Spalte in der View. */
  col: string
  /** Wie es in der Statistik heisst. */
  name: string
  unit?: string
}

/**
 * Was als eigene Rubrik im Checker steht: die Kalorien, sonst nichts.
 *
 * Die Makros hatten kurzzeitig eigene Karten. Vier Kacheln fuer eine Mahlzeit
 * sind aber keine vier Fragen — es ist eine Zahl mit drei Erlaeuterungen.
 * Sie stehen jetzt **auf** der Kalorien-Kachel und in deren Detail.
 */
export const BRUDI_CHECKS: BrudiField[] = [
  { key: 'brudi_kcal', col: 'kalorien_kcal', name: 'Essen', unit: 'kcal' },
]

/**
 * Die drei Makros. Keine eigene Rubrik, aber auch nicht unsichtbar wie die
 * Mikronaehrwerte: sie stehen als Zeile unter den Kalorien und als Kacheln
 * im Detail. Gerechnet wird mit ihnen wie mit allem anderen Gemessenen.
 */
export const BRUDI_MACROS: BrudiField[] = [
  { key: 'brudi_protein', col: 'protein_g',       name: 'Eiweiß',        unit: 'g' },
  { key: 'brudi_carbs',   col: 'kohlenhydrate_g', name: 'Kohlenhydrate', unit: 'g' },
  { key: 'brudi_fat',     col: 'fett_g',          name: 'Fett',          unit: 'g' },
]

/**
 * Was mitkommt, ohne je auf einer Karte zu stehen: die Mikronaehrwerte und
 * die drei Einordnungen. Sie liegen im Tag wie jeder andere gemessene Wert
 * und gehen in die Zusammenhangs-Suche ein — ob der Magnesiumtag drei Tage
 * spaeter am Schlaf haengt, ist eine Frage, die man nicht von Hand stellt.
 *
 * Die Einordnungen kommen als Zahl zwischen -1 und +1 aus der View: jedes
 * Lebensmittel zaehlt gut / neutral / schlecht als +1 / 0 / -1, gewichtet
 * mit seinen Kalorien. Grosser Wert heisst guter Tag.
 */
export const BRUDI_HIDDEN: BrudiField[] = [
  ...BRUDI_MACROS,
  { key: 'brudi_sugar',   col: 'zucker_g',        name: 'Zucker',        unit: 'g' },
  { key: 'brudi_fiber',   col: 'ballaststoffe_g', name: 'Ballaststoffe', unit: 'g' },
  { key: 'brudi_chol',    col: 'cholesterin_mg',  name: 'Cholesterin',   unit: 'mg' },
  { key: 'brudi_omega3',  col: 'omega3_g',        name: 'Omega 3',       unit: 'g' },
  { key: 'brudi_calcium', col: 'calcium_mg',      name: 'Calcium',       unit: 'mg' },
  { key: 'brudi_iron',    col: 'eisen_mg',        name: 'Eisen',         unit: 'mg' },
  { key: 'brudi_potass',  col: 'kalium_mg',       name: 'Kalium',        unit: 'mg' },
  { key: 'brudi_magnes',  col: 'magnesium_mg',    name: 'Magnesium',     unit: 'mg' },
  { key: 'brudi_selen',   col: 'selen_ug',        name: 'Selen',         unit: 'µg' },
  { key: 'brudi_zinc',    col: 'zink_mg',         name: 'Zink',          unit: 'mg' },
  { key: 'brudi_iodine',  col: 'jod_ug',          name: 'Jod',           unit: 'µg' },
  { key: 'brudi_folate',  col: 'folat_ug',        name: 'Folat',         unit: 'µg' },
  { key: 'brudi_vit_a',   col: 'vitamin_a_ug',    name: 'Vitamin A',     unit: 'µg' },
  { key: 'brudi_vit_b12', col: 'vitamin_b12_ug',  name: 'Vitamin B12',   unit: 'µg' },
  { key: 'brudi_vit_c',   col: 'vitamin_c_mg',    name: 'Vitamin C',     unit: 'mg' },
  { key: 'brudi_vit_d',   col: 'vitamin_d_ug',    name: 'Vitamin D',     unit: 'µg' },
  { key: 'brudi_vit_e',   col: 'vitamin_e_mg',    name: 'Vitamin E',     unit: 'mg' },
  { key: 'brudi_vit_k',   col: 'vitamin_k_ug',    name: 'Vitamin K',     unit: 'µg' },
  { key: 'brudi_acid',    col: 'saeure_base_idx', name: 'Säure-Base' },
  { key: 'brudi_fodmap',  col: 'low_fodmap_idx',  name: 'FODMAP' },
  { key: 'brudi_gut',     col: 'darm_idx',        name: 'Darm' },
]

export const BRUDI_FIELDS: BrudiField[] = [...BRUDI_CHECKS, ...BRUDI_HIDDEN]

/** Schluessel -> Makro, fuer die Anzeige auf der Kalorien-Kachel. */
export const BRUDI_MACRO_KEYS = BRUDI_MACROS.map((f) => f.key)

/** Die Schluessel, die im Tag liegen, ohne dass eine Rubrik dazu gehoert. */
export const BRUDI_HIDDEN_KEYS = new Set(BRUDI_HIDDEN.map((f) => f.key))

/** Das Tagesziel steht neben den Werten, gehoert aber zu keiner Rubrik. */
export const BRUDI_TARGET_COL = 'kalorienziel_kcal'
