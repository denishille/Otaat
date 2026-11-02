import { BRUDI_FIELDS, BRUDI_HIDDEN, BRUDI_HIDDEN_KEYS } from './brudi-source'
import { OURA_FIELDS, OURA_HIDDEN, OURA_HIDDEN_KEYS } from './oura-source'

/**
 * Gemessene Werte ohne eigene Rubrik.
 *
 * Sie liegen unter ihrem Schluessel im Tag wie jeder andere Wert, stehen aber
 * auf keiner Karte und in keinem Detail. Sichtbar werden sie nur, wenn der
 * Zusammenhang-Finder etwas damit findet.
 *
 * Zwei Sorten mit derselben Begruendung: Mikronaehrwerte aus dem
 * Kalorienbrudi-Bestand und die feineren Werte vom Ring. Abends dreissig
 * Karten durchzusehen macht niemand; ob das Magnesium oder die HRV drei Tage
 * spaeter am Fokus haengt, will man trotzdem wissen.
 */
export const HIDDEN_MEASURES = [...BRUDI_HIDDEN, ...OURA_HIDDEN]

export const HIDDEN_KEYS = new Set([...BRUDI_HIDDEN_KEYS, ...OURA_HIDDEN_KEYS])

/**
 * Welche gemessenen Werte Facetten **derselben Messung** sind.
 *
 * Dass die Kohlenhydrate mit den Kalorien laufen, ist kein Fund, sondern
 * Arithmetik — sie sind ein Teil davon, und jeder Mikronaehrwert steigt
 * ohnehin mit, wenn mehr auf dem Teller lag. Dasselbe beim Ring: Dauer,
 * Tiefschlaf, Effizienz, HRV und Schlaf-Score beschreiben eine Nacht, und
 * die Tagesform rechnet Oura selbst daraus aus.
 *
 * Solche Paare laesst der Zusammenhang-Finder aus. Nicht nur, weil die Karte
 * nichts wert ist — jeder Test kostet auch Budget bei der Korrektur fuer
 * Mehrfachvergleiche, und zwanzig sichere Tautologien draengen alles weg,
 * was wirklich einen Zusammenhang haette.
 *
 * Quer ueber die Gruppen bleibt alles erlaubt: Essen gegen Schlaf, Schritte
 * gegen Schlaf, und alles gegen die eigenen Eintraege — dort stehen die
 * Fragen, die man nicht schon kennt.
 */
const GEBILDE = new Map<string, string>([
  ...BRUDI_FIELDS.map((f) => [f.key, 'essen'] as [string, string]),
  ...OURA_FIELDS.map((f) => [f.key, f.gruppe] as [string, string]),
])

/**
 * Zu welcher Messung ein Schluessel gehoert, oder `null` fuer alles Eigene.
 *
 * Die Uhrzeiten neben einem Wert (`sleep@time`) gehoeren zu ihrem Wert — sie
 * sind dieselbe Nacht, nur eine andere Zahl davon.
 */
export function gebilde(key: string): string | null {
  return GEBILDE.get(key.split('@')[0]) ?? null
}
