import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, update, uid } from '../lib/store'
import type { AppState, CheckDef, CheckKind, CheckValue } from '../lib/types'
import { SCALE_LABELS } from '../data/checks'
import { activeChecks, carriedDefaults, isFilled, meetsTarget, scoreDay, streak } from '../lib/scoring'
import { MIN_DAYS, findInsights, loggedDays, strengthLabel } from '../lib/insights'
import { addDays, longDate, today } from '../lib/dates'
import { fetchBrudi } from '../lib/brudi'
import { XP_DAY_COMPLETE, XP_GOAL_PAYOFF, XP_PER_CHECK } from '../lib/xp'
import { Check, ChevL, ChevR, Grip, Pencil, Plus, Trash, X } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { autoFocusUnlessTouch, noAutofill } from '../lib/device'
import { CheckStats } from './CheckStats'
import { toast } from '../components/Toasts'

export function Today() {
  const { state } = useStore()
  const [date, setDate] = useState(today())
  const [editing, setEditing] = useState<CheckDef | null>(null)
  const [stats, setStats] = useState<CheckDef | null>(null)
  const [adding, setAdding] = useState(false)

  const defs = activeChecks(state)
  const entry = state.days[date]
  const score = scoreDay(state, date)
  const run = streak(state)
  const goals = state.nodes.filter((n) => n.isGoal)
  const carried = useMemo(() => carriedDefaults(state, date), [state, date])

  /**
   * Die Essens-Rubrik zieht ihre Werte aus dem Kalorienbrudi-Bestand und
   * schreibt sie in die Tage — dadurch rechnen Statistik und Zusammenhaenge
   * damit wie mit jedem anderen Check, und es steht auch ohne Netz noch da.
   */
  const external = defs.filter((d) => d.kind === 'external')
  const [brudiState, setBrudiState] = useState<'idle' | 'laden' | 'fehler'>('idle')

  useEffect(() => {
    if (!external.length) return
    const ctrl = new AbortController()
    setBrudiState('laden')
    void fetchBrudi(addDays(today(), -180), ctrl.signal).then((rows) => {
      if (ctrl.signal.aborted) return
      setBrudiState(rows.length ? 'idle' : 'fehler')
      if (!rows.length) return

      const def = external.find((d) => d.source === 'brudi')
      if (!def) return

      update((d) => {
        for (const row of rows) {
          const day = (d.days[row.date] ??= { date: row.date, values: {}, awarded: [] })
          if (day.values[def.id] !== row.kcal) day.values[def.id] = row.kcal
        }
      })
    })
    return () => ctrl.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external.length])

  /**
   * Der heutige Tag startet mit den Werten vom letzten Mal — eingetragen,
   * nicht als Vorschlag. Nur fuer heute: aeltere Tage rueckwirkend zu fuellen
   * wuerde Daten erfinden, die es nie gab.
   * XP gibt es dafuer keine; die haengt weiter daran, dass man selbst etwas
   * anfasst (`awarded` bleibt leer).
   */
  useEffect(() => {
    if (date !== today()) return
    const missing = Object.entries(carried).filter(([id]) => !isFilled(state.days[date]?.values[id]))
    if (!missing.length) return
    update((d) => {
      const day = (d.days[date] ??= { date, values: {}, awarded: [] })
      for (const [id, v] of missing) if (!isFilled(day.values[id])) day.values[id] = v
    })
  }, [date, carried, state.days])

  const isToday = date === today()

  function setValue(def: CheckDef, value: CheckValue) {
    const wasFilled = isFilled(entry?.values[def.id])
    const nowFilled = isFilled(value)

    update((d) => {
      const day = (d.days[date] ??= { date, values: {}, awarded: [] })
      if (value === null) delete day.values[def.id]
      else day.values[def.id] = value

      if (nowFilled && !(day.awarded ?? []).includes(def.id)) {
        day.awarded = [...(day.awarded ?? []), def.id]
        d.meta.xp += XP_PER_CHECK
        if (def.goals?.length && meetsTarget(def, value)) d.meta.xp += XP_GOAL_PAYOFF * def.goals.length
      }
    })

    if (nowFilled && !wasFilled) {
      const after = scoreDay({ ...state, days: { ...state.days, [date]: { date, values: { ...(entry?.values ?? {}), [def.id]: value } } } }, date)
      if (after.filled === after.total && after.total > 0) {
        update((d) => { d.meta.xp += XP_DAY_COMPLETE })
        toast('Tag vollständig', XP_DAY_COMPLETE + XP_PER_CHECK)
      }
    }
  }

  /**
   * Option abschaffen: sie wird nicht mehr angeboten und verschwindet aus dem
   * heutigen Eintrag. Bereits erfasste Tage behalten ihren Wert — die Karte
   * zeigt ihn dort weiter an, damit Entfernen nicht rueckwirkend Daten
   * verschluckt.
   */
  function removeOption(def: CheckDef, option: string) {
    update((d) => {
      const c = d.checks.find((x) => x.id === def.id)
      if (c) {
        c.options = (c.options ?? []).filter((o) => o !== option)
        if (c.noneOption === option) c.noneOption = undefined
      }
      const day = d.days[date]
      const v = day?.values[def.id]
      if (Array.isArray(v)) {
        const next = v.filter((o) => o !== option)
        if (next.length) day.values[def.id] = next
        else delete day.values[def.id]
      }
    })
    toast(`„${option}" entfernt`)
  }

  /* ---- Reihenfolge per Griff ---- */

  const cardRefs = useRef(new Map<string, HTMLDivElement | null>())
  const [reorder, setReorder] = useState<{ id: string; x: number; y: number; order: string[] } | null>(null)

  const shownDefs = reorder
    ? (reorder.order.map((id) => defs.find((d) => d.id === id)).filter(Boolean) as CheckDef[])
    : defs

  function startReorder(e: React.PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    setReorder({ id, x: e.clientX, y: e.clientY, order: defs.map((d) => d.id) })
  }

  useEffect(() => {
    if (!reorder) return

    const onMove = (e: PointerEvent) => {
      setReorder((cur) => {
        if (!cur) return cur
        const from = cur.order.indexOf(cur.id)
        let to = from
        // Die Karte, ueber der der Finger gerade steht, bestimmt den Platz.
        for (let i = 0; i < cur.order.length; i++) {
          if (i === from) continue
          const el = cardRefs.current.get(cur.order[i])
          if (!el) continue
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            to = i
            break
          }
        }
        const order = [...cur.order]
        if (to !== from) {
          order.splice(to, 0, ...order.splice(from, 1))
        }
        return { ...cur, x: e.clientX, y: e.clientY, order }
      })
    }

    const onUp = () => {
      setReorder((cur) => {
        if (cur) {
          update((d) => {
            cur.order.forEach((id, i) => {
              const c = d.checks.find((x) => x.id === id)
              if (c) c.sort = (i + 1) * 10
            })
          })
        }
        return null
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [reorder?.id])

  /** Neue Sportart o.ae. direkt in der Karte anlegen. */
  function addOption(def: CheckDef, option: string) {
    const clean = option.trim()
    if (!clean) return
    update((d) => {
      const c = d.checks.find((x) => x.id === def.id)
      if (c && !c.options?.includes(clean)) c.options = [...(c.options ?? []), clean]
    })
  }

  return (
    <>
      <div className="today-head">
        <div>
          <div className="eyebrow">Everything Checker</div>
          <h1 className="display">{isToday ? <>Wie war <em>heute</em>?</> : longDate(date)}</h1>
        </div>
        <div className="datepick">
          <button className="arrowbtn" onClick={() => setDate(addDays(date, -1))} aria-label="Tag zurück"><ChevL /></button>
          <div className="datepick-label">{isToday ? 'Heute' : longDate(date)}</div>
          <button className="arrowbtn" disabled={isToday} onClick={() => setDate(addDays(date, 1))} aria-label="Tag vor"><ChevR /></button>
          {!isToday && <button className="btn btn--quiet btn--sm" onClick={() => setDate(today())}>Zurück zu heute</button>}
        </div>
      </div>

      <div className="daysum">
        <div className="daysum-cell">
          <div className="daysum-k">Erfasst</div>
          <div className="daysum-v">{score.filled}<small> / {score.total}</small></div>
        </div>
        <div className="daysum-cell">
          <div className="daysum-k">Serie</div>
          <div className="daysum-v">{run}<small> {run === 1 ? 'Tag' : 'Tage'}</small></div>
        </div>
      </div>

      <Insights state={state} />


      <div className="check-grid">
        {shownDefs.map((def) => (
          <CheckCard
            key={def.id}
            cardRef={(el) => cardRefs.current.set(def.id, el)}
            dragging={reorder?.id === def.id}
            onGrip={(e) => startReorder(e, def.id)}
            def={def}
            value={entry?.values[def.id] ?? null}
            goalNames={(def.goals ?? []).map((g) => state.nodes.find((n) => n.id === g)).filter(Boolean).map((n) => ({ text: n!.text || 'Ziel', color: n!.color }))}
            onChange={(v) => setValue(def, v)}
            onOpen={() => setStats(def)}
            onAddOption={(o) => addOption(def, o)}
            onRemoveOption={(o) => removeOption(def, o)}
            externalState={def.kind === 'external' ? brudiState : undefined}
          />
        ))}

        <button
          className="check"
          style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', borderStyle: 'dashed', background: 'transparent', boxShadow: 'none' }}
          onClick={() => setAdding(true)}
        >
          <Plus /> <span style={{ fontSize: 14, fontWeight: 550 }}>Noch was tracken</span>
        </button>
      </div>

      {reorder && (
        <div
          className="drag-ghost"
          style={{ left: reorder.x, top: reorder.y }}
        >
          {defs.find((d) => d.id === reorder.id)?.name}
        </div>
      )}

      {stats && (
        <CheckStats
          state={state}
          def={stats}
          onClose={() => setStats(null)}
          onEdit={() => { setEditing(stats); setStats(null) }}
        />
      )}

      {(editing || adding) && (
        <CheckEditor
          def={editing}
          goals={goals.map((g) => ({ id: g.id, text: g.text || 'Unbenanntes Ziel', color: g.color }))}
          onClose={() => { setEditing(null); setAdding(false) }}
        />
      )}
    </>
  )
}

/* ---------------------------------------------------------------- */

interface CardProps {
  def: CheckDef
  value: CheckValue
  goalNames: { text: string; color: string }[]
  cardRef: (el: HTMLDivElement | null) => void
  dragging: boolean
  onGrip: (e: React.PointerEvent) => void
  onChange: (v: CheckValue) => void
  onOpen: () => void
  onAddOption: (option: string) => void
  onRemoveOption: (option: string) => void
  /** nur bei gelesenen Rubriken gesetzt */
  externalState?: 'idle' | 'laden' | 'fehler'
}

function CheckCard({ def, value, goalNames, cardRef, dragging, onGrip, onChange, onOpen, onAddOption, onRemoveOption, externalState }: CardProps) {
  const filled = isFilled(value)

  return (
    <div
      ref={cardRef}
      className={'check' + (filled ? ' check--filled' : '') + (dragging ? ' check--moving' : '')}
    >
      <div className="check-top">
        <button onClick={onOpen} className="check-name" style={{ textAlign: 'left' }} title="Statistik ansehen">{def.name}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {def.unit && <span className="check-unit">{def.unit}</span>}
          <button className="grip" onPointerDown={onGrip} aria-label="Verschieben" title="Verschieben"><Grip /></button>
        </div>
      </div>

      <Input def={def} value={value} onChange={onChange} onAddOption={onAddOption} onRemoveOption={onRemoveOption} externalState={externalState} />

      {goalNames.length > 0 && (
        <div className="contrib">
          zahlt ein auf
          {goalNames.map((g, i) => (
            <span className="contrib-tag" key={i}>
              <i className="contrib-dot" style={{ background: `var(--n-${g.color})` }} />
              {g.text.length > 22 ? g.text.slice(0, 21) + '…' : g.text}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Input({ def, value, onChange, onAddOption, onRemoveOption, externalState }: {
  def: CheckDef
  value: CheckValue
  onChange: (v: CheckValue) => void
  onAddOption: (option: string) => void
  onRemoveOption: (option: string) => void
  externalState?: 'idle' | 'laden' | 'fehler'
}) {
  switch (def.kind) {
    case 'external':
      return <ExternalValue def={def} value={value} state={externalState} />
    case 'bool':
      return (
        <div className="bool">
          <button className="yes" aria-pressed={value === true} onClick={() => onChange(value === true ? null : true)}>Ja</button>
          <button aria-pressed={value === false} onClick={() => onChange(value === false ? null : false)}>Nein</button>
        </div>
      )
    case 'scale':
      return (
        <div className="scale">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} aria-pressed={value === n} title={SCALE_LABELS[n - 1]} onClick={() => onChange(value === n ? null : n)}>{n}</button>
          ))}
        </div>
      )
    case 'number': {
      const step = def.step ?? 1
      const num = typeof value === 'number' ? value : null
      const bump = (dir: number) => onChange(Math.max(0, Math.round(((num ?? 0) + dir * step) * 100) / 100))
      return (
        <div className="stepper">
          <button onClick={() => bump(-1)} aria-label="weniger">−</button>
          <input
            type="number" inputMode="decimal" step={step} min={0}
            value={num ?? ''} placeholder="–"
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          <button onClick={() => bump(1)} aria-label="mehr">+</button>
        </div>
      )
    }
    case 'choice':
      return (
        <div className="choice">
          {(def.options ?? []).map((o) => (
            <button key={o} aria-pressed={value === o} onClick={() => onChange(value === o ? null : o)}>{o}</button>
          ))}
        </div>
      )
    case 'multi':
      return <MultiInput def={def} value={value} onChange={onChange} onAddOption={onAddOption} onRemoveOption={onRemoveOption} />
    case 'text':
      return (
        <textarea
          className="textarea" placeholder="…"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
        />
      )
  }
}

/** Gelesene Rubrik: zeigt nur an, was die Quelle liefert. */
function ExternalValue({ def, value, state }: {
  def: CheckDef
  value: CheckValue
  state?: 'idle' | 'laden' | 'fehler'
}) {
  const n = typeof value === 'number' ? value : null

  if (n === null) {
    return (
      <div className="ext ext--empty">
        {state === 'laden' ? 'wird geholt …' : state === 'fehler' ? 'Quelle nicht erreichbar' : 'für diesen Tag nichts erfasst'}
      </div>
    )
  }

  return (
    <div className="ext">
      <div className="ext-row">
        <span className="ext-value">{Math.round(n).toLocaleString('de-DE')}</span>
        {def.unit && <span className="ext-target">{def.unit}</span>}
      </div>
      <div className="ext-note">aus Kalorienbrudi</div>
    </div>
  )
}

function MultiInput({ def, value, onChange, onAddOption, onRemoveOption }: {
  def: CheckDef
  value: CheckValue
  onChange: (v: CheckValue) => void
  onAddOption: (option: string) => void
  onRemoveOption: (option: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [managing, setManaging] = useState(false)
  const [draft, setDraft] = useState('')
  const picked = Array.isArray(value) ? value : []

  // Ein Wert, der an diesem Tag steht, aber nicht mehr angeboten wird, bleibt
  // sichtbar — sonst verschwaende das Entfernen einer Option rueckwirkend
  // erfasste Tage.
  const options = [...(def.options ?? []), ...picked.filter((p) => !def.options?.includes(p))]

  const toggle = (o: string) => {
    // "Nix" und tatsaechlich gemachter Sport schliessen sich gegenseitig aus
    if (o === def.noneOption) {
      onChange(picked.includes(o) ? null : [o])
      return
    }
    const next = picked.includes(o)
      ? picked.filter((x) => x !== o)
      : [...picked.filter((x) => x !== def.noneOption), o]
    onChange(next.length ? next : null)
  }

  const commit = () => {
    const clean = draft.trim()
    setAdding(false)
    setDraft('')
    if (!clean) return
    onAddOption(clean)
    if (!picked.includes(clean)) onChange([...picked.filter((x) => x !== def.noneOption), clean])
  }

  return (
    <div className={'multi' + (managing ? ' multi--managing' : '')}>
      {options.map((o) => (
        <span className="multi-slot" key={o}>
          <button
            className={o === def.noneOption ? 'none' : undefined}
            aria-pressed={picked.includes(o)}
            disabled={managing}
            onClick={() => toggle(o)}
          >
            {o}
          </button>
          {managing && (
            <button
              className="multi-x"
              onClick={() => onRemoveOption(o)}
              aria-label={`${o} entfernen`}
              title={`${o} entfernen`}
            >
              <X />
            </button>
          )}
        </span>
      ))}

      {adding ? (
        <input
          autoFocus value={draft}
          placeholder="Sportart" {...noAutofill}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setAdding(false); setDraft('') }
          }}
        />
      ) : (
        <>
          <button
            className="addopt"
            onClick={() => { setManaging(false); setAdding(true) }}
            aria-label="Option hinzufügen"
            title="Option hinzufügen"
          >
            <Plus />
          </button>
          <button
            className={'editopt' + (managing ? ' editopt--on' : '')}
            onClick={() => setManaging((m) => !m)}
            aria-label={managing ? 'Fertig' : 'Optionen bearbeiten'}
            title={managing ? 'Fertig' : 'Optionen bearbeiten'}
          >
            {managing ? <Check /> : <Pencil />}
          </button>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- */

/**
 * Zusammenhaenge zwischen den Checks. Laeuft von allein, sobald genug Tage
 * beisammen sind — vorher steht hier, wie weit es noch ist.
 */
function Insights({ state }: { state: AppState }) {
  const days = useMemo(() => loggedDays(state), [state])
  const found = useMemo(() => (days >= MIN_DAYS ? findInsights(state) : []), [state, days])

  if (days < MIN_DAYS) {
    return (
      <div className="insights">
        <div className="insights-progress">
          <span style={{ flex: 1 }}>
            Ab <b>{MIN_DAYS} erfassten Tagen</b> sucht OTAAT selbstständig nach Zusammenhängen
            zwischen deinen Checks. Noch {MIN_DAYS - days} {MIN_DAYS - days === 1 ? 'Tag' : 'Tage'}.
          </span>
          <div className="xp-track">
            <div className="xp-fill" style={{ width: `${(days / MIN_DAYS) * 100}%` }} />
          </div>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{days}/{MIN_DAYS}</span>
        </div>
      </div>
    )
  }

  if (found.length === 0) {
    return (
      <div className="insights">
        <div className="insights-progress">
          <span>
            {days} Tage ausgewertet, nichts Auffälliges dabei. Kein schlechtes Zeichen — es heißt
            nur, dass sich deine Werte bisher unabhängig voneinander bewegen.
          </span>
        </div>
      </div>
    )
  }

  const top = found.slice(0, 5)

  return (
    <section className="insights">
      <div className="insights-head">
        <h2 className="section-title">Was zusammenhängt</h2>
        <span className="insights-note">
          aus {days} Tagen · zeigt Zusammenhänge, keine Ursachen
        </span>
      </div>

      {top.map((i) => (
        <div className="insight" key={`${i.a.id}-${i.b.id}-${i.lagged}`}>
          <div className="insight-text">
            War <b>{i.a.name}</b> hoch, war <b>{i.b.name}</b>{' '}
            {i.lagged ? 'am nächsten Tag' : 'am selben Tag'} meist{' '}
            <b>{i.r > 0 ? 'hoch' : 'niedrig'}</b>.
          </div>
          <div className="insight-meta">
            <span>{strengthLabel(i.r)}</span>
            <div className={'insight-bar ' + (i.r > 0 ? 'insight-bar--up' : 'insight-bar--down')}>
              <i style={{ width: `${Math.min(100, Math.abs(i.r) * 100)}%` }} />
            </div>
            <span>{i.n} T</span>
          </div>
        </div>
      ))}
    </section>
  )
}

/* ---------------------------------------------------------------- */

const KINDS: { k: CheckKind; label: string }[] = [
  { k: 'bool', label: 'Ja / Nein' },
  { k: 'scale', label: 'Skala 1–5' },
  { k: 'number', label: 'Zahl' },
  { k: 'choice', label: 'Auswahl' },
  { k: 'multi', label: 'Mehrfachauswahl' },
  { k: 'text', label: 'Freitext' },
]

function CheckEditor({ def, goals, onClose }: { def: CheckDef | null; goals: { id: string; text: string; color: string }[]; onClose: () => void }) {
  const [name, setName] = useState(def?.name ?? '')
  const [kind, setKind] = useState<CheckKind>(def?.kind ?? 'bool')
  const [unit, setUnit] = useState(def?.unit ?? '')
  const [options, setOptions] = useState((def?.options ?? []).join(', '))
  const [target, setTarget] = useState(def?.target !== undefined ? String(def.target) : '')
  const [inverse, setInverse] = useState(!!def?.inverse)
  const [linked, setLinked] = useState<string[]>(def?.goals ?? [])

  const save = () => {
    if (!name.trim()) return
    const patch: Omit<CheckDef, 'id' | 'sort'> = {
      name: name.trim(),
      kind,
      unit: unit.trim() || undefined,
      options: kind === 'choice' || kind === 'multi' ? options.split(',').map((o) => o.trim()).filter(Boolean) : undefined,
      target: target === '' ? undefined : Number(target),
      inverse: inverse || undefined,
      goals: linked.length ? linked : undefined,
    }
    update((d) => {
      if (def) {
        const i = d.checks.findIndex((c) => c.id === def.id)
        if (i >= 0) d.checks[i] = { ...d.checks[i], ...patch }
      } else {
        const sort = Math.max(0, ...d.checks.map((c) => c.sort)) + 10
        d.checks.push({ id: uid(), sort, ...patch })
      }
    })
    onClose()
  }

  const remove = () => {
    if (!def) return
    update((d) => { d.checks = d.checks.filter((c) => c.id !== def.id) })
    toast(`„${def.name}" entfernt`)
    onClose()
  }

  return (
    <Sheet
      title={def ? def.name : 'Neuer Check'}
      onClose={onClose}
      footer={
        <>
          {def && <button className="btn btn--quiet btn--danger" onClick={remove} style={{ marginRight: 'auto' }}><Trash /> Löschen</button>}
          <button className="btn btn--ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn btn--primary" onClick={save} disabled={!name.trim()}>Speichern</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ce-label">Name</label>
        <input
          id="ce-label" name="check-label" className="input"
          value={name} onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Kaltduschen"
          autoFocus={autoFocusUnlessTouch} {...noAutofill}
        />
      </div>

      {kind === 'external' ? (
        <p className="chart-note" style={{ margin: 0 }}>
          Diese Rubrik holt ihre Werte selbst aus dem Kalorienbrudi-Bestand und
          lässt sich nicht von Hand eintragen. Name, Zielwert und die Verknüpfung
          mit Board-Zielen kannst du trotzdem ändern.
        </p>
      ) : (
        <div className="field">
          <label>Eingabe</label>
          <div className="choice">
            {KINDS.map(({ k, label }) => (
              <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
            ))}
          </div>
        </div>
      )}

      {(kind === 'choice' || kind === 'multi') && (
        <div className="field">
          <label htmlFor="ce-opt">Optionen, mit Komma getrennt</label>
          <input id="ce-opt" className="input" value={options} onChange={(e) => setOptions(e.target.value)} placeholder="Kraft, Cardio, Nix" />
        </div>
      )}

      {kind === 'number' && (
        <div className="field">
          <label htmlFor="ce-unit">Einheit</label>
          <input id="ce-unit" className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="h, Tassen, km" />
        </div>
      )}

      {(kind === 'number' || kind === 'scale' || kind === 'external') && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="ce-target">{inverse ? 'Höchstens' : 'Mindestens'}</label>
            <input id="ce-target" className="input mono" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="–" />
          </div>
          <button className="btn btn--ghost" onClick={() => setInverse(!inverse)} style={{ marginBottom: 1 }}>
            {inverse ? 'Weniger ist besser' : 'Mehr ist besser'}
          </button>
        </div>
      )}

      <div className="field">
        <label>Zahlt ein auf</label>
        {goals.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Noch keine Ziele. Markiere auf <b>Mind my Business</b> einen Eintrag als Ziel, dann taucht er hier auf.
          </div>
        ) : (
          <div className="choice">
            {goals.map((g) => (
              <button
                key={g.id}
                aria-pressed={linked.includes(g.id)}
                onClick={() => setLinked((cur) => (cur.includes(g.id) ? cur.filter((x) => x !== g.id) : [...cur, g.id]))}
              >
                {g.text.length > 30 ? g.text.slice(0, 29) + '…' : g.text}
              </button>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
