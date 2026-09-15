/* Domain-Modell von OTAAT. Drei Bereiche, ein gemeinsamer Goal-Graph. */

export type ID = string

/* ---------- Everything Checker ---------- */

export type CheckKind = 'bool' | 'scale' | 'number' | 'choice' | 'multi' | 'text'

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
  /** Schrittweite fuer kind === 'number' */
  step?: number
  /** Ab diesem Wert zaehlt der Tag als "erfuellt" (number/scale). Bei bool: true. */
  target?: number
  /** Niedriger ist besser (z.B. Social Media, Alkohol) */
  inverse?: boolean
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
  /** Checks, fuer die an diesem Tag schon XP vergeben wurde — verhindert Farmen durch An/Aus. */
  awarded?: ID[]
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

export interface BoardNode {
  id: ID
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
  x: number
  y: number
  w: number
  h: number
  label: string
  color: NodeColor
}

export interface BoardEdge {
  id: ID
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
  meta: { xp: number; theme: Theme; dismissedPresets: string[]; v?: number }
}
