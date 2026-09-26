import { BRUDI_HIDDEN, BRUDI_HIDDEN_KEYS } from './brudi-source'
import { OURA_HIDDEN, OURA_HIDDEN_KEYS } from './oura-source'

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
