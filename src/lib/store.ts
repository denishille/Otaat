import { useSyncExternalStore } from 'react'
import type { AppState, Board, BoardEdge, BoardFrame, BoardNode, CheckDef, DayEntry, Reminder, Theme } from './types'
import { CATALOG_CHECKS, RETIRED_CHECK_IDS } from '../data/checks'
import { supabase, cloudEnabled } from './supabase'
import { SUPABASE_URL, T } from '../data/otaat-source'

const LS_KEY = 'otaat.state.v1'

/** Hochzaehlen, wenn `migrate` einen neuen Schritt bekommt. */
const STATE_VERSION = 11

export const FIRST_BOARD: Board = { id: 'board-1', name: 'Mein Board', createdAt: '' }

export const emptyState = (): AppState => ({
  // Eine frische App hat keine Rubriken. Man sucht sich im Regal aus, was man
  // wissen will — zwoelf fremde Vorgaben waren vor allem Arbeit beim Ausmisten.
  checks: [],
  days: {},
  reminders: [],
  nodes: [],
  frames: [],
  edges: [],
  meta: { theme: 'system', dismissedPresets: [], v: STATE_VERSION, boards: [{ ...FIRST_BOARD }], activeBoard: FIRST_BOARD.id },
})

export type SyncStatus = 'local' | 'signed-out' | 'syncing' | 'synced' | 'error'

let state: AppState = emptyState()
let status: SyncStatus = cloudEnabled ? 'signed-out' : 'local'
let userId: string | null = null
let email: string | null = null
/** Name, unter dem andere einen finden. Steht in `otaat_profiles`, nicht im
    State — das ist Konto, nicht App. */
let username: string | null = null
let lastError: string | null = null

export interface Snapshot {
  state: AppState
  status: SyncStatus
  userId: string | null
  email: string | null
  username: string | null
  lastError: string | null
}

const listeners = new Set<() => void>()
let snapshot: Snapshot = { state, status, userId, email, username, lastError }

function emit() {
  snapshot = { state, status, userId, email, username, lastError }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => void listeners.delete(l)
}

export const getSnapshot = (): Snapshot => snapshot

export function useStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/* ------------------------------------------------------------------ */
/* Mutation                                                            */
/* ------------------------------------------------------------------ */

let pushTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Einziger Schreibweg in den State. Persistiert lokal sofort, remote gedrosselt.
 * `transient` fuer Zwischenschritte (z.B. jeder Frame beim Ziehen auf dem Board):
 * die UI aktualisiert sich, aber es wird nicht bei jedem Pixel gespeichert.
 * Ein spaeterer nicht-transienter Aufruf — oder `commit()` — schreibt dann durch.
 */
export function update(fn: (draft: AppState) => void, opts?: { transient?: boolean }) {
  const next: AppState = structuredClone(state)
  fn(next)
  state = next
  emit()
  if (opts?.transient) {
    dirty = true
    return
  }
  persist()
}

let dirty = false

function persist() {
  dirty = false
  saveLocal()
  if (status === 'synced' || status === 'syncing' || status === 'error') schedulePush()
}

/** Schreibt einen per `transient` aufgeschobenen Stand fest. */
export function commit() {
  if (dirty) persist()
}

function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state))
  } catch {
    /* Speicher voll oder privater Modus — der In-Memory-State laeuft weiter. */
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<AppState>
    const base = emptyState()
    const merged = { ...base, ...parsed, meta: { ...base.meta, ...parsed.meta } }
    if (!merged.checks) merged.checks = []
    if (!merged.meta.boards?.length) {
      merged.meta.boards = base.meta.boards
      merged.meta.activeBoard = base.meta.activeBoard
    }
    state = migrate(merged)
    applyTheme(state.meta.theme)
    saveLocal()
    emit()
  } catch {
    /* kaputter Eintrag — wir starten sauber statt zu crashen */
  }
}

/**
 * Bringt einen gespeicherten Stand auf die aktuelle Check-Aufstellung.
 * Erfasste Tage bleiben dabei erhalten: abgeschaffte Checks wandern ins
 * Archiv statt geloescht zu werden, und Werte, deren Form sich geaendert hat,
 * werden umgeschrieben statt verworfen.
 */
export function migrate(s: AppState): AppState {
  if ((s.meta.v ?? 1) >= STATE_VERSION) return s

  const byId = new Map(s.checks.map((c) => [c.id, c]))

  // Alles, was bisher auf dem einen Board lag, bekommt dessen Kennung.
  if (!s.meta.boards?.length) {
    s.meta.boards = [{ ...FIRST_BOARD }]
    s.meta.activeBoard = FIRST_BOARD.id
  }
  const first = s.meta.boards[0].id
  for (const n of s.nodes) n.board ??= first
  for (const f of s.frames) f.board ??= first
  for (const e of s.edges) e.board ??= first
  if (!s.meta.boards.some((b) => b.id === s.meta.activeBoard)) s.meta.activeBoard = first

  // XP und Level sind raus. Die alten Felder bleiben nicht als Leichen liegen.
  delete (s.meta as { xp?: number }).xp
  for (const day of Object.values(s.days)) {
    delete (day as { paid?: boolean }).paid
    delete (day as { awarded?: string[] }).awarded
  }

  // Tage aus der Zeit vor dem Bestaetigen-Knopf (bis Fassung 5): was damals
  // eingetragen wurde, galt als erfasst und bleibt es.
  //
  // **Nur bis Fassung 5.** Ungebremst war das ein Selbstlaeufer: ein Tag, den
  // man auftut und nicht abschickt, traegt gar kein `confirmed` — und dann
  // liess sich ein absichtlich offener Tag nicht mehr von einem alten
  // unterscheiden. Der naechste Start hat ihn festgeschrieben, ohne dass je
  // jemand den Knopf gedrueckt hatte.
  if ((s.meta.v ?? 1) < 6) {
    const externalIds = new Set(CATALOG_CHECKS.filter((c) => c.def.kind === 'external').map((c) => c.def.id))
    for (const day of Object.values(s.days)) {
      if (day.confirmed === undefined) {
        day.confirmed = Object.entries(day.values).some(
          ([id, v]) => !externalIds.has(id) && v !== undefined && v !== null && v !== '',
        )
      }
    }
  }

  for (const day of Object.values(s.days)) {
    // Sport war eine Einfachauswahl und ist jetzt eine Mehrfachauswahl;
    // Mobility war ein eigener Check und ist jetzt eine Option darin.
    const sport = day.values['sport']
    const picked: string[] = Array.isArray(sport) ? [...sport] : typeof sport === 'string' ? [sport] : []
    if (day.values['mobility'] === true && !picked.includes('Mobility')) picked.push('Mobility')
    if (picked.length) day.values['sport'] = picked
    delete day.values['mobility']
    delete day.values['food']

    // Doomscrolling waren Stunden und ist jetzt eine Skala. Die alten Werte
    // liegen in derselben Groessenordnung, gerundet und auf 1..5 begrenzt
    // bleiben sie brauchbar, statt sie wegzuwerfen.
    const scroll = day.values['scroll']
    if (typeof scroll === 'number') day.values['scroll'] = Math.max(1, Math.min(5, Math.round(scroll) || 1))
  }

  // Strukturschritte, die frueher im pauschalen Ueberschreiben mitliefen.
  // Sie gehoeren zu genau einer Fassung, nicht zu jedem Start: Sport war eine
  // Einfachauswahl, Doomscrolling eine Stundenzahl.
  if ((s.meta.v ?? 1) < 7) {
    for (const id of ['sport', 'scroll']) {
      const old = byId.get(id)
      const def = CATALOG_CHECKS.find((d) => d.def.id === id)?.def
      if (!old || !def) continue
      old.kind = def.kind
      old.options = def.options ? [...def.options] : undefined
      old.noneOption = def.noneOption
      old.unit = def.unit
      old.step = def.step
      old.target = def.target
      old.inverse = def.inverse
    }
  }

  // Nur der eigene Stand. Bis Schritt 9 hat die Migration hier die Vorgabe
  // hineingemischt — wer eine Rubrik geloescht hatte, bekam sie beim naechsten
  // Versionssprung zurueck, und seit Schritt 10 gibt es ueberhaupt keine
  // Vorgabe mehr. Das Regal ist eine Auswahl, keine Startaufstellung.
  const next = s.checks.map((c) => ({ ...c }))

  // Ein Feld, das es in der gespeicherten Fassung noch gar nicht gab:
  // Alkohol faengt jetzt bei 0 an statt im Leeren. Solche Nachtraege gehoeren
  // an genau eine Fassung, nicht in ein pauschales Ueberschreiben.
  if ((s.meta.v ?? 1) < 10) {
    const booze = next.find((c) => c.id === 'booze')
    if (booze && booze.fallback === undefined) booze.fallback = 0
  }

  // Aus "Laune" wird "Happiness". Nur, wenn der alte Name noch unveraendert
  // dasteht — wer die Rubrik selbst umbenannt hat, behaelt seinen Namen.
  if ((s.meta.v ?? 1) < 11) {
    const mood = next.find((c) => c.id === 'mood')
    if (mood && mood.name === 'Laune') mood.name = 'Happiness'

    // Schlaf bekommt die Uhrzeit dazu. Auch das ein Feld, das es vorher
    // nicht gab — wer `withTime` selbst gesetzt hat, behaelt seine Wahl.
    const sleep = next.find((c) => c.id === 'sleep')
    if (sleep && sleep.withTime === undefined) sleep.withTime = true
  }

  // Selbst angelegte Optionen, die eine frueherer Migration weggeworfen hat,
  // stehen noch in den Tagen: was irgendwann angehakt wurde und nicht aus dem
  // Regal stammt, kommt zurueck in die Auswahl. Regal-Optionen, die jemand
  // absichtlich rausgeworfen hat, bleiben draussen.
  const fromDefaults = new Map(CATALOG_CHECKS.map((d) => [d.def.id, new Set(d.def.options ?? [])]))
  for (const c of next) {
    if (c.kind !== 'multi') continue
    const have = new Set(c.options ?? [])
    const stock = fromDefaults.get(c.id) ?? new Set<string>()
    const back: string[] = []
    for (const day of Object.values(s.days)) {
      const v = day.values[c.id]
      if (!Array.isArray(v)) continue
      for (const o of v) {
        if (have.has(o) || stock.has(o) || back.includes(o)) continue
        back.push(o)
      }
    }
    if (back.length) c.options = [...(c.options ?? []), ...back]
  }

  // Das alte 'food' war eine 1-5-Skala und bleibt archiviert — die neue
  // Rubrik 'brudi_kcal' zaehlt Kilokalorien und faengt bei null an.

  // Abgeschaffte Checks: mit Daten ins Archiv, ohne Daten raus
  for (const id of RETIRED_CHECK_IDS) {
    const i = next.findIndex((c) => c.id === id)
    if (i < 0) continue
    const used = Object.values(s.days).some((d) => d.values[id] !== undefined)
    if (used) next[i] = { ...next[i], archived: true }
    else next.splice(i, 1)
  }

  return { ...s, checks: next, meta: { ...s.meta, v: STATE_VERSION } }
}

export function applyTheme(theme: Theme) {
  // Kein Stempel bei 'system' — dann entscheidet prefers-color-scheme.
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

/** Was gerade tatsaechlich auf dem Schirm ist, auch wenn 'system' gewaehlt ist. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/* ------------------------------------------------------------------ */
/* Supabase-Sync                                                       */
/* ------------------------------------------------------------------ */

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => void pushAll(), 900)
}

/**
 * Was zuletzt hochgeschoben wurde, je Tabelle: Id -> JSON der Zeile.
 *
 * Ohne das ginge bei jeder Aenderung der komplette Stand raus — auch die
 * 180 Tage Kalorien, von denen sich keiner geaendert hat. Mit dem Abgleich
 * wird aus dem Haken bei "Sauna" ein Upsert mit einer Zeile.
 */
const pushed = new Map<string, Map<string, string>>()

/** Nach einem Wechsel des Kontos oder einem Pull stimmt der Abgleich nicht mehr. */
function forgetPushed() {
  pushed.clear()
}

/** Reihen einer Tabelle abgleichen: upsert der geaenderten, delete der verschwundenen. */
async function replaceTable(table: string, rows: Record<string, unknown>[], keepIds: string[]) {
  if (!supabase || !userId) return

  const seen = pushed.get(table)
  const changed = seen
    ? rows.filter((r) => seen.get(String(r.id)) !== JSON.stringify(r))
    : rows

  for (let i = 0; i < changed.length; i += 200) {
    const { error } = await supabase.from(table).upsert(changed.slice(i, i + 200), { onConflict: 'id' })
    if (error) throw error
  }

  // Welche Ids es drueben gibt, steht in der Antwort, nicht in der URL.
  // Frueher lief das Aufraeumen ueber `not in (...)` mit allen Ids im
  // Query-String — bei 180 Tagen sind das acht Kilobyte URL, und daran
  // erstickt frueher oder later irgendein Proxy dazwischen.
  // Gefragt wird nur beim ersten Schub einer Sitzung; danach weiss der
  // Abgleich selbst, was drueben liegt. Was ein anderes Geraet geloescht
  // hat, raeumt ohnehin der naechste Pull auf.
  let remote: string[]
  if (seen) {
    remote = [...seen.keys()]
  } else {
    const { data, error } = await supabase.from(table).select('id').eq('user_id', userId)
    if (error) throw error
    remote = (data ?? []).map((r) => String(r.id))
  }

  const keep = new Set(keepIds)
  const gone = remote.filter((id) => !keep.has(id))
  for (let i = 0; i < gone.length; i += 100) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId).in('id', gone.slice(i, i + 100))
    if (error) throw error
  }

  const next = new Map<string, string>()
  for (const r of rows) next.set(String(r.id), JSON.stringify(r))
  pushed.set(table, next)
}

export async function pushAll() {
  if (!supabase || !userId) return
  status = 'syncing'
  emit()
  try {
    const uid = userId
    await replaceTable(
      T.checks,
      state.checks.map((c) => ({ id: c.id, user_id: uid, payload: c })),
      state.checks.map((c) => c.id),
    )
    const dayRows = Object.values(state.days).map((d) => ({ id: `${uid}:${d.date}`, user_id: uid, date: d.date, payload: d }))
    await replaceTable(T.days, dayRows, dayRows.map((d) => d.id))
    await replaceTable(
      T.reminders,
      state.reminders.map((r) => ({ id: r.id, user_id: uid, due: r.due, payload: r })),
      state.reminders.map((r) => r.id),
    )
    await replaceTable(
      T.nodes,
      state.nodes.map((n) => ({ id: n.id, user_id: uid, payload: n })),
      state.nodes.map((n) => n.id),
    )
    await replaceTable(
      T.frames,
      state.frames.map((f) => ({ id: f.id, user_id: uid, payload: f })),
      state.frames.map((f) => f.id),
    )
    await replaceTable(
      T.edges,
      state.edges.map((g) => ({ id: g.id, user_id: uid, payload: g })),
      state.edges.map((g) => g.id),
    )
    const { error } = await supabase.from(T.profiles).upsert({ id: uid, meta: state.meta }, { onConflict: 'id' })
    if (error) throw error
    lastError = null
    status = 'synced'
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    status = 'error'
  }
  emit()
}

export async function pullAll() {
  if (!supabase || !userId) return
  status = 'syncing'
  emit()
  try {
    const [checks, days, reminders, nodes, frames, edges, profile] = await Promise.all([
      supabase.from(T.checks).select('payload'),
      supabase.from(T.days).select('payload'),
      supabase.from(T.reminders).select('payload'),
      supabase.from(T.nodes).select('payload'),
      supabase.from(T.frames).select('payload'),
      supabase.from(T.edges).select('payload'),
      supabase.from(T.profiles).select('meta, username').eq('id', userId).maybeSingle(),
    ])
    const err = [checks, days, reminders, nodes, frames, edges, profile].find((r) => r.error)?.error
    if (err) throw err

    username = (profile.data?.username as string | null) ?? null

    const remote: AppState = {
      checks: (checks.data ?? []).map((r) => r.payload as CheckDef),
      days: Object.fromEntries((days.data ?? []).map((r) => {
        const d = r.payload as DayEntry
        return [d.date, d]
      })),
      reminders: (reminders.data ?? []).map((r) => r.payload as Reminder),
      nodes: (nodes.data ?? []).map((r) => r.payload as BoardNode),
      frames: (frames.data ?? []).map((r) => r.payload as BoardFrame),
      edges: (edges.data ?? []).map((r) => r.payload as BoardEdge),
      meta: { ...emptyState().meta, ...((profile.data?.meta as AppState['meta']) ?? {}) },
    }

    // Drueben kann ein Stand liegen, den eine aeltere Fassung geschrieben
    // hat. Der muss durch dieselbe Migration wie der eigene, bevor vereinigt
    // wird — sonst zieht er die hiesigen Definitionen auf den alten Stand
    // zurueck, und zwar bei jedem Start neu. Genau so verschwand die Bettzeit
    // wieder, kaum dass die Migration sie gesetzt hatte: lokal auf Fassung 11
    // gehoben, eine Sekunde spaeter von der Fassung 9 vom Server ueberschrieben.
    const stale = (remote.meta.v ?? 1) < STATE_VERSION
    const merged = mergeIn(state, stale ? migrate(remote) : remote)
    // Nur hochschieben, wenn die Vereinigung wirklich etwas beigetragen hat.
    // Ein stumpfer Vergleich der beiden Objekte waere immer ungleich — andere
    // Reihenfolge, andere Schluesselreihenfolge — und jeder App-Start wuerde
    // den ganzen Bestand neu hochladen.
    // Ein migrierter Server-Stand muss auch hoch, sonst liegt drueben weiter
    // die alte Fassung und jedes Geraet migriert sie bis in alle Ewigkeit neu.
    const grew =
      stale ||
      Object.keys(merged.days).length !== Object.keys(remote.days).length ||
      merged.checks.length !== remote.checks.length ||
      merged.reminders.length !== remote.reminders.length ||
      merged.nodes.length !== remote.nodes.length ||
      merged.frames.length !== remote.frames.length ||
      merged.edges.length !== remote.edges.length ||
      merged.meta.boards.length !== remote.meta.boards.length ||
      Object.entries(merged.days).some(([d, v]) => v.confirmed && !remote.days[d]?.confirmed)

    state = merged
    applyTheme(state.meta.theme)
    saveLocal()
    forgetPushed()
    emit()

    // Was nur hier lag, muss hoch — sonst steht es beim naechsten Geraet nicht da.
    if (grew) {
      await pushAll()
      return
    }
    lastError = null
    status = 'synced'
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    status = 'error'
  }
  emit()
}

/**
 * Was drueben liegt und was hier liegt, zusammenfuehren.
 *
 * Der naive Weg — drueben gewinnt — kostet Daten: wer sich zuerst auf dem
 * Laptop anmeldet, schiebt dessen leeren Stand hoch, und das iPhone mit den
 * echten Tagen zieht ihn sich anschliessend ueber die eigenen. Deshalb wird
 * vereinigt statt ersetzt.
 *
 * Regel: was es nur auf einer Seite gibt, bleibt. Wo beide Seiten dieselbe
 * Kennung haben, gewinnt drueben — das ist der geteilte Stand — mit einer
 * Ausnahme: ein bestaetigter Tag schlaegt einen unbestaetigten, egal von
 * welcher Seite. Ein bestaetigter Tag ist eine Aussage, ein unbestaetigter
 * nur ein Formular.
 */
function mergeIn(local: AppState, remote: AppState): AppState {
  const byId = <X extends { id: string }>(mine: X[], theirs: X[]): X[] => {
    const out = new Map(mine.map((x) => [x.id, x]))
    for (const x of theirs) out.set(x.id, x)
    return [...out.values()]
  }

  const days: Record<string, DayEntry> = { ...local.days }
  for (const [date, their] of Object.entries(remote.days)) {
    const mine = days[date]
    days[date] = mine?.confirmed && !their.confirmed ? mine : their
  }

  // Checks sind Definitionen, keine Eintraege: drueben gewinnt, aber was es
  // hier zusaetzlich gibt, bleibt stehen.
  const checks = byId(local.checks, remote.checks).sort((a, b) => a.sort - b.sort)

  return {
    checks,
    days,
    reminders: byId(local.reminders, remote.reminders),
    nodes: byId(local.nodes, remote.nodes),
    frames: byId(local.frames, remote.frames),
    edges: byId(local.edges, remote.edges),
    meta: {
      ...remote.meta,
      boards: byId(local.meta.boards, remote.meta.boards),
    },
  }
}

export function initAuth() {
  if (!supabase) return
  supabase.auth.getSession().then(({ data }) => {
    userId = data.session?.user.id ?? null
    email = data.session?.user.email ?? null
    status = userId ? 'syncing' : 'signed-out'
    emit()
    if (userId) void pullAll()
  })
  supabase.auth.onAuthStateChange((_evt, session) => {
    const next = session?.user.id ?? null
    if (next === userId) return
    userId = next
    email = session?.user.email ?? null
    if (!next) username = null
    forgetPushed()
    if (userId) {
      status = 'syncing'
      emit()
      void pullAll()
    } else {
      status = 'signed-out'
      emit()
    }
  })
}

/**
 * Anmelden mit Passwort. Der normale Weg.
 *
 * Der Magic Link ist auf dem iPhone die schlechtere Wahl, und zwar aus zwei
 * Gruenden: er oeffnet in Safari, und die App vom Homescreen hat einen
 * eigenen Speicher — die Sitzung landet also im falschen Fach und man steht
 * in der App weiter ohne Anmeldung da. Und Supabases eingebauter Mailer
 * laesst nur zwei Mails pro Stunde durch, danach kommt 429.
 */
export async function signInWithPassword(mail: string, password: string) {
  if (!supabase) throw new Error('Kein Supabase konfiguriert')
  const { error } = await supabase.auth.signInWithPassword({ email: mail.trim(), password })
  if (error) throw new Error(authMessage(error))
}

/** Magic Link — bleibt als Ausweg, wenn das Passwort weg ist. */
export async function signIn(email: string) {
  if (!supabase) throw new Error('Kein Supabase konfiguriert')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw new Error(authMessage(error))
}

/** Passwort setzen oder aendern. Geht nur angemeldet. */
export async function setPassword(password: string) {
  if (!supabase || !userId) throw new Error('Nicht angemeldet')
  if (password.length < 8) throw new Error('Mindestens 8 Zeichen.')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new Error(authMessage(error))
}

/** Die Fehler von GoTrue kommen englisch und kryptisch. */
function authMessage(e: { message: string; code?: string }): string {
  const code = e.code ?? ''
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(e.message)) {
    return 'Zu viele Mails. Der eingebaute Mailer von Supabase lässt nur zwei pro Stunde durch — nimm das Passwort.'
  }
  if (code === 'invalid_credentials' || /invalid login/i.test(e.message)) {
    return 'Mail oder Passwort stimmt nicht.'
  }
  if (code === 'same_password') return 'Das ist das alte Passwort.'
  if (code === 'weak_password') return 'Zu schwaches Passwort.'
  if (/for security purposes/i.test(e.message)) return 'Zu schnell hintereinander. Kurz warten.'
  return e.message
}

/** Token fuer den oeffentlichen Kalender-Feed. Liegt pro Nutzer in `profiles`. */
export async function calendarFeedUrl(): Promise<string | null> {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.from(T.profiles).select('calendar_token').eq('id', userId).maybeSingle()
  if (error || !data?.calendar_token) return null
  const base = SUPABASE_URL.replace(/\/$/, '')
  return `${base}/functions/v1/calendar-feed?t=${data.calendar_token}`
}

export async function signOut() {
  await supabase?.auth.signOut()
}

/**
 * Den eigenen Namen setzen. Eindeutig ueber alle Konten — der Fehler aus der
 * Datenbank wird durchgereicht, damit "schon vergeben" auch so ankommt.
 */
export async function setUsername(name: string): Promise<void> {
  if (!supabase || !userId) throw new Error('Nicht angemeldet')
  const clean = name.trim()
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(clean)) {
    throw new Error('3 bis 24 Zeichen, Buchstaben, Ziffern, Punkt, Strich, Unterstrich.')
  }
  const { error } = await supabase.from(T.profiles).update({ username: clean }).eq('id', userId)
  if (error) throw new Error(error.code === '23505' ? 'Der Name ist schon vergeben.' : error.message)
  username = clean
  emit()
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
