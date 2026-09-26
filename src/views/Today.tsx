import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, update, uid } from '../lib/store'
import type { AppState, CheckDef, CheckKind, CheckValue, DayEntry } from '../lib/types'
import { CHECK_CATALOG, SCALE_MAX, scaleLabel, type CheckTemplate } from '../data/checks'
import { activeChecks, carriedDefaults, dropCheck, endKey, ensureSourceChecks, isFilled, scoreDay, streak, timeKey } from '../lib/scoring'
import { MIN_DAYS, findInsights, loggedDays } from '../lib/insights'
import { InsightRow, insightKey } from '../components/InsightRow'
import { addDays, longDate, checkerToday, today } from '../lib/dates'
import { fetchBrudi } from '../lib/brudi'
import { applyOuraDays, fetchOura } from '../lib/oura'
import { BRUDI_HIDDEN_KEYS, BRUDI_MACROS } from '../data/brudi-source'
import { Check, ChevL, ChevR, Grip, Pencil, Plus, Sort, Trash, X } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { autoFocusUnlessTouch, noAutofill } from '../lib/device'
import { useSwipe } from '../lib/swipe'
import { CheckStats } from './CheckStats'
import { toast } from '../components/Toasts'

/**
 * Ein frisch angelegter Tag ist ausdruecklich **nicht** bestaetigt.
 *
 * Bliebe das Feld offen, waere er von einem Tag aus der Zeit vor dem
 * Bestaetigen-Knopf nicht zu unterscheiden — und die Migration hat genau
 * die nachtraeglich festgeschrieben. Wer einen alten Tag aufmacht, etwas
 * eintraegt und bewusst nicht abschickt, fand ihn beim naechsten Start
 * bestaetigt vor.
 */
const blankDay = (date: string): DayEntry => ({ date, values: {}, confirmed: false })

export function Today() {
  const { state, userId } = useStore()
  const [date, setDate] = useState(checkerToday())
  const [editing, setEditing] = useState<CheckDef | null>(null)
  const [stats, setStats] = useState<CheckDef | null>(null)
  const [adding, setAdding] = useState(false)
  const [picking, setPicking] = useState(false)
  const [sorting, setSorting] = useState(false)

  const defs = activeChecks(state)
  const entry = state.days[date]
  const score = scoreDay(state, date)
  const confirmed = state.days[date]?.confirmed === true
  const run = streak(state)
  const goals = state.nodes.filter((n) => n.isGoal)
  const carried = useMemo(() => carriedDefaults(state, date), [state, date])

  /**
   * Die Essens-Rubriken ziehen ihre Werte aus dem Kalorienbrudi-Bestand und
   * schreiben sie in die Tage — dadurch rechnen Statistik und Zusammenhaenge
   * damit wie mit jedem anderen Check, und es steht auch ohne Netz noch da.
   *
   * Mitgeschrieben werden zwei Sorten: die Rubriken, die man sich ausgesucht
   * hat (Kalorien, Makros), und die Mikronaehrwerte, die auf keiner Karte
   * stehen. Letztere landen unter ihrem eigenen Schluessel im Tag und tauchen
   * nur in der Zusammenhangs-Suche wieder auf.
   */
  const external = defs.filter((d) => d.kind === 'external')
  const brudiDefs = external.filter((d) => d.source === 'brudi')
  const [brudiState, setBrudiState] = useState<'idle' | 'laden' | 'fehler' | 'ohne'>('idle')
  const brudiIds = brudiDefs.map((d) => d.id).join(',')
  const brudiPerson = state.meta.brudiPerson ?? ''

  useEffect(() => {
    if (!brudiIds) return
    // Ohne gewaehltes Konto gibt es nichts zu holen — im Bestand liegen zwei,
    // und raten waere hier die schlechteste aller Moeglichkeiten.
    if (!brudiPerson) { setBrudiState('ohne'); return }

    let ab = false
    setBrudiState('laden')
    void fetchBrudi(brudiPerson, addDays(checkerToday(), -180)).then((rows) => {
      if (ab) return
      setBrudiState(rows.length ? 'idle' : 'fehler')
      if (!rows.length) return

      // Nur die Rubriken, die auch tatsaechlich dastehen — wer die Makros
      // nicht aus dem Regal geholt hat, bekommt sie nicht durch die Hintertuer.
      const wanted = new Set(brudiIds.split(','))

      update((d) => {
        // Steht ein Konto, gehoeren auch die Makros dazu. Was rausgeworfen
        // wurde, bleibt draussen.
        const neu = ensureSourceChecks(d, 'brudi')
        const nimm = new Set([...wanted, ...d.checks.filter((c) => c.source === 'brudi').map((c) => c.id)])
        for (const row of rows) {
          const day = (d.days[row.date] ??= blankDay(row.date))
          const weg = new Set(day.dropped ?? [])
          for (const [key, v] of Object.entries(row.values)) {
            if (weg.has(key)) continue
            if (!nimm.has(key) && !BRUDI_HIDDEN_KEYS.has(key)) continue
            if (day.values[key] !== v) day.values[key] = v
          }
        }
        if (neu.length) setTimeout(() => toast(`${neu.join(', ')} dazu`), 0)
      })
    })
    return () => { ab = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brudiIds, brudiPerson, userId])

  /**
   * Dasselbe vom Ring. Getrennt von der Essens-Quelle, weil es ueber eine
   * Edge Function laeuft: Oura gibt Browser-Aufrufen keine CORS-Freigabe,
   * und das Zugangstoken haette im Bundle ohnehin nichts verloren.
   *
   * Eine Sonderregel fuer `sleep`: der Ring fuellt die Rubrik **nur, wo sie
   * leer ist**. Die Rubrik gab es lange vor dem Ring und sie ist von Hand
   * gefuehrt worden; rueckwirkend hundert abgeschlossene Tage zu ueberschreiben
   * waere keine Verbesserung, sondern Geschichtsklitterung. Ab heute ist das
   * Feld frueh am Morgen leer und der Ring traegt es ein — genau das war der
   * Wunsch. Dasselbe gilt fuer die Bettzeit.
   */
  /*
   * Wann neu gefragt wird.
   *
   * Beim Laden reicht nicht: das Verbinden passiert in einem zweiten Tab, und
   * wenn man von dort zurueckkommt, hat sich am Zustand der App nichts
   * geaendert — der Effekt lief nie wieder, die Verbindung stand, und im
   * Checker war trotzdem nichts zu sehen. Also auch, wenn die Seite wieder
   * nach vorn kommt.
   */
  const [ouraTick, setOuraTick] = useState(0)
  const ouraZuletzt = useRef(0)
  useEffect(() => {
    // Nicht bei jedem Tabwechsel: 180 Tage sind vier Abrufe drueben, und
    // Oura zaehlt mit. Fuenf Minuten sind fuer "gerade verbunden" schnell
    // genug und fuer den Rest des Tages ruhig genug.
    const wach = () => {
      if (document.hidden) return
      if (Date.now() - ouraZuletzt.current < 5 * 60_000) return
      ouraZuletzt.current = Date.now()
      setOuraTick((n) => n + 1)
    }
    document.addEventListener('visibilitychange', wach)
    window.addEventListener('focus', wach)
    return () => {
      document.removeEventListener('visibilitychange', wach)
      window.removeEventListener('focus', wach)
    }
  }, [])

  useEffect(() => {
    if (!userId) return
    let ab = false
    void fetchOura(addDays(checkerToday(), -180), checkerToday()).then((res) => {
      if (ab || !res.connected) return
      update((d) => {
        // Der Ring ist verbunden — dann gehoeren seine Rubriken auch her.
        const neu = ensureSourceChecks(d, 'oura')
        applyOuraDays(d, res.days, blankDay)
        if (neu.length) setTimeout(() => toast(`${neu.join(', ')} dazu`), 0)
      })
    })
    return () => { ab = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ouraTick])

  /**
   * Der heutige Tag startet mit den Werten vom letzten Mal — eingetragen,
   * nicht als Vorschlag. Nur fuer heute: aeltere Tage rueckwirkend zu fuellen
   * wuerde Daten erfinden, die es nie gab. Gezaehlt wird der Tag davon
   * nicht — dazu muss er bestaetigt werden.
   *
   * Jeder Check bekommt seine Uebernahme genau einmal, vermerkt in
   * `day.carried`. Vorher lief das bei jedem Durchlauf neu, und ein per
   * Ruecktaste geleertes Zahlenfeld war sofort wieder voll — loeschen ging
   * schlicht nicht. Eine Rubrik, die es heute noch gar nicht gab, steht nicht
   * im Vermerk und holt sich ihre Uebernahme nach, sobald sie da ist.
   */
  useEffect(() => {
    if (date !== checkerToday()) return
    const day = state.days[date]
    const hatte = new Set(day?.carried ?? [])
    const offen = Object.entries(carried).filter(([id]) => !hatte.has(id) && !isFilled(day?.values[id]))
    const neu = Object.keys(carried).filter((id) => !hatte.has(id))
    if (!neu.length) return
    update((d) => {
      const entry = (d.days[date] ??= blankDay(date))
      for (const [id, v] of offen) if (!isFilled(entry.values[id])) entry.values[id] = v
      entry.carried = [...hatte, ...neu]
    })
  }, [date, carried, state.days])

  const isToday = date === checkerToday()
  /**
   * Zwischen Mitternacht und sechs meint der Checker noch den Vortag. Dann
   * darf ueber der Seite nicht "heute" stehen — sonst traegt man im guten
   * Glauben Werte in einen Tag, der auf der Uhr schon vorbei ist. In dem
   * Fenster steht das Datum da, sonst wie gehabt.
   */
  const isWallToday = date === today()

  /**
   * Blaettern. Ueber den Tag hinaus geht es nicht — morgen ist noch nicht
   * passiert.
   *
   * Danach zurueck nach oben: nach einem Dutzend Rubriken steht man weit
   * unten, und ein neu aufgeschlagener Tag faengt dann mitten im Formular an,
   * ohne dass man das Datum sieht.
   */
  function goDay(step: number) {
    if (step > 0 && isToday) return
    setDate(addDays(date, step))
    window.scrollTo(0, 0)
  }

  // Wischen blaettert genauso: nach links das Naechste, nach rechts zurueck.
  useSwipe({ onLeft: () => goDay(1), onRight: () => goDay(-1) })

  /** Direkt an einen Schluessel im Tag schreiben — fuer die Uhrzeit neben dem Wert. */
  function setRaw(key: string, value: CheckValue) {
    update((d) => {
      const day = (d.days[date] ??= blankDay(date))
      if (value === null) delete day.values[key]
      else day.values[key] = value
      // Einmal von Hand angefasst heisst: nicht wieder ueberschreiben.
      day.carried = [...new Set([...(day.carried ?? []), key])]
    })
  }

  function setValue(def: CheckDef, value: CheckValue) {
    update((d) => {
      const day = (d.days[date] ??= blankDay(date))
      if (value === null) delete day.values[def.id]
      else day.values[def.id] = value
    })
  }

  /**
   * Der Tag wird festgeschrieben. Erst jetzt zaehlt er fuer Serie, Statistik
   * und Zusammenhaenge — vorher stehen die Werte nur im Formular.
   */
  function confirmDay() {
    const sc = scoreDay(state, date)
    update((d) => {
      const day = (d.days[date] ??= blankDay(date))
      day.confirmed = true
    })
    toast(sc.total > 0 && sc.filled === sc.total ? 'Tag vollständig' : 'Tag bestätigt')
  }

  function unconfirmDay() {
    update((d) => { const day = d.days[date]; if (day) day.confirmed = false })
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
  /** Wo der Finger gerade ist. Als Ref, damit die Rollschleife ihn sieht,
      ohne bei jedem Bild neu aufgesetzt zu werden. */
  const zeigerY = useRef<number | null>(null)
  const [reorder, setReorder] = useState<{ id: string; x: number; y: number; order: string[] } | null>(null)

  const shownDefs = reorder
    ? (reorder.order.map((id) => defs.find((d) => d.id === id)).filter(Boolean) as CheckDef[])
    : defs

  function startReorder(e: React.PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    zeigerY.current = e.clientY
    setReorder({ id, x: e.clientX, y: e.clientY, order: defs.map((d) => d.id) })
  }

  useEffect(() => {
    if (!reorder) return

    const onMove = (e: PointerEvent) => {
      zeigerY.current = e.clientY
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

    /*
     * Mitscrollen, solange gezogen wird.
     *
     * Der Griff hat `touch-action: none`, sonst wuerde jeder Zug die Seite
     * scrollen statt die Karte zu bewegen. Damit ist aber auch das normale
     * Scrollen weg, und eine Karte liess sich nur innerhalb des Bildschirms
     * verschieben — bei zwanzig Rubriken kommt man so nie von unten nach oben.
     *
     * Also: kommt der Finger einem Rand nahe, rollt die Seite selbst, und
     * zwar schneller, je naeher er dran ist. Der Zug laeuft dabei weiter, die
     * Karte bleibt am Finger.
     */
    const RAND = 90          // ab hier faengt es an
    const TEMPO = 14         // Pixel je Bild bei voller Naehe
    let schieber = 0

    const rollen = () => {
      const y = zeigerY.current
      if (y === null) { schieber = 0; return }
      const oben = y - RAND
      const unten = window.innerHeight - RAND - y
      let d = 0
      if (oben < 0) d = (oben / RAND) * TEMPO
      else if (unten < 0) d = (-unten / RAND) * TEMPO
      if (d !== 0) window.scrollBy(0, d)
      schieber = requestAnimationFrame(rollen)
    }
    schieber = requestAnimationFrame(rollen)

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      cancelAnimationFrame(schieber)
      zeigerY.current = null
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
          <div className="eyebrow eyebrow--row">
            Everything Checker
            {/* Ob der Tag festgeschrieben ist, steht ganz oben — sonst sieht
                man es erst, wenn man bis zur Leiste ganz unten gescrollt hat. */}
            {defs.length > 0 && (
              <span className={'daymark' + (confirmed ? ' daymark--done' : '')}>
                {confirmed ? <Check /> : <i className="daymark-ring" />}
                {confirmed ? 'bestätigt' : 'offen'}
              </span>
            )}
          </div>
          <h1 className="display">{isWallToday ? <>Wie war <em>heute</em>?</> : longDate(date)}</h1>
        </div>
        <div className="datepick">
          <button className="arrowbtn" onClick={() => goDay(-1)} aria-label="Tag zurück"><ChevL /></button>
          <div className="datepick-label">{isWallToday ? 'Heute' : longDate(date)}</div>
          <button className="arrowbtn" disabled={isToday} onClick={() => goDay(1)} aria-label="Tag vor"><ChevR /></button>
          {!isToday && <button className="btn btn--quiet btn--sm" onClick={() => setDate(checkerToday())}>Zurück zu heute</button>}
        </div>
      </div>

      {defs.length === 0 ? (
        /* Frisch angefangen: es gibt noch nichts zu zeigen und nichts zu
           bestaetigen. Nur die Frage, was man ueberhaupt wissen will. */
        <div className="empty">
          <strong>Noch keine Rubriken.</strong>
          Such dir im Regal aus, was du über dich wissen willst — oder leg dir
          eigene an. Beides lässt sich jederzeit ändern.
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => setPicking(true)}>Regal öffnen</button>
            <button className="btn btn--ghost" onClick={() => setAdding(true)}>Eigene anlegen</button>
          </div>
        </div>
      ) : (
      <>
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

      {/* Kopfzeile der Liste. Der Knopf stand vorher allein rechts in der
          Luft — ohne etwas daneben sah er aus, als waere er uebrig geblieben.
          Mit der Zahl links und einer Haarlinie darunter gehoert die Zeile
          sichtbar zu dem, was darunter kommt. */}
      {shownDefs.length > 1 && (
        <div className="grid-head">
          <span className="grid-head-k">{shownDefs.length} Rubriken</span>
          <button className="btn btn--quiet btn--sm" onClick={() => setSorting(true)}>
            <Sort /> Ordnen
          </button>
        </div>
      )}

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
            time={(entry?.values[timeKey(def.id)] as string) ?? ''}
            onTime={(v) => setRaw(timeKey(def.id), v || null)}
            endTime={(entry?.values[endKey(def.id)] as string) ?? ''}
            onEndTime={(v) => setRaw(endKey(def.id), v || null)}
            onOpen={() => setStats(def)}
            onAddOption={(o) => addOption(def, o)}
            onRemoveOption={(o) => removeOption(def, o)}
            externalState={def.kind === 'external' ? brudiState : undefined}
            dayValues={entry?.values}
            dropped={(entry?.dropped ?? []).includes(def.id)}
          />
        ))}

        <button
          className="check"
          style={{ alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)', borderStyle: 'dashed', background: 'transparent', boxShadow: 'none' }}
          onClick={() => setPicking(true)}
        >
          <Plus /> <span style={{ fontSize: 14, fontWeight: 550 }}>Noch was tracken</span>
        </button>
      </div>

      <ConfirmBar
        confirmed={confirmed}
        score={score}
        onConfirm={confirmDay}
        onUndo={unconfirmDay}
      />
      </>
      )}

      {picking && (
        <CheckPicker
          onClose={() => setPicking(false)}
          onOwn={() => { setPicking(false); setAdding(true) }}
        />
      )}

      {sorting && (
        <SortSheet
          defs={defs}
          values={entry?.values ?? {}}
          onClose={() => setSorting(false)}
        />
      )}

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

/**
 * Sortieren.
 *
 * Der Griff an der Karte bleibt der Weg fuer die eine Rubrik, die zwei Plaetze
 * weiter soll. Fuer "alles alphabetisch" war er nie gedacht — bei zwanzig
 * Rubriken ist das zwanzigmal ziehen.
 *
 * Jede Wahl schreibt die Reihenfolge fest, wie der Griff auch. Es gibt kein
 * "sortiert angezeigt" neben einer anderen echten Reihenfolge: zwei
 * Reihenfolgen nebeneinander sind eine mehr, als man im Kopf behalten will.
 */
function SortSheet({ defs, values, onClose }: {
  defs: CheckDef[]
  values: Record<string, CheckValue>
  onClose: () => void
}) {
  const ARTEN: CheckKind[] = ['external', 'number', 'scale', 'bool', 'multi', 'choice', 'text']

  /* Die Reihenfolge wird hier bearbeitet und erst beim Schliessen
     festgeschrieben. Sonst schreibt jeder Zug in den Bestand und schiebt
     einen Abgleich an. */
  const [reihe, setReihe] = useState<CheckDef[]>(defs)
  const [zieht, setZieht] = useState<string | null>(null)
  /* Was rausfliegen soll. Erst beim Schliessen wirklich — ein Tipp daneben
     soll nicht gleich eine Rubrik kosten, und bis dahin holt derselbe Knopf
     sie zurueck. */
  const [raus, setRaus] = useState<string[]>([])

  const liste = useRef<HTMLOListElement>(null)
  const zeilen = useRef(new Map<string, HTMLLIElement | null>())
  const zeigerY = useRef<number | null>(null)

  /**
   * Ziehen in der Liste.
   *
   * Die Zeile unter dem Finger bestimmt den Platz — dasselbe Verfahren wie
   * bei den Karten im Checker, nur senkrecht. Der Unterschied: hier scrollt
   * nicht die Seite, sondern das Blatt, also rollt auch das Blatt mit.
   */
  function fasse(e: React.PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    // Die **Liste** faengt den Zeiger, nicht der Griff.
    //
    // Sobald sich die Reihenfolge das erste Mal aendert, setzt React die
    // Zeile im DOM um — und ein Element, das aus dem Dokument genommen wird,
    // verliert seine Zeiger-Erfassung. Danach gingen die Ereignisse an den
    // Griff darunter, dessen Kennung eine andere ist, und das Ziehen blieb
    // nach genau einem Platz stehen. Die Liste bleibt, wo sie ist.
    liste.current?.setPointerCapture(e.pointerId)
    zeigerY.current = e.clientY
    setZieht(id)
  }

  function fuehre(e: React.PointerEvent) {
    const id = zieht
    if (!id) return
    zeigerY.current = e.clientY
    setReihe((cur) => {
      const von = cur.findIndex((d) => d.id === id)
      if (von < 0) return cur
      let nach = von
      for (let i = 0; i < cur.length; i++) {
        if (i === von) continue
        const el = zeilen.current.get(cur[i].id)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (e.clientY >= r.top && e.clientY <= r.bottom) { nach = i; break }
      }
      if (nach === von) return cur
      const next = [...cur]
      next.splice(nach, 0, ...next.splice(von, 1))
      return next
    })
  }

  function lass(e: React.PointerEvent) {
    if (liste.current?.hasPointerCapture(e.pointerId)) liste.current.releasePointerCapture(e.pointerId)
    zeigerY.current = null
    setZieht(null)
  }

  // Mitrollen, solange gezogen wird — sonst kommt man in einem Blatt mit
  // zwanzig Zeilen nicht von unten nach oben.
  useEffect(() => {
    if (!zieht) return
    const topf = liste.current?.closest('.sheet-body') as HTMLElement | null
    if (!topf) return
    const RAND = 64
    const TEMPO = 10
    let schieber = 0
    const rollen = () => {
      const y = zeigerY.current
      if (y !== null) {
        const r = topf.getBoundingClientRect()
        const oben = y - (r.top + RAND)
        const unten = (r.bottom - RAND) - y
        if (oben < 0) topf.scrollBy(0, (oben / RAND) * TEMPO)
        else if (unten < 0) topf.scrollBy(0, (-unten / RAND) * TEMPO)
      }
      schieber = requestAnimationFrame(rollen)
    }
    schieber = requestAnimationFrame(rollen)
    return () => cancelAnimationFrame(schieber)
  }, [zieht])

  function sortieren(cmp: (a: CheckDef, b: CheckDef) => number) {
    setReihe([...reihe].sort(cmp))
  }

  function fertig() {
    const ids = reihe.map((d) => d.id)
    update((d) => {
      ids.forEach((id, i) => {
        const c = d.checks.find((x) => x.id === id)
        if (c) c.sort = (i + 1) * 10
      })
      // Ueber `dropCheck`, damit eine verbundene Quelle sie nicht beim
      // naechsten Start wieder nachtraegt.
      for (const id of raus) dropCheck(d, id)
    })
    if (raus.length) toast(`${raus.length} ${raus.length === 1 ? 'Rubrik' : 'Rubriken'} entfernt`)
    onClose()
  }

  const nachName = (a: CheckDef, b: CheckDef) => a.name.localeCompare(b.name, 'de')

  return (
    <Sheet
      title="Rubriken ordnen"
      onClose={fertig}
      footer={
        <>
          {raus.length > 0 && (
            <span style={{ marginRight: 'auto', fontSize: 13, color: 'var(--ink-3)' }}>
              {raus.length} {raus.length === 1 ? 'Rubrik fliegt' : 'Rubriken fliegen'} raus — erfasste Tage bleiben
            </span>
          )}
          <button className="btn btn--primary" onClick={fertig}>Fertig</button>
        </>
      }
    >
      {/* Erst die vier Handgriffe, die zwanzig Pfeiltipps ersparen. */}
      <div className="sortquick">
        <button className="btn btn--quiet btn--sm" onClick={() => sortieren(nachName)}>A–Z</button>
        <button className="btn btn--quiet btn--sm" onClick={() => sortieren((a, b) => {
          const d = ARTEN.indexOf(a.kind) - ARTEN.indexOf(b.kind)
          return d !== 0 ? d : nachName(a, b)
        })}>Nach Art</button>
        <button className="btn btn--quiet btn--sm" onClick={() => sortieren((a, b) => {
          const d = Number(isFilled(values[a.id])) - Number(isFilled(values[b.id]))
          return d !== 0 ? d : reihe.indexOf(a) - reihe.indexOf(b)
        })}>Offene zuerst</button>
        <button className="btn btn--quiet btn--sm" onClick={() => setReihe([...reihe].reverse())}>Umdrehen</button>
      </div>

      {/* Die Liste zum Ziehen. Angefasst wird am Griff, nicht an der Zeile —
          sonst faengt jeder Tipp auf einen Namen einen Zug an. */}
      <ol
        className="sortlist"
        ref={liste}
        onPointerMove={fuehre}
        onPointerUp={lass}
        onPointerCancel={lass}
      >
        {reihe.map((d, i) => (
          <li
            key={d.id}
            ref={(el) => { zeilen.current.set(d.id, el) }}
            className={'sortrow' + (zieht === d.id ? ' sortrow--dragging' : '') + (raus.includes(d.id) ? ' sortrow--raus' : '')}
          >
            <span className="sortrow-n">{i + 1}</span>
            <span className="sortrow-name">{d.name}</span>
            <span className="sortrow-art">{kindLabel(d)}</span>
            <button
              className="iconbtn sortrow-weg"
              aria-label={raus.includes(d.id) ? `${d.name} behalten` : `${d.name} entfernen`}
              title={raus.includes(d.id) ? 'doch behalten' : 'entfernen'}
              onClick={() => setRaus((cur) => cur.includes(d.id) ? cur.filter((x) => x !== d.id) : [...cur, d.id])}
            >{raus.includes(d.id) ? <Plus /> : <Trash />}</button>
            <button
              className="grip sortrow-grip"
              aria-label={`${d.name} verschieben`}
              onPointerDown={(e) => fasse(e, d.id)}
            ><Grip /></button>
          </li>
        ))}
      </ol>
    </Sheet>
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
  time: string
  onTime: (v: string) => void
  endTime: string
  onEndTime: (v: string) => void
  onOpen: () => void
  onAddOption: (option: string) => void
  onRemoveOption: (option: string) => void
  /** nur bei gelesenen Rubriken gesetzt */
  externalState?: 'idle' | 'laden' | 'fehler' | 'ohne' | 'verworfen'
  /** Alle Werte des Tages — die Kalorien-Kachel zeigt die Makros mit an. */
  dayValues?: Record<string, CheckValue>
  /** Fuer diesen Tag weggeworfen? Nur bei gelesenen Rubriken. */
  dropped?: boolean
}

function CheckCard({ def, value, goalNames, cardRef, dragging, onGrip, onChange, time, onTime, endTime, onEndTime, onOpen, onAddOption, onRemoveOption, externalState, dayValues, dropped }: CardProps) {
  const filled = isFilled(value)

  /**
   * Die ganze Kachel oeffnet die Statistik — der Name allein waere auf dem
   * Handy ein 50 px breites Ziel. Alles, womit man den Wert eintraegt, behaelt
   * seinen eigenen Klick: Knoepfe, Felder, der Griff zum Verschieben.
   */
  const openFromCard = (e: React.MouseEvent) => {
    // `.scale` muss mit in die Liste: die Tasten darin nehmen keine Ereignisse
    // mehr an (sonst gaebe es kein Ziehen), also landet der Klick auf dem
    // Behaelter — und der ist ein div, das ohne diesen Zusatz als "irgendwo
    // auf die Kachel" durchginge.
    if ((e.target as HTMLElement).closest('button, input, textarea, select, label, a, .scale')) return
    onOpen()
  }

  return (
    <div
      ref={cardRef}
      className={'check' + (filled ? ' check--filled' : '') + (dragging ? ' check--moving' : '')}
      onClick={openFromCard}
    >
      <div className="check-top">
        <button onClick={onOpen} className="check-name" style={{ textAlign: 'left' }} title="Statistik ansehen">{def.name}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Bei einer Dauer stehen die Einheiten schon an den Feldern; oben
              noch einmal "h" waere neben "7 h 43 min" schlicht falsch. */}
          {def.unit && !def.asDuration && <span className="check-unit">{def.unit}</span>}
          <button className="grip" onPointerDown={onGrip} aria-label="Verschieben" title="Verschieben"><Grip /></button>
        </div>
      </div>

      <Input def={def} value={value} onChange={onChange} time={time} onTime={onTime} endTime={endTime} onEndTime={onEndTime} onAddOption={onAddOption} onRemoveOption={onRemoveOption} externalState={dropped ? 'verworfen' : externalState} dayValues={dayValues} />

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

function Input({ def, value, onChange, time, onTime, endTime, onEndTime, onAddOption, onRemoveOption, externalState, dayValues }: {
  def: CheckDef
  value: CheckValue
  onChange: (v: CheckValue) => void
  time: string
  onTime: (v: string) => void
  endTime: string
  onEndTime: (v: string) => void
  onAddOption: (option: string) => void
  onRemoveOption: (option: string) => void
  externalState?: 'idle' | 'laden' | 'fehler' | 'ohne' | 'verworfen'
  dayValues?: Record<string, CheckValue>
}) {
  switch (def.kind) {
    case 'external':
      return <ExternalValue def={def} value={value} state={externalState} day={dayValues} />
    case 'bool':
      return (
        <div className="bool">
          <button className="yes" aria-pressed={value === true} onClick={() => onChange(value === true ? null : true)}>Ja</button>
          <button aria-pressed={value === false} onClick={() => onChange(value === false ? null : false)}>Nein</button>
        </div>
      )
    case 'scale':
      return <ScaleInput value={value} onChange={onChange} />
    case 'number': {
      const step = def.step ?? 1
      const num = typeof value === 'number' ? value : null

      // Eine Dauer in einem Feld: 7:43. Zwei Felder waren ein Feld zu viel —
      // man tippt die Stunde, springt, tippt die Minuten.
      if (def.asDuration) {
        return (
          <>
            <DurationInput value={num} onChange={onChange} />
            {def.withTime && (
              <div className="timespan">
                <label className="timefield">
                  <span>ab</span>
                  <input type="time" value={time} onChange={(e) => onTime(e.target.value)} />
                </label>
                <label className="timefield">
                  <span>bis</span>
                  <input type="time" value={endTime} onChange={(e) => onEndTime(e.target.value)} />
                </label>
              </div>
            )}
          </>
        )
      }

      const bump = (dir: number) => onChange(Math.max(0, Math.round(((num ?? 0) + dir * step) * 100) / 100))
      return (
        <>
          <div className="stepper">
            <button onClick={() => bump(-1)} aria-label="weniger">−</button>
            <input
              type="number" inputMode="decimal" step={step} min={0}
              value={num ?? ''} placeholder="–"
              onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            />
            <button onClick={() => bump(1)} aria-label="mehr">+</button>
          </div>
          {def.withTime && (
            /* Von wann bis wann. Zwei Felder nebeneinander, damit klar ist,
               dass es eine Spanne ist und nicht zwei Angaben. */
            <div className="timespan">
              <label className="timefield">
                <span>ab</span>
                <input type="time" value={time} onChange={(e) => onTime(e.target.value)} />
              </label>
              <label className="timefield">
                <span>bis</span>
                <input type="time" value={endTime} onChange={(e) => onEndTime(e.target.value)} />
              </label>
            </div>
          )}
        </>
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

/**
 * Eine Dauer in einem Feld.
 *
 * Angezeigt wird `7:43`. Eingetippt werden darf mehr, weil es keinen Grund
 * gibt, jemanden auf eine Schreibweise festzunageln: `7:43`, `7`, `7,5`,
 * `7.5`, `7h43`, `7 43`. Was nicht zu lesen ist, bleibt stehen, bis das Feld
 * den Fokus verliert — sonst springt einem die Eingabe beim Tippen weg.
 */
function DurationInput({ value, onChange }: { value: number | null; onChange: (v: CheckValue) => void }) {
  const zeige = (h: number | null) => {
    if (h === null) return ''
    const min = Math.round(h * 60)
    return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
  }

  const [text, setText] = useState(() => zeige(value))
  const getippt = useRef(false)

  // Kommt der Wert von aussen — vom Ring, oder weil der Tag gewechselt hat —,
  // muss das Feld nachziehen. Waehrend man selbst tippt aber nicht.
  useEffect(() => {
    if (!getippt.current) setText(zeige(value))
  }, [value])

  function lesen(roh: string): number | null | undefined {
    const t = roh.trim().toLowerCase().replace(/\s+/g, '')
    if (!t) return null
    let m = /^(\d{1,2})[:h](\d{1,2})?(?:m|min)?$/.exec(t)
    if (m) {
      const min = Number(m[2] ?? 0)
      if (min > 59) return undefined
      return (Number(m[1]) * 60 + min) / 60
    }
    m = /^(\d{1,2})[.,](\d+)$/.exec(t)
    if (m) return Math.round(Number(`${m[1]}.${m[2]}`) * 60) / 60
    m = /^(\d{1,2})h?$/.exec(t)
    if (m) return Number(m[1])
    return undefined
  }

  return (
    <label className="duration">
      <input
        type="text" inputMode="numeric" placeholder="–"
        value={text}
        onFocus={() => { getippt.current = true }}
        onChange={(e) => {
          setText(e.target.value)
          const v = lesen(e.target.value)
          if (v !== undefined) onChange(v)
        }}
        onBlur={() => {
          getippt.current = false
          const v = lesen(text)
          // Unlesbares zurueck auf den letzten gueltigen Stand.
          setText(zeige(v === undefined ? value : v))
        }}
      />
      <span>h : min</span>
    </label>
  )
}

/**
 * Die Skala. Tippen geht, Ziehen auch.
 *
 * Zehn Tasten sind auf dem Handy 28 Pixel breit — einzeln zu treffen ist
 * machbar, aber niemand tippt sich zur richtigen Zahl vor. Mit dem Finger
 * drueberzufahren ist der natuerlichere Weg, und die Zahl geht mit.
 *
 * Die Taste unter dem Finger wird aus den Rechtecken gesucht, nicht aus der
 * Breite gerechnet: auf breiten Karten stehen die zehn in zwei Reihen, und
 * ein Dreisatz ueber die Gesamtbreite laege dort daneben.
 */
function ScaleInput({ value, onChange }: { value: CheckValue; onChange: (v: CheckValue) => void }) {
  const box = useRef<HTMLDivElement>(null)
  /** Beim Aufsetzen dieselbe Zahl wie bisher? Dann loescht ein Tipp sie —
      aber nur, solange der Finger nicht weitergewandert ist. */
  const loeschen = useRef(false)

  function unterm(x: number, y: number): number | null {
    const el = box.current
    if (!el) return null
    const tasten = [...el.querySelectorAll('button')]
    if (!tasten.length) return null
    // Zuerst die Reihe, in der der Finger liegt.
    const reihe = tasten.filter((t) => {
      const r = t.getBoundingClientRect()
      return y >= r.top && y <= r.bottom
    })
    const feld = reihe.length ? reihe : tasten
    let beste = feld[0]
    let nah = Infinity
    for (const t of feld) {
      const r = t.getBoundingClientRect()
      const d = Math.abs(x - (r.left + r.width / 2))
      if (d < nah) { nah = d; beste = t }
    }
    const n = Number(beste.textContent)
    return Number.isFinite(n) ? n : null
  }

  function down(e: React.PointerEvent) {
    const n = unterm(e.clientX, e.clientY)
    if (n === null) return
    e.currentTarget.setPointerCapture(e.pointerId)
    loeschen.current = value === n
    if (value !== n) onChange(n)
  }

  function move(e: React.PointerEvent) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const n = unterm(e.clientX, e.clientY)
    if (n === null || n === value) return
    loeschen.current = false
    onChange(n)
  }

  function up(e: React.PointerEvent) {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (loeschen.current) onChange(null)
    loeschen.current = false
  }

  return (
    <div
      ref={box}
      className="scale"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      {Array.from({ length: SCALE_MAX }, (_, i) => i + 1).map((n) => (
        // Die Tasten selbst hoeren nicht mehr zu — der Behaelter macht das,
        // sonst haette jede ihren eigenen Klick und das Ziehen faende nie statt.
        <button key={n} type="button" tabIndex={-1} aria-pressed={value === n} title={scaleLabel(n)}>{n}</button>
      ))}
    </div>
  )
}

/** Gelesene Rubrik: zeigt nur an, was die Quelle liefert. */
function ExternalValue({ def, value, state, day }: {
  def: CheckDef
  value: CheckValue
  state?: 'idle' | 'laden' | 'fehler' | 'ohne' | 'verworfen'
  /** Die uebrigen Werte des Tages — fuer die Makros unter den Kalorien. */
  day?: Record<string, CheckValue>
}) {
  const n = typeof value === 'number' ? value : null

  /* Die Makros gehoeren zur Mahlzeit, nicht neben sie. Eine Zeile unter der
     Zahl, klein, in der Reihenfolge Eiweiss / Kohlenhydrate / Fett. Fehlt
     einer, faellt er weg statt als Null dazustehen. */
  const makros = def.id === 'brudi_kcal' && day
    ? BRUDI_MACROS
        .map((m) => ({ name: m.name, v: day[m.key] }))
        .filter((m): m is { name: string; v: number } => typeof m.v === 'number')
    : []

  if (n === null) {
    return (
      <div className="ext ext--empty">
        {state === 'verworfen' ? 'für diesen Tag verworfen'
          : state === 'laden' ? 'wird geholt …'
          : state === 'ohne' ? 'kein Kalorienbrudi-Konto gewählt — im Konto einstellen'
          : state === 'fehler' ? 'Quelle nicht erreichbar'
          : 'für diesen Tag nichts erfasst'}
      </div>
    )
  }

  return (
    <div className="ext">
      <div className="ext-row">
        <span className="ext-value">{Math.round(n).toLocaleString('de-DE')}</span>
        {def.unit && <span className="ext-target">{def.unit}</span>}
      </div>
      {makros.length > 0 && (
        <div className="ext-macros">
          {makros.map((m) => (
            <span key={m.name}>
              <b>{Math.round(m.v)}</b> g {m.name === 'Kohlenhydrate' ? 'KH' : m.name}
            </span>
          ))}
        </div>
      )}
      {/* Bis hierher stand auf jeder gelesenen Karte "aus Kalorienbrudi" —
          auch auf denen vom Ring. */}
      <div className="ext-note">{def.source === 'oura' ? 'vom Oura-Ring' : 'aus Kalorienbrudi'}</div>
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

/** Der Abschluss des Tages. Ohne ihn zaehlt nichts von oben. */
function ConfirmBar({ confirmed, score, onConfirm, onUndo }: {
  confirmed: boolean
  score: { filled: number; total: number }
  onConfirm: () => void
  onUndo: () => void
}) {
  if (confirmed) {
    return (
      <div className="confirm confirm--done">
        <span className="confirm-text">
          <b>Tag bestätigt.</b> Er zählt in Serie, Statistik und Zusammenhänge.
        </span>
        <button className="btn btn--quiet btn--sm" onClick={onUndo}>Wieder öffnen</button>
      </div>
    )
  }

  return (
    <div className="confirm">
      <span className="confirm-text">
        {score.filled === 0
          ? 'Noch nichts eingetragen.'
          : score.filled === score.total
            ? <><b>Alles ausgefüllt.</b> Bestätigen, damit der Tag zählt.</>
            : <><b>{score.filled} von {score.total}</b> ausgefüllt. Was vom letzten Mal steht, ist nur ein Vorschlag.</>}
      </span>
      <button className="btn btn--primary" onClick={onConfirm} disabled={score.filled === 0}>
        <Check /> Tag bestätigen
      </button>
    </div>
  )
}

/**
 * Das Regal: Vorlagen zum Aussuchen.
 *
 * Schon vorhanden ist eine Vorlage, wenn die Kennung passt — oder der Name.
 * Der Name zaehlt mit, weil dieselbe Rubrik schon mal unter eigener Kennung
 * angelegt worden sein kann; sonst haette man sie zweimal. Weggenommen wird
 * aber nur, was wirklich aus dem Regal kam: eine gleichnamige eigene Rubrik
 * anzufassen waere uebergriffig.
 */
function CheckPicker({ onClose, onOwn }: { onClose: () => void; onOwn: () => void }) {
  const { state } = useStore()
  const [q, setQ] = useState('')

  const byId = new Set(state.checks.map((c) => c.id))
  const byName = new Set(state.checks.map((c) => c.name.trim().toLowerCase()))
  const drin = (tpl: CheckTemplate) =>
    byId.has(tpl.def.id) || byName.has(tpl.def.name.trim().toLowerCase())

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return CHECK_CATALOG
    return CHECK_CATALOG
      .map((g) => ({ title: g.title, items: g.items.filter((i) =>
        (i.def.name + ' ' + g.title + ' ' + (i.note ?? '')).toLowerCase().includes(needle)) }))
      .filter((g) => g.items.length)
  }, [q])

  /* Keine Meldung beim Aufnehmen und Rausnehmen: die Zeile selbst wechselt
     zwischen Plus und Haken, das ist die Bestaetigung. Eine Meldung je Tipp
     war bei einem Dutzend Rubriken vor allem Flackern. Gemeldet wird nur,
     was man sonst nicht sieht — dass naemlich gerade nichts passiert ist. */
  function toggle(tpl: CheckTemplate) {
    if (byId.has(tpl.def.id)) {
      // Ueber `dropCheck`, damit eine verbundene Quelle sie nicht beim
      // naechsten Start wieder nachtraegt.
      update((d) => dropCheck(d, tpl.def.id))
      return
    }
    if (drin(tpl)) {
      toast(`„${tpl.def.name}" hast du schon, unter eigenem Namen`)
      return
    }
    update((d) => {
      const sort = Math.max(0, ...d.checks.map((c) => c.sort)) + 10
      d.checks.push({ ...tpl.def, sort })
    })
  }

  function addAll(items: CheckTemplate[]) {
    const fresh = items.filter((i) => !drin(i))
    if (!fresh.length) return
    update((d) => {
      let sort = Math.max(0, ...d.checks.map((c) => c.sort))
      for (const i of fresh) { sort += 10; d.checks.push({ ...i.def, sort }) }
    })
    toast(`${fresh.length} dabei`)
  }

  return (
    <Sheet
      title="Das Regal"
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn btn--quiet" style={{ marginRight: 'auto' }} onClick={onOwn}>
            Eigene anlegen
          </button>
          <button className="btn btn--primary" onClick={onClose}>Fertig</button>
        </>
      }
    >
      <input
        className="input" type="search"
        placeholder="Suchen — Schlaf, Kaffee, Laune …"
        value={q} onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocusUnlessTouch} {...noAutofill}
      />

      {groups.map((g) => (
        <section key={g.title}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
            <h4 style={{ margin: 0, fontFamily: 'var(--display)', fontWeight: 400, fontSize: 19 }}>{g.title}</h4>
            <button className="btn btn--quiet btn--sm" onClick={() => addAll(g.items)}>alle</button>
          </div>
          <div className="cat-grid">
            {g.items.map((i) => (
              <button
                key={i.def.id}
                className={'cat-row' + (drin(i) ? ' cat-row--added' : '')}
                onClick={() => toggle(i)}
                title={drin(i) ? 'Wieder rausnehmen' : 'Übernehmen'}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="cat-row-title">{i.def.name}</div>
                  <div className="cat-row-sub">{kindLabel(i.def)}{i.note ? ` · ${i.note}` : ''}</div>
                </div>
                <span className="cat-plus">{drin(i) ? <Check /> : '+'}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      {groups.length === 0 && (
        <div className="empty"><strong>Nichts gefunden.</strong>Leg es einfach selbst an.</div>
      )}
    </Sheet>
  )
}

/** Was fuer eine Art Rubrik das ist, in einem Wort. */
function kindLabel(def: CheckTemplate['def']): string {
  switch (def.kind) {
    case 'bool': return 'Ja / Nein'
    case 'scale': return 'Skala 1–10'
    case 'number': return def.unit ? `Zahl in ${def.unit}` : 'Zahl'
    case 'multi': return 'Mehrfachauswahl'
    case 'choice': return 'Auswahl'
    case 'text': return 'Notiz'
    case 'external': return 'gemessen'
  }
}

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
          <div className="meter">
            <div className="meter-fill" style={{ width: `${(days / MIN_DAYS) * 100}%` }} />
          </div>
          <span className="mono" style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{days}/{MIN_DAYS}</span>
        </div>
      </div>
    )
  }

  const solid = found.filter((i) => i.solid).slice(0, 6)
  const hints = found.filter((i) => !i.solid).slice(0, 3)

  if (!solid.length && !hints.length) {
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

  return (
    <section className="insights">
      <div className="insights-head">
        <h2 className="section-title">Was zusammenhängt</h2>
        <span className="insights-note">
          aus {days} Tagen · Zusammenhänge, keine Ursachen
        </span>
      </div>

      {solid.map((i) => <InsightRow key={insightKey(i)} i={i} />)}

      {hints.length > 0 && (
        <>
          <div className="insights-sub">
            Noch nicht gesichert — sieht so aus, könnte bei dieser Zahl an Tagen aber Zufall sein.
          </div>
          {hints.map((i) => <InsightRow key={insightKey(i)} i={i} />)}
        </>
      )}
    </section>
  )
}

/* ---------------------------------------------------------------- */

const KINDS: { k: CheckKind; label: string }[] = [
  { k: 'bool', label: 'Ja / Nein' },
  { k: 'scale', label: 'Skala 1–10' },
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
    update((d) => dropCheck(d, def.id))
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
