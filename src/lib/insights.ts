import type { AppState, CheckDef, CheckValue } from './types'
import { addDays, checkerToday } from './dates'
import { HIDDEN_MEASURES } from '../data/measured'
import { activeChecks, countedValues, endKey, scoreDay, timeKey } from './scoring'

/* Zusammenhaenge zwischen den Checks.
   -----------------------------------------------------------------------
   Gerechnet wird jedes Merkmal gegen jedes andere, und zwar in drei Formen:

     1. am selben Tag
     2. versetzt: heute das eine, in 1, 2, 3 oder 7 Tagen das andere
     3. als Last: der Schnitt der letzten 3 bzw. 7 Tage gegen den Tag danach

   Grundlage ist die Rangkorrelation nach Spearman. Rang statt Rohwert, weil
   die Skalen hier ordinal sind (1..5) und ein einzelner Ausreisser sonst die
   ganze Zahl traegt. Sie misst jeden monotonen Zusammenhang, nicht nur den
   geraden.

   Zwei Fallen, die bei sowas regelmaessig zu Unsinn fuehren, sind ausgeraeumt:

   Eigenlauf. Die Laune von heute haengt an der Laune von gestern. Wer nur
   "Sport gestern gegen Laune heute" rechnet, findet deshalb Zusammenhaenge,
   die in Wahrheit die Laune mit sich selbst hat. Bei allen versetzten Tests
   wird der Vortag des Ergebnisses deshalb herausgerechnet (Partialkorrelation).
   Uebrig bleibt, was das andere Merkmal darueber hinaus erklaert.

   Mehrfachvergleiche. Bei knapp zwei Tausend Tests waeren bei p < 0.05 gut
   hundert Zufallstreffer zu erwarten. Alle p-Werte laufen deshalb durch die
   Benjamini-Yekutieli-Korrektur; nur was danach unter der Falscherkennungsrate
   bleibt, gilt als gesichert. Der Rest steht getrennt darunter als Hinweis.

   Mit reinem Zufall gefuettert (zwoelf Rubriken, sechzig Tage) meldet die
   Suche in rund drei von hundert Durchlaeufen ueberhaupt etwas Gesichertes
   und in vier von hundert einen Hinweis. Ein eingebauter Effekt ueber zwei
   Tage oder eine Wochenlast wird dagegen zuverlaessig gefunden.

   Und, immer: das sind Zusammenhaenge, keine Ursachen. */

/** Ab so vielen bestaetigten Tagen laeuft die Analyse. */
export const MIN_DAYS = 21
/** So viele Tage muessen fuer ein Paar gemeinsam Werte haben. */
const MIN_PAIRS = 14
/** Unter dieser Staerke ist ein Zusammenhang zwar echt, aber belanglos. */
const MIN_R = 0.35
/** Was nach der Korrektur weiter als das entfernt liegt, ist kein Hinweis
    mehr, sondern Rauschen — und wird gar nicht erst zurueckgegeben. */
const HINT_Q = 0.5
/** Falscherkennungsrate: unter den gesicherten Treffern ist im Schnitt jeder
    zehnte Zufall. Fuer eine Suche ohne Vorannahme die uebliche Groesse. */
const FDR = 0.1
/** Ohne Korrektur muss ein Treffer mindestens das hier reissen, sonst ist er
    nicht mal einen Hinweis wert. */
const RAW_P = 0.01
/** So viele Tage schaut die Analyse zurueck. */
const WINDOW = 180
/** Versatz in Tagen zwischen Ursache und Wirkung. */
const LAGS = [1, 2, 3, 7] as const
/** Fenster fuer die Last der Tage davor. */
const LOADS = [3, 7] as const

/** Wie die beiden Merkmale zeitlich zueinander stehen. */
export type Shift =
  | { kind: 'same' }
  | { kind: 'lag'; days: number }
  | { kind: 'load'; days: number }

/**
 * Ein Merkmal ist das, was in die Rechnung geht. Meist ist das ein Check.
 * Eine Mehrfachauswahl liefert zusaetzlich jede Option einzeln — sonst liesse
 * sich "nach Krafttraining verspannt" nie von "nach Cardio verspannt"
 * unterscheiden.
 */
export interface Feature {
  id: string
  check: CheckDef
  name: string
  values: (number | null)[]
  /**
   * Ein gemessener Wert ohne eigene Rubrik — die Mikronaehrwerte und die
   * Einordnungen aus dem Essens-Bestand. Sie werden gegen alles Eigene
   * gerechnet, aber nicht gegeneinander: dass Magnesium mit Kalium laeuft,
   * ist wahr, uninteressant und kostet nur Korrektur-Budget.
   */
  hidden?: boolean
}

export interface Insight {
  a: Feature
  b: Feature
  /** Rangkorrelation; bei versetzten Tests um den Vortag bereinigt */
  r: number
  n: number
  shift: Shift
  /** zweiseitiger p-Wert */
  p: number
  /** p nach Benjamini-Yekutieli */
  q: number
  /** haelt der Korrektur fuer Mehrfachvergleiche stand */
  solid: boolean
}

/** Uebersetzt einen Check-Wert in eine Zahl, mit der sich rechnen laesst. */
export function numeric(def: CheckDef, v: CheckValue | undefined): number | null {
  if (v === undefined || v === null || v === '') return null
  switch (def.kind) {
    case 'bool':
      return v === true ? 1 : 0
    case 'scale':
    case 'number':
    case 'external':
      return typeof v === 'number' ? v : null
    case 'multi': {
      // "hat ueberhaupt was gemacht" — verstaendlicher als die Anzahl der Haken
      if (!Array.isArray(v)) return null
      const real = v.filter((o) => o !== def.noneOption)
      return real.length > 0 ? 1 : 0
    }
    case 'choice':
    case 'text':
      return null
  }
}

/**
 * Eine Uhrzeit als Zahl, mit der sich rechnen laesst.
 *
 * Ab Mittag gezaehlt, nicht ab Mitternacht: sonst laege 01:30 (spaet ins
 * Bett) bei 90 und 23:15 bei 1395, und die Reihenfolge waere genau
 * verkehrt. So ist spaeter immer groesser — 23:15 wird 675, 01:30 wird 810.
 */
export function clockMinutes(v: CheckValue | undefined): number | null {
  const mins = rawMinutes(v)
  return mins === null ? null : (mins < 720 ? mins + 720 : mins - 720)
}

/**
 * Minuten ab Mitternacht, ohne Verschiebung.
 *
 * Fuer Zeiten, die den Tag **nicht** ueberschreiten — das Aufstehen. Die
 * Mittags-Verschiebung von `clockMinutes` waere hier falsch herum: sie
 * sortierte 13:00 vor 05:00, weil sie fuer Zeiten gemacht ist, die ueber
 * Mitternacht gehen.
 */
export function dayMinutes(v: CheckValue | undefined): number | null {
  return rawMinutes(v)
}

function rawMinutes(v: CheckValue | undefined): number | null {
  if (typeof v !== 'string') return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/** Nur Checks, mit denen sich rechnen laesst. */
const measurable = (s: AppState) =>
  activeChecks(s).filter((c) => c.kind !== 'text' && c.kind !== 'choice')

/* ------------------------------------------------------------------ */
/* Statistik                                                           */
/* ------------------------------------------------------------------ */

/** Raenge mit Mittelrang bei Bindungen — sonst waere Spearman bei Ja/Nein schief. */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(xs.length)
  let i = 0
  while (i < idx.length) {
    let j = i
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
    const mid = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) out[idx[k][1]] = mid
    i = j + 1
  }
  return out
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  // Ein Merkmal ohne jede Schwankung hat keine Korrelation, sondern keine Varianz.
  if (sxx === 0 || syy === 0) return null
  return sxy / Math.sqrt(sxx * syy)
}

const lgamma = (x: number): number => {
  // Lanczos, reicht fuer die Genauigkeit, die ein p-Wert hier braucht
  const g = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ]
  let y = x
  let tmp = x + 5.5
  tmp -= (x + 0.5) * Math.log(tmp)
  let ser = 1.000000000190015
  for (let j = 0; j < 6; j++) ser += g[j] / ++y
  return -tmp + Math.log((2.5066282746310005 * ser) / x)
}

/** Kettenbruch fuer die unvollstaendige Betafunktion (Lentz). */
function betacf(a: number, b: number, x: number): number {
  const TINY = 1e-30
  const qab = a + b
  const qap = a + 1
  const qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + aa / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < 3e-12) break
  }
  return h
}

function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b
}

/** Zweiseitiger p-Wert einer t-Statistik. */
function studentP(t: number, df: number): number {
  if (!Number.isFinite(t) || df <= 0) return 1
  return betai(df / 2, 0.5, df / (df + t * t))
}

/** Autokorrelation einer Reihe bei Versatz k. */
function acf(xs: number[], k: number): number {
  const n = xs.length
  if (k >= n - 2) return 0
  return pearson(xs.slice(0, n - k), xs.slice(k)) ?? 0
}

/**
 * Wirksame Stichprobengroesse nach Bartlett/Quenouille.
 *
 * Zwei Reihen, die je fuer sich traege sind — die Laune von heute aehnelt der
 * von gestern —, sehen leicht nach einem Zusammenhang aus. Aufeinanderfolgende
 * Tage sind eben keine unabhaengigen Beobachtungen, und der t-Test unterstellt
 * genau das. Wer das laesst, bekommt aus zwei Zufallsreihen regelmaessig
 * "signifikante" Treffer. Hier zaehlt deshalb nicht die Zahl der Tage, sondern
 * was davon an unabhaengiger Information uebrig bleibt.
 */
function effectiveN(xs: number[], ys: number[]): number {
  const n = xs.length
  const top = Math.min(5, Math.floor(n / 4))
  let s = 0
  for (let k = 1; k <= top; k++) s += acf(xs, k) * acf(ys, k)
  const eff = n / (1 + 2 * s)
  if (!Number.isFinite(eff)) return n
  return Math.max(4, Math.min(n, eff))
}

/** Korrelation von x und y, nachdem z aus beiden herausgerechnet wurde. */
function partial(rxy: number, rxz: number, ryz: number): number | null {
  const den = Math.sqrt((1 - rxz * rxz) * (1 - ryz * ryz))
  if (!Number.isFinite(den) || den < 1e-9) return null
  const r = (rxy - rxz * ryz) / den
  return Number.isFinite(r) ? Math.max(-1, Math.min(1, r)) : null
}

/* ------------------------------------------------------------------ */
/* Merkmale                                                            */
/* ------------------------------------------------------------------ */

/** Anzahl der Tage, die ueberhaupt erfasst sind — Basis fuer MIN_DAYS. */
export function loggedDays(s: AppState, window = WINDOW): number {
  let n = 0
  for (let i = 0; i < window; i++) if (scoreDay(s, addDays(checkerToday(), -i)).logged) n++
  return n
}

function features(s: AppState, dates: string[]): Feature[] {
  const out: Feature[] = []
  const values = dates.map((d) => countedValues(s, d))

  for (const def of measurable(s)) {
    out.push({
      id: def.id,
      check: def,
      name: def.name,
      values: values.map((v) => numeric(def, v[def.id])),
    })

    // Die Uhrzeiten neben dem Wert sind eigene Groessen. Gross heisst spaet.
    if (def.withTime) {
      // Die Bettzeit geht ueber Mitternacht, das Aufstehen nicht — zwei
      // verschiedene Umrechnungen, sonst laege 01:30 vor 23:15 oder 13:00
      // vor 05:00.
      for (const [key, name, zu] of [
        [timeKey(def.id), 'Bettzeit', clockMinutes],
        [endKey(def.id), 'Aufstehzeit', dayMinutes],
      ] as const) {
        out.push({
          id: key, check: def, name,
          values: values.map((v) => zu(v[key])),
        })
      }
    }

    // Jede Option einer Mehrfachauswahl auch fuer sich: "Kraft" und "Cardio"
    // wirken nicht gleich, und genau das ist die interessante Frage.
    if (def.kind !== 'multi') continue
    for (const opt of def.options ?? []) {
      if (opt === def.noneOption) continue
      const col = values.map((v) => {
        const raw = v[def.id]
        if (!Array.isArray(raw)) return null
        return raw.includes(opt) ? 1 : 0
      })
      out.push({ id: `${def.id}:${opt}`, check: def, name: `${def.name}: ${opt}`, values: col })
    }
  }

  // Die gemessenen Werte ohne Karte. Jeder bekommt einen eigenen Traeger,
  // damit die Paar-Regel weiter ueber `check.id` laeuft.
  for (const f of HIDDEN_MEASURES) {
    const def: CheckDef = { id: f.key, name: f.name, kind: 'external', unit: f.unit, sort: 0 }
    out.push({
      id: f.key,
      check: def,
      name: f.name,
      values: values.map((v) => (typeof v[f.key] === 'number' ? (v[f.key] as number) : null)),
      hidden: true,
    })
  }

  // Was nie schwankt, kann mit nichts zusammenhaengen.
  return out.filter((f) => {
    const seen = f.values.filter((v): v is number => v !== null)
    if (seen.length < MIN_PAIRS) return false
    return seen.some((v) => v !== seen[0])
  })
}

/** Schnitt der `w` Tage vor `i`. null, wenn zu wenig davon erfasst ist. */
function load(values: (number | null)[], i: number, w: number): number | null {
  let sum = 0
  let n = 0
  for (let k = i - w; k < i; k++) {
    if (k < 0) continue
    const v = values[k]
    if (v !== null) { sum += v; n++ }
  }
  return n >= Math.ceil(w / 2) ? sum / n : null
}

/* ------------------------------------------------------------------ */
/* Suche                                                               */
/* ------------------------------------------------------------------ */

type Raw = Omit<Insight, 'q' | 'solid'>

/**
 * Ein paar Tausend Tests kosten auf dem Handy ein Viertel einer Sekunde. Der
 * Checker und das Detail einer Rubrik fragen beide, und der State wird bei
 * jedem Tastendruck neu geklont — deshalb ein Gedaechtnis. Der Schluessel ist
 * die Merkmalsmatrix selbst: alles, was in die Rechnung eingeht, und sonst
 * nichts. Ein noch nicht bestaetigter Tag aendert sie nicht.
 */
let cache: { sig: string; out: Insight[] } | null = null

export function findInsights(s: AppState, window = WINDOW): Insight[] {
  const dates: string[] = []
  for (let i = window - 1; i >= 0; i--) dates.push(addDays(checkerToday(), -i))

  const feats = features(s, dates)
  const sig = feats.map((f) => `${f.id}=${f.values.join(',')}`).join('|')
  if (cache && cache.sig === sig) return cache.out
  const out = search(feats, dates.length)
  cache = { sig, out }
  return out
}

function search(feats: Feature[], span: number): Insight[] {
  const found: Raw[] = []
  /** Jeder durchgefuehrte Test zaehlt fuer die Korrektur, auch der langweilige. */
  let tests = 0

  /**
   * `xs` gegen `ys`, wahlweise bereinigt um `zs` (den Vortag des Ergebnisses).
   * Gerechnet wird auf Raengen, also Spearman.
   */
  const run = (a: Feature, b: Feature, shift: Shift, xs: number[], ys: number[], zs: number[] | null) => {
    if (xs.length < MIN_PAIRS) return
    tests++
    const rx = ranks(xs)
    const ry = ranks(ys)
    const eff = effectiveN(rx, ry)
    let r: number | null
    let df: number
    if (zs) {
      const rz = ranks(zs)
      const rxy = pearson(rx, ry)
      const rxz = pearson(rx, rz)
      const ryz = pearson(ry, rz)
      if (rxy === null || rxz === null || ryz === null) return
      r = partial(rxy, rxz, ryz)
      df = eff - 3
    } else {
      r = pearson(rx, ry)
      df = eff - 2
    }
    if (r === null || df < 1) return
    const t = Math.abs(r) * Math.sqrt(df / Math.max(1e-12, 1 - r * r))
    const p = studentP(t, df)
    if (Math.abs(r) < MIN_R || p > RAW_P) return
    found.push({ a, b, r, n: xs.length, shift, p })
  }

  /** Paare am selben Tag — die Richtung spielt hier keine Rolle. */
  for (let i = 0; i < feats.length; i++) {
    for (let j = i + 1; j < feats.length; j++) {
      const a = feats[i]
      const b = feats[j]
      // Die Optionen einer Mehrfachauswahl gegen ihren eigenen Check zu
      // rechnen ergaebe nur, dass Kraft ein Teil von Sport ist.
      if (a.check.id === b.check.id) continue
      if (a.hidden && b.hidden) continue
      const xs: number[] = []
      const ys: number[] = []
      for (let k = 0; k < span; k++) {
        const x = a.values[k]
        const y = b.values[k]
        if (x === null || y === null) continue
        xs.push(x)
        ys.push(y)
      }
      run(a, b, { kind: 'same' }, xs, ys, null)
    }
  }

  /** Versetzt und als Last — beides gerichtet, also jedes Paar in beide Wege. */
  for (const a of feats) {
    for (const b of feats) {
      if (a.id === b.id || a.check.id === b.check.id) continue
      if (a.hidden && b.hidden) continue

      for (const lag of LAGS) {
        const xs: number[] = []
        const ys: number[] = []
        const zs: number[] = []
        for (let k = 0; k + lag < span; k++) {
          const x = a.values[k]
          const y = b.values[k + lag]
          const z = b.values[k + lag - 1]
          if (x === null || y === null || z === null) continue
          xs.push(x)
          ys.push(y)
          zs.push(z)
        }
        run(a, b, { kind: 'lag', days: lag }, xs, ys, zs)
      }

      for (const w of LOADS) {
        const xs: number[] = []
        const ys: number[] = []
        const zs: number[] = []
        for (let k = 1; k < span; k++) {
          const x = load(a.values, k, w)
          const y = b.values[k]
          const z = b.values[k - 1]
          if (x === null || y === null || z === null) continue
          xs.push(x)
          ys.push(y)
          zs.push(z)
        }
        run(a, b, { kind: 'load', days: w }, xs, ys, zs)
      }
    }
  }

  return correct(found, tests)
}

/**
 * Benjamini-Yekutieli. Die p-Werte werden aufsteigend sortiert und mit
 * `m / Rang` hochgerechnet; das laufende Minimum von hinten haelt die Reihe
 * monoton. Was danach unter der Falscherkennungsrate liegt, gilt als gesichert.
 *
 * Yekutieli statt des einfacheren Benjamini-Hochberg wegen des Faktors `c`:
 * die Tests hier sind alles andere als unabhaengig — dieselben Merkmale
 * tauchen in jedem Versatz wieder auf, und die Fenster ueberlappen sich. Nur
 * mit dem Zuschlag haelt die Schranke auch dann.
 */
function correct(found: Raw[], tests: number): Insight[] {
  const m = Math.max(tests, found.length, 1)
  let c = 0
  for (let i = 1; i <= m; i++) c += 1 / i
  const sorted = [...found].sort((x, y) => x.p - y.p)
  const out: Insight[] = []
  let running = 1
  for (let i = sorted.length - 1; i >= 0; i--) {
    running = Math.min(running, (sorted[i].p * m * c) / (i + 1))
    out[i] = { ...sorted[i], q: running, solid: running <= FDR }
  }
  // Gesichertes zuerst, darin das Staerkste oben. Was weit jenseits der
  // Schranke liegt, faellt ganz raus — sonst stuenden bei jedem Durchlauf ein
  // paar Zufallspaare als "Hinweis" da.
  return out
    .filter((i) => i.q <= HINT_Q)
    .sort((x, y) => (x.solid === y.solid ? Math.abs(y.r) - Math.abs(x.r) : x.solid ? -1 : 1))
}

/* ------------------------------------------------------------------ */
/* Sprache                                                             */
/* ------------------------------------------------------------------ */

export function strengthLabel(r: number): string {
  const a = Math.abs(r)
  if (a >= 0.7) return 'sehr deutlich'
  if (a >= 0.55) return 'deutlich'
  return 'erkennbar'
}

/** "am selben Tag", "am nächsten Tag", "3 Tage später" */
export function whenLabel(shift: Shift): string {
  if (shift.kind === 'same') return 'am selben Tag'
  if (shift.kind === 'lag') return shift.days === 1 ? 'am nächsten Tag' : `${shift.days} Tage später`
  return spanLabel(shift.days)
}

/** "einer Woche", "3 Tagen" — fuer die Last der Tage davor. */
export const spanLabel = (days: number): string => (days === 7 ? 'einer Woche' : `${days} Tagen`)
