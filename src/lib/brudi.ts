import { BRUDI_FIELDS, BRUDI_KEY, BRUDI_TARGET_COL, BRUDI_URL, BRUDI_VIEW } from '../data/brudi-source'

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
 * Holt die Tage ab `from`. Wirft nicht — ohne Netz oder bei einem Fehler
 * kommt eine leere Liste zurueck, und die Karte zeigt weiter das, was schon
 * lokal liegt. Die Rubrik soll nicht die ganze Seite mitreissen.
 *
 * Ein Tag ohne Kalorien ist kein Tag: an dem war drueben nichts eingetragen,
 * und die Naehrwerte waeren dann ohnehin leer.
 */
export async function fetchBrudi(from: string, signal?: AbortSignal): Promise<BrudiDay[]> {
  const url =
    `${BRUDI_URL}/rest/v1/${BRUDI_VIEW}` +
    `?select=${COLUMNS}&datum=gte.${from}&order=datum.asc`

  try {
    const res = await fetch(url, {
      signal,
      headers: { apikey: BRUDI_KEY, Authorization: `Bearer ${BRUDI_KEY}` },
    })
    if (!res.ok) return []
    const rows = (await res.json()) as Record<string, unknown>[]

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
