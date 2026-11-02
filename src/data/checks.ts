import type { CheckDef } from '../lib/types'

/* Das Regal des Everything Checkers.
   -----------------------------------------------------------------------
   Eine frische App hat **keine** Rubriken. Was hier steht, sind Vorlagen zum
   Aussuchen — wer nichts davon mag, legt sich eigene an. Frueher war das die
   Startaufstellung; das hiess, jeder fing mit zwoelf fremden Rubriken an und
   musste erst mal ausmisten.

   `target`   = ab wann der Tag fuer diesen Check als erfuellt gilt
   `inverse`  = weniger ist besser, target ist dann eine Obergrenze
   `fallback` = Startwert, solange es keinen Vortag zum Uebernehmen gibt

   `sort` steht hier nur fuer die Reihenfolge im Regal. Beim Uebernehmen
   bekommt die Rubrik eine neue Nummer ans Ende, und im Checker laesst sich
   alles per Griff umsortieren. */

export interface CheckTemplate {
  def: Omit<CheckDef, 'sort'>
  /** Was unter dem Namen steht. Nur wo es wirklich was erklaert. */
  note?: string
}

export interface CheckGroup {
  title: string
  items: CheckTemplate[]
}

export const CHECK_CATALOG: CheckGroup[] = [
  {
    title: 'Der Tag',
    items: [
      {
        // Bleibt eine Zahl zum Eintragen, auch wenn der Ring verbunden ist:
        // an einer Nacht ohne Ring soll man sie trotzdem nachtragen koennen.
        // Oura fuellt nur, was leer ist — siehe `Today.tsx`.
        def: { id: 'sleep', name: 'Schlaf', kind: 'number', unit: 'h', step: 0.5, target: 8, withTime: true, asDuration: true, noCarry: true },
        note: 'von wann bis wann — der Oura-Ring trägt es selbst ein',
      },
      { def: { id: 'work', name: 'Arbeit', kind: 'number', unit: 'h', step: 0.5, target: 8, fallback: 8 } },
    ],
  },
  {
    title: 'Körper',
    items: [
      {
        def: {
          id: 'sport', name: 'Sport', kind: 'multi',
          options: ['Kraft', 'Cardio', 'Mobility', 'Ballsport', 'Draußen', 'Nix'],
          noneOption: 'Nix',
        },
        note: 'Optionen frei erweiterbar',
      },
      { def: { id: 'tense', name: 'Verspannt', kind: 'scale', target: 10, inverse: true } },
      { def: { id: 'creatine', name: 'Kreatin', kind: 'bool' } },
      { def: { id: 'minoxidil', name: 'Minoxidil', kind: 'bool' } },
      { def: { id: 'skincare', name: 'Skincare', kind: 'bool' } },
      // Liest den oeffentlichen Tagesschnitt aus dem Kalorienbrudi-Bestand.
      // Das ist genau ein fremder Datenstand, nicht der eigene — deshalb
      // steht das auch auf der Karte im Regal.
      {
        def: { id: 'brudi_kcal', name: 'Essen', kind: 'external', source: 'brudi', unit: 'kcal' },
        note: 'Kalorien und Makros aus dem Kalorienbrudi-Bestand',
      },

    ],
  },
  {
    // Kommt nur an, wenn der Ring im Konto verbunden ist. Ohne Verbindung
    // stehen die Karten da und sagen, dass fuer den Tag nichts erfasst ist —
    // deshalb steht es auf jeder Karte im Regal dabei.
    title: 'Ring',
    items: [
      {
        def: { id: 'oura_sleep_score', name: 'Schlaf-Score', kind: 'external', source: 'oura', target: 80 },
        note: 'vom Oura-Ring',
      },
      {
        def: { id: 'oura_readiness', name: 'Tagesform', kind: 'external', source: 'oura', target: 80 },
        note: 'vom Oura-Ring',
      },
      {
        def: { id: 'oura_steps', name: 'Schritte', kind: 'external', source: 'oura', target: 8000 },
        note: 'vom Oura-Ring',
      },
    ],
  },
  {
    title: 'Kopf',
    items: [
      { def: { id: 'mood', name: 'Happiness', kind: 'scale', target: 8 } },
      { def: { id: 'focus', name: 'Fokus', kind: 'scale', target: 8 } },
      { def: { id: 'energy', name: 'Energie', kind: 'scale' } },
      { def: { id: 'meditate', name: 'Meditation', kind: 'bool' } },
    ],
  },
  {
    title: 'Erholung & Menschen',
    items: [
      { def: { id: 'people', name: 'Unter Menschen', kind: 'bool' } },
      { def: { id: 'sauna', name: 'Sauna', kind: 'bool' } },
      { def: { id: 'im8', name: 'Im8', kind: 'bool' } },
    ],
  },
  {
    title: 'Weniger ist besser',
    items: [
      { def: { id: 'scroll', name: 'Doomscrolling', kind: 'scale', target: 4, inverse: true } },
      { def: { id: 'coffee', name: 'Kaffee', kind: 'number', unit: 'Tassen', step: 1, target: 3, inverse: true } },
      {
        def: { id: 'booze', name: 'Alkohol', kind: 'number', unit: 'Gläser', step: 1, target: 0, inverse: true, fallback: 0 },
        note: 'kein Glas ist der Normalfall, deshalb startet es bei 0',
      },
    ],
  },
]

export const CATALOG_CHECKS: CheckTemplate[] = CHECK_CATALOG.flatMap((g) => g.items)

/** Wie weit die Skala geht. War mal 5 — zehn Stufen treffen genauer, weil
    zwischen "ok" und "gut" bei fuenf Stufen nichts mehr passt. */
export const SCALE_MAX = 10

const SCALE_LABELS = ['mies', 'schwach', 'geht so', 'ok', 'ganz ok', 'solide', 'gut', 'stark', 'top', 'bestes']

/** Das Wort zu einer Stufe. Steht als `title` an der Taste. */
export const scaleLabel = (n: number): string => SCALE_LABELS[n - 1] ?? String(n)

/** Checks, die es mal gab und jetzt nicht mehr. Erfasste Tage bleiben erhalten,
    der Check wandert nur ins Archiv statt geloescht zu werden. */
export const RETIRED_CHECK_IDS = ['mobility', 'food', 'muscles']
