/* Domain-Modell von OTAAT. Drei Bereiche, ein gemeinsamer Goal-Graph. */

export type ID = string

/* ---------- Everything Checker ---------- */

export type CheckKind = 'bool' | 'scale' | 'number' | 'choice' | 'multi' | 'text' | 'external'

export interface CheckDef {
  id: ID
  name: string
  kind: CheckKind
  /** kurzer Einheiten-Hinweis, z.B. "h", "Tassen" — bewusst nur wo noetig */
  unit?: string
  /** fuer kind === 'choice' und 'multi' */
  options?: string[]
  /** Option, die alle anderen ausschliesst — z.B. "Nix" bei Sport */
  noneOption?: string
  /** Startwert fuer einen frischen Tag, wenn es noch keinen Vortag gibt */
  fallback?: CheckValue
  /** Woher die Werte kommen, wenn kind === 'external'. Nicht editierbar. */
  source?: 'brudi' | 'oura'
  /** Schrittweite fuer kind === 'number' */
  step?: number
  /** Ab diesem Wert zaehlt der Tag als "erfuellt" (number/scale). Bei bool: true. */
  target?: number
  /** Niedriger ist besser (z.B. Social Media, Alkohol) */
  inverse?: boolean
  /**
   * Zusaetzlich zur Zahl eine Uhrzeit. Sie liegt unter einem eigenen
   * Schluessel im selben Tag (`timeKey`), nicht im Wert des Checks — ein
   * Check hat einen Wert, und aus 7,5 Stunden und 23:15 waere sonst ein
   * Gebilde geworden, mit dem Statistik und Abgleich nichts anfangen.
   */
  withTime?: boolean
  /** Board-Nodes, auf die dieser Check einzahlt */
  goals?: ID[]
  archived?: boolean
  sort: number
}

export type CheckValue = boolean | number | string | string[] | null

export interface DayEntry {
  date: string            // YYYY-MM-DD
  values: Record<ID, CheckValue>
  note?: string
  /**
   * Erst ein bestaetigter Tag zaehlt. Vorher stehen die Werte zwar im Feld
   * — uebernommen vom letzten Mal —, sind aber nur ein Vorschlag und gehen
   * nicht in Serie, Statistik oder Zusammenhaenge ein.
   */
  confirmed?: boolean
  /**
   * Checks, die ihre Uebernahme vom Vortag an diesem Tag schon bekommen
   * haben. Ohne das Gedaechtnis waere ein geloeschter Wert im naechsten
   * Wimpernschlag wieder da — die Uebernahme kann nicht unterscheiden, ob
   * ein Feld noch nie gefuellt war oder gerade absichtlich geleert wurde.
   * Eine erst heute angelegte Rubrik steht noch nicht drin und holt sich
   * ihre Uebernahme deshalb nach.
   */
  carried?: ID[]
}

/* ---------- Future Me Problems ---------- */

export type Cadence =
  | { type: 'once'; on: string }
  | { type: 'every'; n: number; unit: 'day' | 'week' | 'month' | 'year' }

export interface Reminder {
  id: ID
  title: string
  category: string
  cadence: Cadence
  /** naechste Faelligkeit, YYYY-MM-DD */
  due: string
  /** Vorlauf in Tagen, ab wann es im Radar auftaucht */
  lead: number
  notes?: string
  lastDone?: string
  done?: boolean          // nur relevant fuer cadence.type === 'once'
  createdAt: string
  /** Herkunft aus dem Katalog, verhindert Doppel-Import */
  presetId?: string
}

/* ---------- Mind my Business ---------- */

export type NodeColor = 'slate' | 'cobalt' | 'signal' | 'moss' | 'plum' | 'amber'

/** Ein Board ist eine eigene Flaeche. Knoten, Bereiche und Linien gehoeren
    immer zu genau einem. */
export interface Board {
  id: ID
  name: string
  createdAt: string
}

export interface BoardNode {
  id: ID
  board: ID
  x: number
  y: number
  w: number
  text: string
  color: NodeColor
  /** als Ziel markiert — dann koennen Checks darauf einzahlen */
  isGoal?: boolean
}

export interface BoardFrame {
  id: ID
  board: ID
  x: number
  y: number
  w: number
  h: number
  label: string
  color: NodeColor
}

export interface BoardEdge {
  id: ID
  board: ID
  from: ID
  to: ID
}

/* ---------- Gesamtzustand ---------- */

/** 'system' folgt der Einstellung des Betriebssystems. */
export type Theme = 'light' | 'dark' | 'system'

export interface AppState {
  checks: CheckDef[]
  days: Record<string, DayEntry>
  reminders: Reminder[]
  nodes: BoardNode[]
  frames: BoardFrame[]
  edges: BoardEdge[]
  meta: {
    theme: Theme
    dismissedPresets: string[]
    v?: number
    /** Die Boards liegen in meta, nicht in einer eigenen Tabelle: es sind
        wenige, winzige Eintraege, und meta wird ohnehin mitsynchronisiert. */
    boards: Board[]
    activeBoard: ID
    /**
     * Wer man im Kalorienbrudi-Bestand ist. Dort liegen zwei Konten; ohne
     * die Angabe weiss die Essens-Rubrik nicht, wessen Zahlen sie holen soll.
     *
     * Steht in `meta` und nicht im Konto, weil es die App betrifft und nicht
     * die Anmeldung: es entscheidet, welche Werte in die Tage geschrieben
     * werden. Und es soll auf allen Geraeten dasselbe sein.
     */
    brudiPerson?: string
  }
}
