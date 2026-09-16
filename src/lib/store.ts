import { useSyncExternalStore } from 'react'
import type { AppState, BoardEdge, BoardFrame, BoardNode, CheckDef, DayEntry, Reminder, Theme } from './types'
import { DEFAULT_CHECKS, RETIRED_CHECK_IDS } from '../data/checks'
import { supabase, cloudEnabled } from './supabase'

const LS_KEY = 'otaat.state.v1'

/** Hochzaehlen, wenn `migrate` einen neuen Schritt bekommt. */
const STATE_VERSION = 3

export const emptyState = (): AppState => ({
  checks: DEFAULT_CHECKS.map((c) => ({ ...c })),
  days: {},
  reminders: [],
  nodes: [],
  frames: [],
  edges: [],
  meta: { xp: 0, theme: 'system', dismissedPresets: [], v: STATE_VERSION },
})

export type SyncStatus = 'local' | 'signed-out' | 'syncing' | 'synced' | 'error'

let state: AppState = emptyState()
let status: SyncStatus = cloudEnabled ? 'signed-out' : 'local'
let userId: string | null = null
let lastError: string | null = null

export interface Snapshot {
  state: AppState
  status: SyncStatus
  userId: string | null
  lastError: string | null
}

const listeners = new Set<() => void>()
let snapshot: Snapshot = { state, status, userId, lastError }

function emit() {
  snapshot = { state, status, userId, lastError }
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
    // Ein Stand ohne Checks waere eine leere App ohne Weg zurueck.
    if (!merged.checks?.length) merged.checks = base.checks
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

  // Aktuelle Definitionen uebernehmen, die Verknuepfungen zu Board-Zielen behalten
  const next = DEFAULT_CHECKS.map((def) => {
    const old = byId.get(def.id)
    return old?.goals?.length ? { ...def, goals: old.goals } : { ...def }
  })

  // Abgeschaffte Checks: mit Daten ins Archiv, ohne Daten raus
  for (const id of RETIRED_CHECK_IDS) {
    const old = byId.get(id)
    if (!old) continue
    const used = Object.values(s.days).some((d) => d.values[id] !== undefined)
    if (used) next.push({ ...old, archived: true })
  }

  // Selbst angelegte Checks bleiben unangetastet
  const known = new Set([...DEFAULT_CHECKS.map((d) => d.id), ...RETIRED_CHECK_IDS])
  for (const c of s.checks) if (!known.has(c.id)) next.push(c)

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

/** Reihen einer Tabelle ersetzen: upsert aller aktuellen + delete der verschwundenen. */
async function replaceTable(table: string, rows: Record<string, unknown>[], keepIds: string[]) {
  if (!supabase || !userId) return
  if (rows.length) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' })
    if (error) throw error
  }
  let del = supabase.from(table).delete().eq('user_id', userId)
  if (keepIds.length) del = del.not('id', 'in', `(${keepIds.map((i) => `"${i}"`).join(',')})`)
  const { error } = await del
  if (error) throw error
}

export async function pushAll() {
  if (!supabase || !userId) return
  status = 'syncing'
  emit()
  try {
    const uid = userId
    await replaceTable(
      'checks',
      state.checks.map((c) => ({ id: c.id, user_id: uid, payload: c })),
      state.checks.map((c) => c.id),
    )
    const dayRows = Object.values(state.days).map((d) => ({ id: `${uid}:${d.date}`, user_id: uid, date: d.date, payload: d }))
    await replaceTable('days', dayRows, dayRows.map((d) => d.id))
    await replaceTable(
      'reminders',
      state.reminders.map((r) => ({ id: r.id, user_id: uid, due: r.due, payload: r })),
      state.reminders.map((r) => r.id),
    )
    await replaceTable(
      'board_nodes',
      state.nodes.map((n) => ({ id: n.id, user_id: uid, payload: n })),
      state.nodes.map((n) => n.id),
    )
    await replaceTable(
      'board_frames',
      state.frames.map((f) => ({ id: f.id, user_id: uid, payload: f })),
      state.frames.map((f) => f.id),
    )
    await replaceTable(
      'board_edges',
      state.edges.map((g) => ({ id: g.id, user_id: uid, payload: g })),
      state.edges.map((g) => g.id),
    )
    const { error } = await supabase.from('profiles').upsert({ id: uid, meta: state.meta }, { onConflict: 'id' })
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
      supabase.from('checks').select('payload'),
      supabase.from('days').select('payload'),
      supabase.from('reminders').select('payload'),
      supabase.from('board_nodes').select('payload'),
      supabase.from('board_frames').select('payload'),
      supabase.from('board_edges').select('payload'),
      supabase.from('profiles').select('meta').eq('id', userId).maybeSingle(),
    ])
    const err = [checks, days, reminders, nodes, frames, edges, profile].find((r) => r.error)?.error
    if (err) throw err

    const remoteChecks = (checks.data ?? []).map((r) => r.payload as CheckDef)
    const remoteDays = (days.data ?? []).map((r) => r.payload as DayEntry)
    const fresh = remoteChecks.length === 0 && remoteDays.length === 0

    if (fresh) {
      // Erstes Login auf diesem Account: lokalen Stand hochschieben statt ihn wegzuwerfen.
      await pushAll()
      return
    }

    state = {
      checks: remoteChecks.sort((a, b) => a.sort - b.sort),
      days: Object.fromEntries(remoteDays.map((d) => [d.date, d])),
      reminders: (reminders.data ?? []).map((r) => r.payload as Reminder),
      nodes: (nodes.data ?? []).map((r) => r.payload as BoardNode),
      frames: (frames.data ?? []).map((r) => r.payload as BoardFrame),
      edges: (edges.data ?? []).map((r) => r.payload as BoardEdge),
      meta: { ...emptyState().meta, ...((profile.data?.meta as AppState['meta']) ?? {}) },
    }
    applyTheme(state.meta.theme)
    saveLocal()
    lastError = null
    status = 'synced'
  } catch (e) {
    lastError = e instanceof Error ? e.message : String(e)
    status = 'error'
  }
  emit()
}

export function initAuth() {
  if (!supabase) return
  supabase.auth.getSession().then(({ data }) => {
    userId = data.session?.user.id ?? null
    status = userId ? 'syncing' : 'signed-out'
    emit()
    if (userId) void pullAll()
  })
  supabase.auth.onAuthStateChange((_evt, session) => {
    const next = session?.user.id ?? null
    if (next === userId) return
    userId = next
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

export async function signIn(email: string) {
  if (!supabase) throw new Error('Kein Supabase konfiguriert')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/** Token fuer den oeffentlichen Kalender-Feed. Liegt pro Nutzer in `profiles`. */
export async function calendarFeedUrl(): Promise<string | null> {
  if (!supabase || !userId) return null
  const { data, error } = await supabase.from('profiles').select('calendar_token').eq('id', userId).maybeSingle()
  if (error || !data?.calendar_token) return null
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  return `${base}/functions/v1/calendar-feed?t=${data.calendar_token}`
}

export async function signOut() {
  await supabase?.auth.signOut()
}

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export function awardXp(n: number) {
  update((d) => {
    d.meta.xp = Math.max(0, d.meta.xp + n)
  })
}
