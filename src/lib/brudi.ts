import { BRUDI_FIELDS, BRUDI_TARGET_COL, BRUDI_VIEW } from '../data/brudi-source'
import { supabase } from './supabase'

/* Tageswerte aus dem Kalorienbrudi-Bestand. */

export interface BrudiDay {
  date: string
  /** Schluessel aus `BRUDI_FIELDS` -> Wert. Nur, was drueben auch dasteht. */
  values: Record<string, number>
  /** Das Kalorienziel des Tages. Keine Rubrik, nur zur Anzeige. */
  target: number | null
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

const COLUMNS = ['datum', BRUDI_TARGET_COL, ...BRUDI_FIELDS.map((f) => f.col)].join(',')

/**
 * Holt die Tage einer Person ab `from`. Wirft nicht — ohne Netz oder bei
 * einem Fehler kommt eine leere Liste zurueck, und die Karte zeigt weiter
 * das, was schon lokal liegt. Die Rubrik soll nicht die ganze Seite
 * mitreissen.
 *
 * Gelesen wird ueber den angemeldeten Client, nicht mehr mit dem
 * oeffentlichen Schluessel: seit die View beide Konten fuehrt, stehen dort
 * auch Zahlen, die nicht Denis gehoeren. `anon` kommt nicht mehr an die
 * View, nur noch `authenticated`.
 *
 * Ein Tag ohne Kalorien ist kein Tag: an dem war drueben nichts eingetragen,
 * und die Naehrwerte waeren dann ohnehin leer.
 */
export async function fetchBrudi(person: string, from: string): Promise<BrudiDay[]> {
  if (!supabase || !person) return []
  try {
    const { data, error } = await supabase
      .from(BRUDI_VIEW)
      .select(COLUMNS)
      .eq('person', person)
      .gte('datum', from)
      .order('datum', { ascending: true })
    if (error) return []
    const rows = (data ?? []) as unknown as Record<string, unknown>[]

    const out: BrudiDay[] = []
    for (const r of rows) {
      const values: Record<string, number> = {}
      for (const f of BRUDI_FIELDS) {
        const v = num(r[f.col])
        if (v !== null) values[f.key] = v
      }
      // Ohne Kalorien stand drueben nichts — dann auch hier nicht.
      if (values['brudi_kcal'] === undefined) continue
      out.push({ date: String(r['datum']), values, target: num(r[BRUDI_TARGET_COL]) })
    }
    return out
  } catch {
    return []
  }
}

/** Welche Konten der Kalorienbrudi-Bestand kennt. Nur Namen. */
export async function brudiPersonen(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('brudi_personen').select('person')
  if (error) return []
  return (data ?? [])
    .map((r) => String((r as { person: unknown }).person))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'de'))
}
