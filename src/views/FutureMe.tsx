import { useEffect, useMemo, useState } from 'react'
import { useStore, update, uid, calendarFeedUrl } from '../lib/store'
import type { Cadence, Reminder } from '../lib/types'
import { CATALOG, CATALOG_BY_CATEGORY, type Preset } from '../data/catalog'
import { advance, cadenceLabel, daysBetween, relativeDue, shortDate, today } from '../lib/dates'
import { XP_REMINDER_DONE } from '../lib/xp'
import { downloadICS } from '../lib/ics'
import { Cal, Check, Plus, Trash } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { autoFocusUnlessTouch, noAutofill } from '../lib/device'
import { toast } from '../components/Toasts'

type Filter = { kind: 'radar' } | { kind: 'all' } | { kind: 'cat'; name: string }

export function FutureMe() {
  const { state } = useStore()
  const [filter, setFilter] = useState<Filter>({ kind: 'radar' })
  const [picker, setPicker] = useState(false)
  const [cal, setCal] = useState(false)
  const [editing, setEditing] = useState<Reminder | 'new' | null>(null)

  const rem = state.reminders
  const now = today()

  const onRadar = useMemo(
    () => rem.filter((r) => !r.done && daysBetween(now, r.due) <= r.lead).sort((a, b) => a.due.localeCompare(b.due)),
    [rem, now],
  )
  const categories = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of rem) if (!r.done) m.set(r.category, (m.get(r.category) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'))
  }, [rem])

  const visible = useMemo(() => {
    const base =
      filter.kind === 'radar' ? onRadar : filter.kind === 'cat' ? rem.filter((r) => r.category === filter.name) : rem
    return [...base].sort((a, b) => Number(!!a.done) - Number(!!b.done) || a.due.localeCompare(b.due))
  }, [filter, rem, onRadar])

  function complete(r: Reminder) {
    update((d) => {
      const i = d.reminders.findIndex((x) => x.id === r.id)
      if (i < 0) return
      const item = d.reminders[i]
      item.lastDone = today()
      if (item.cadence.type === 'once') item.done = true
      else {
        // Von heute aus weiterzaehlen, nicht vom alten Termin — sonst staut sich alles auf.
        const base = daysBetween(item.due, today()) > 0 ? today() : item.due
        item.due = advance(base, item.cadence)
      }
      d.meta.xp += XP_REMINDER_DONE
    })
    toast(`„${r.title}" erledigt`, XP_REMINDER_DONE)
  }

  return (
    <>
      <div className="today-head">
        <div>
          <div className="eyebrow">Future Me Problems</div>
          <h1 className="display">Das Zeug, das dich <em>später</em> einholt.</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" onClick={() => setCal(true)} disabled={!rem.length}><Cal /> Kalender</button>
          <button className="btn btn--ghost" onClick={() => setPicker(true)}>Aus dem Regal</button>
          <button className="btn btn--primary" onClick={() => setEditing('new')}><Plus /> Eigenes</button>
        </div>
      </div>

      <div className="fm-layout">
        <aside className="fm-side">
          <button className="fm-cat" aria-current={filter.kind === 'radar'} onClick={() => setFilter({ kind: 'radar' })}>
            Radar <span>{onRadar.length}</span>
          </button>
          <button className="fm-cat" aria-current={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
            Alles <span>{rem.length}</span>
          </button>
          {categories.length > 0 && <hr className="divider" style={{ margin: '8px 0' }} />}
          {categories.map(([name, n]) => (
            <button key={name} className="fm-cat" aria-current={filter.kind === 'cat' && filter.name === name} onClick={() => setFilter({ kind: 'cat', name })}>
              {name} <span>{n}</span>
            </button>
          ))}
        </aside>

        <div className="fm-list">
          {visible.length === 0 && (
            <div className="empty">
              <strong>{filter.kind === 'radar' ? 'Nichts auf dem Radar.' : 'Noch nichts hier.'}</strong>
              {filter.kind === 'radar'
                ? 'Alles weit genug weg. Genieß es.'
                : 'Zieh dir was aus dem Regal oder leg was Eigenes an.'}
            </div>
          )}
          {visible.map((r) => {
            const d = daysBetween(now, r.due)
            const overdue = !r.done && d < 0
            const soon = !r.done && d >= 0 && d <= r.lead
            return (
              <div key={r.id} className={'fm-item' + (overdue ? ' fm-item--due' : soon ? ' fm-item--soon' : '')}>
                <button className="tick" onClick={() => complete(r)} aria-label="Erledigt" title="Erledigt"
                  style={r.done ? { background: 'var(--good)', borderColor: 'var(--good)', color: '#fff' } : undefined}>
                  <Check />
                </button>
                <div className="fm-body">
                  <button className="fm-title" style={{ textAlign: 'left', textDecoration: r.done ? 'line-through' : undefined, opacity: r.done ? 0.5 : 1 }} onClick={() => setEditing(r)}>
                    {r.title}
                  </button>
                  <div className="fm-meta">
                    <span>{r.category}</span>
                    <span className="mono">{cadenceLabel(r.cadence)}</span>
                    {r.lastDone && <span className="mono">zuletzt {shortDate(r.lastDone)}</span>}
                    {r.notes && <span style={{ color: 'var(--ink-4)' }}>{r.notes}</span>}
                  </div>
                </div>
                <div className="fm-right">
                  {r.done ? (
                    <span className="chip chip--good">erledigt</span>
                  ) : (
                    <>
                      <span className={'chip ' + (overdue ? 'chip--warn' : soon ? 'chip--sel' : 'chip--line')}>{relativeDue(r.due, now)}</span>
                      <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{shortDate(r.due)}</span>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {cal && <CalendarSheet onClose={() => setCal(false)} />}
      {picker && <CatalogPicker onClose={() => setPicker(false)} />}
      {editing && <ReminderEditor reminder={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

/* ---------------------------------------------------------------- */

function CalendarSheet({ onClose }: { onClose: () => void }) {
  const { state, userId } = useStore()
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { void calendarFeedUrl().then(setUrl) }, [userId])

  const webcal = url?.replace(/^https?:/, 'webcal:')

  return (
    <Sheet title="In den Kalender" onClose={onClose}
      footer={<button className="btn btn--primary" onClick={onClose}>Schließen</button>}>

      <div className="field">
        <label>Einmalig exportieren</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn--ghost btn--sm" onClick={() => downloadICS(state.reminders)}>
            .ics herunterladen
          </button>
          <span style={{ fontSize: 12.5, color: 'var(--ink-3)' }}>
            Doppelklick öffnet Apple Kalender. Spätere Änderungen kommen nicht mit.
          </span>
        </div>
      </div>

      <hr className="divider" />

      <div className="field">
        <label>Dauerhaft abonnieren</label>
        {url ? (
          <>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="input mono" readOnly value={url} style={{ fontSize: 12 }} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn--ghost btn--sm" onClick={() => {
                void navigator.clipboard.writeText(url)
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              }}>{copied ? 'Kopiert' : 'Kopieren'}</button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: '10px 0 0', lineHeight: 1.6 }}>
              Apple Kalender → <b>Ablage → Neues Kalenderabo</b>, Link einsetzen, Aktualisierung
              auf „Täglich". Jeder Eintrag bringt seine Vorwarnung als Alarm mit — die
              Benachrichtigung kommt dann vom Mac oder iPhone, nicht aus dieser App.
              {webcal && <> Auf dem iPhone reicht <a href={webcal}>dieser Link</a>.</>}
            </p>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', margin: '8px 0 0' }}>
              Der Link ist dein Schlüssel — wer ihn hat, sieht die Liste. Nicht weitergeben.
            </p>
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--ink-2)', margin: 0 }}>
            Dafür musst du angemeldet sein und die Edge Function <code className="mono">calendar-feed</code> deployed
            haben. Ohne Konto bleibt der einmalige Export.
          </p>
        )}
      </div>
    </Sheet>
  )
}

function CatalogPicker({ onClose }: { onClose: () => void }) {
  const { state } = useStore()
  const [q, setQ] = useState('')
  const taken = new Set(state.reminders.map((r) => r.presetId).filter(Boolean) as string[])

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return CATALOG_BY_CATEGORY
    return CATALOG_BY_CATEGORY.map((g) => ({
      category: g.category,
      items: g.items.filter((p) => (p.title + ' ' + p.category + ' ' + (p.note ?? '')).toLowerCase().includes(needle)),
    })).filter((g) => g.items.length)
  }, [q])

  function add(p: Preset) {
    update((d) => { d.reminders.push(fromPreset(p)) })
    toast(`„${p.title}" übernommen`)
  }

  function addAll(items: Preset[]) {
    const fresh = items.filter((p) => !taken.has(p.id))
    if (!fresh.length) return
    update((d) => { for (const p of fresh) d.reminders.push(fromPreset(p)) })
    toast(`${fresh.length} übernommen`)
  }

  return (
    <Sheet
      title="Das Regal"
      wide
      onClose={onClose}
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {CATALOG.length} Einträge · Termine kannst du danach einzeln verschieben
          </span>
          <button className="btn btn--primary" onClick={onClose}>Fertig</button>
        </>
      }
    >
      <input
        className="input" type="search"
        placeholder="Suchen — Zahnarzt, TÜV, Semesterbeitrag …"
        value={q} onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocusUnlessTouch} {...noAutofill}
      />

      {groups.map((g) => (
        <section key={g.category}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 19 }}>{g.category}</h4>
            <button className="btn btn--quiet btn--sm" onClick={() => addAll(g.items)}>alle</button>
          </div>
          <div className="cat-grid">
            {g.items.map((p) => (
              <button key={p.id} className={'cat-row' + (taken.has(p.id) ? ' cat-row--added' : '')} onClick={() => add(p)}>
                <div style={{ minWidth: 0 }}>
                  <div className="cat-row-title">{p.title}</div>
                  <div className="cat-row-sub">{cadenceLabel(p.cadence)}{p.note ? ` · ${p.note}` : ''}</div>
                </div>
                <span className="cat-plus">{taken.has(p.id) ? '✓' : '+'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && <div className="empty"><strong>Nichts gefunden.</strong>Leg es einfach selbst an.</div>}
    </Sheet>
  )
}

/** Kurze Rhythmen starten heute, lange erst nach einem Intervall — sonst ist am Tag 1 alles rot. */
function fromPreset(p: Preset): Reminder {
  const inDays =
    p.cadence.type === 'once'
      ? 0
      : p.cadence.unit === 'day' ? p.cadence.n
      : p.cadence.unit === 'week' ? p.cadence.n * 7
      : p.cadence.unit === 'month' ? p.cadence.n * 30
      : p.cadence.n * 365
  const due = inDays <= 92 ? today() : advance(today(), p.cadence)
  return {
    id: uid(),
    title: p.title,
    category: p.category,
    cadence: p.cadence.type === 'once' ? { type: 'once', on: due } : p.cadence,
    due,
    lead: p.lead,
    notes: p.note,
    createdAt: new Date().toISOString(),
    presetId: p.id,
  }
}

/* ---------------------------------------------------------------- */

const UNITS: { u: 'day' | 'week' | 'month' | 'year'; label: string }[] = [
  { u: 'day', label: 'Tage' },
  { u: 'week', label: 'Wochen' },
  { u: 'month', label: 'Monate' },
  { u: 'year', label: 'Jahre' },
]

function ReminderEditor({ reminder, onClose }: { reminder: Reminder | null; onClose: () => void }) {
  const { state } = useStore()
  const existing = [...new Set([...state.reminders.map((r) => r.category), 'Sonstiges'])].sort((a, b) => a.localeCompare(b, 'de'))

  const [title, setTitle] = useState(reminder?.title ?? '')
  const [category, setCategory] = useState(reminder?.category ?? existing[0] ?? 'Sonstiges')
  const [repeats, setRepeats] = useState(reminder ? reminder.cadence.type === 'every' : true)
  const [n, setN] = useState(reminder?.cadence.type === 'every' ? String(reminder.cadence.n) : '1')
  const [unit, setUnit] = useState<'day' | 'week' | 'month' | 'year'>(reminder?.cadence.type === 'every' ? reminder.cadence.unit : 'year')
  const [due, setDue] = useState(reminder?.due ?? today())
  const [lead, setLead] = useState(String(reminder?.lead ?? 14))
  const [notes, setNotes] = useState(reminder?.notes ?? '')

  const save = () => {
    if (!title.trim()) return
    const cadence: Cadence = repeats
      ? { type: 'every', n: Math.max(1, Number(n) || 1), unit }
      : { type: 'once', on: due }
    update((d) => {
      if (reminder) {
        const i = d.reminders.findIndex((r) => r.id === reminder.id)
        if (i >= 0) d.reminders[i] = { ...d.reminders[i], title: title.trim(), category, cadence, due, lead: Number(lead) || 0, notes: notes.trim() || undefined, done: repeats ? false : d.reminders[i].done }
      } else {
        d.reminders.push({
          id: uid(), title: title.trim(), category, cadence, due,
          lead: Number(lead) || 0, notes: notes.trim() || undefined,
          createdAt: new Date().toISOString(),
        })
      }
    })
    onClose()
  }

  const remove = () => {
    if (!reminder) return
    update((d) => { d.reminders = d.reminders.filter((r) => r.id !== reminder.id) })
    onClose()
  }

  return (
    <Sheet
      title={reminder ? 'Bearbeiten' : 'Neuer Eintrag'}
      onClose={onClose}
      footer={
        <>
          {reminder && <button className="btn btn--quiet btn--danger" onClick={remove} style={{ marginRight: 'auto' }}><Trash /> Löschen</button>}
          <button className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn--primary" onClick={save} disabled={!title.trim()}>Speichern</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="r-title">Was</label>
        <input
          id="r-title" name="reminder-title" className="input"
          value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="z.B. Semesterbeitrag überweisen"
          autoFocus={autoFocusUnlessTouch} {...noAutofill}
        />
      </div>

      <div className="field">
        <label htmlFor="r-cat">Kategorie</label>
        <input id="r-cat" className="input" list="r-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
        <datalist id="r-cats">{existing.map((c) => <option key={c} value={c} />)}</datalist>
      </div>

      <div className="field">
        <label>Rhythmus</label>
        <div className="choice" style={{ marginBottom: repeats ? 10 : 0 }}>
          <button aria-pressed={repeats} onClick={() => setRepeats(true)}>Wiederholt sich</button>
          <button aria-pressed={!repeats} onClick={() => setRepeats(false)}>Einmalig</button>
        </div>
        {repeats && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>alle</span>
            <input className="input mono" style={{ width: 72 }} type="number" min={1} value={n} onChange={(e) => setN(e.target.value)} />
            <div className="choice">
              {UNITS.map(({ u, label }) => (
                <button key={u} aria-pressed={unit === u} onClick={() => setUnit(u)}>{label}</button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="r-due">Nächster Termin</label>
          <input id="r-due" className="input mono" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="r-lead">Vorwarnung in Tagen</label>
          <input id="r-lead" className="input mono" type="number" min={0} value={lead} onChange={(e) => setLead(e.target.value)} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="r-notes">Notiz</label>
        <input id="r-notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
      </div>
    </Sheet>
  )
}
