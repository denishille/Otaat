import { BRUDI_KEY, BRUDI_URL, BRUDI_VIEW } from '../data/brudi-source'

/* Tagesaktuelle Kalorien aus dem Kalorienbrudi-Bestand. */

export interface BrudiDay {
  date: string
  kcal: number
  target: number | null
}

interface Row {
  datum: string
  kalorien_kcal: string | number | null
  kalorienziel_kcal: string | number | null
}

const num = (v: string | number | null): number | null => {
  if (v === null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Holt die Tage ab `from`. Wirft nicht — ohne Netz oder bei einem Fehler
 * kommt eine leere Liste zurueck, und die Karte zeigt weiter das, was schon
 * lokal liegt. Die Rubrik soll nicht die ganze Seite mitreissen.
 */
export async function fetchBrudi(from: string, signal?: AbortSignal): Promise<BrudiDay[]> {
  const url =
    `${BRUDI_URL}/rest/v1/${BRUDI_VIEW}` +
    `?select=datum,kalorien_kcal,kalorienziel_kcal&datum=gte.${from}&order=datum.asc`

  try {
    const res = await fetch(url, {
      signal,
      headers: { apikey: BRUDI_KEY, Authorization: `Bearer ${BRUDI_KEY}` },
    })
    if (!res.ok) return []
    const rows = (await res.json()) as Row[]
    return rows
      .map((r) => ({ date: r.datum, kcal: num(r.kalorien_kcal), target: num(r.kalorienziel_kcal) }))
      .filter((d): d is BrudiDay => d.kcal !== null)
  } catch {
    return []
  }
}
