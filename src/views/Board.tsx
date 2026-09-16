import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore, update, uid, commit } from '../lib/store'
import type { BoardFrame, BoardNode, NodeColor } from '../lib/types'
import { goalMomentum } from '../lib/scoring'
import { ChevR, Link, Plus, Trash } from '../components/Icons'
import { isTouch } from '../lib/device'

const COLORS: NodeColor[] = ['slate', 'cobalt', 'signal', 'moss', 'plum', 'amber']
const NODE_W = 208
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2.5

type Sel = { kind: 'node' | 'frame' | 'edge'; id: string } | null

interface Drag {
  kind: 'pan' | 'node' | 'frame' | 'resize' | 'connect'
  id?: string
  startX: number
  startY: number
  origin: { x: number; y: number }
  /** bei Frame-Drag: welche Nodes mitwandern */
  carried?: { id: string; x: number; y: number }[]
  frameSize?: { w: number; h: number }
  /** war das Element beim Anfassen schon ausgewaehlt? */
  wasSelected?: boolean
  moved: boolean
}

export function Board() {
  const { state } = useStore()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState({ x: 120, y: 120, z: 1 })
  const [sel, setSel] = useState<Sel>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [wire, setWire] = useState<{ from: string; x: number; y: number } | null>(null)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  /** Knoten, auf dem der gezogene gerade schwebt — daraus wird beim Loslassen eine Linie. */
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  /** Weiche Fahrt beim Anspringen eines Bereichs — nur dann, sonst ruckelt das Ziehen. */
  const [gliding, setGliding] = useState(false)
  const [hotFrame, setHotFrame] = useState<string | null>(null)
  const [indexOpen, setIndexOpen] = useState(!isTouch)

  /** Alle Finger, die gerade auf dem Board liegen. */
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  /** Aktiv, sobald zwei Finger drauf sind — hat Vorrang vor jedem Ziehen. */
  const pinch = useRef<{ dist: number; cx: number; cy: number; view: typeof view } | null>(null)
  /** Damit der Effekt unten immer den aktuellen Zoom sieht, ohne neu zu binden. */
  const viewRef = useRef(view)
  viewRef.current = view

  const { nodes, frames, edges } = state

  /* ------------------ Koordinaten ------------------ */

  const toWorld = useCallback((clientX: number, clientY: number) => {
    const r = wrapRef.current!.getBoundingClientRect()
    const v = viewRef.current
    return { x: (clientX - r.left - v.x) / v.z, y: (clientY - r.top - v.y) / v.z }
  }, [])

  /* ------------------ Groessen messen ------------------ */

  const measure = useCallback((id: string, el: HTMLElement | null) => {
    if (!el) return
    setSizes((cur) => {
      const w = el.offsetWidth
      const h = el.offsetHeight
      if (cur[id]?.w === w && cur[id]?.h === h) return cur
      return { ...cur, [id]: { w, h } }
    })
  }, [])

  /* ------------------ Mutationen ------------------ */

  function addNode(x: number, y: number, text = '') {
    const id = uid()
    update((d) => { d.nodes.push({ id, x: x - NODE_W / 2, y: y - 22, w: NODE_W, text, color: 'slate' }) })
    setSel({ kind: 'node', id })
    setEditingId(id)
    return id
  }

  function addFrame() {
    const r = wrapRef.current!.getBoundingClientRect()
    const c = toWorld(r.left + r.width / 2, r.top + r.height / 2)
    const id = uid()
    update((d) => { d.frames.push({ id, x: c.x - 210, y: c.y - 150, w: 420, h: 300, label: 'Neuer Bereich', color: 'slate' }) })
    setSel({ kind: 'frame', id })
  }

  const removeSelected = useCallback(() => {
    if (!sel) return
    update((d) => {
      if (sel.kind === 'node') {
        d.nodes = d.nodes.filter((n) => n.id !== sel.id)
        d.edges = d.edges.filter((e) => e.from !== sel.id && e.to !== sel.id)
        for (const c of d.checks) if (c.goals?.includes(sel.id)) c.goals = c.goals.filter((g) => g !== sel.id)
      } else if (sel.kind === 'frame') d.frames = d.frames.filter((f) => f.id !== sel.id)
      else d.edges = d.edges.filter((e) => e.id !== sel.id)
    })
    setSel(null)
  }, [sel])

  function paint(color: NodeColor) {
    if (!sel) return
    update((d) => {
      if (sel.kind === 'node') { const n = d.nodes.find((x) => x.id === sel.id); if (n) n.color = color }
      if (sel.kind === 'frame') { const f = d.frames.find((x) => x.id === sel.id); if (f) f.color = color }
    })
  }

  function toggleGoal() {
    if (sel?.kind !== 'node') return
    update((d) => {
      const n = d.nodes.find((x) => x.id === sel.id)
      if (n) n.isGoal = !n.isGoal
    })
  }

  /* ------------------ Pointer ------------------ */

  /**
   * Meldet einen Finger an. Ab dem zweiten wird gezoomt statt gezogen —
   * ein angefangenes Ziehen wird dabei abgebrochen, sonst wandert der Knoten
   * beim Aufziehen mit.
   */
  function track(e: React.PointerEvent): boolean {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        view: viewRef.current,
      }
      setDrag(null)
      setWire(null)
    }
    return pointers.current.size === 1
  }

  function onCanvasDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.button !== 1) return
    if (!track(e)) return
    setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, origin: { x: view.x, y: view.y }, moved: false })
  }

  function onNodeDown(e: React.PointerEvent, n: BoardNode) {
    if (editingId === n.id) return
    e.stopPropagation()
    if (!track(e)) return
    const already = sel?.kind === 'node' && sel.id === n.id
    setSel({ kind: 'node', id: n.id })
    setDrag({
      kind: 'node', id: n.id, startX: e.clientX, startY: e.clientY,
      origin: { x: n.x, y: n.y }, wasSelected: already, moved: false,
    })
  }

  function onFrameDown(e: React.PointerEvent, f: BoardFrame) {
    e.stopPropagation()
    if (!track(e)) return
    setSel({ kind: 'frame', id: f.id })
    const carried = nodes
      .filter((n) => {
        const s = sizes[n.id] ?? { w: n.w, h: 44 }
        const cx = n.x + s.w / 2
        const cy = n.y + s.h / 2
        return cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h
      })
      .map((n) => ({ id: n.id, x: n.x, y: n.y }))
    setDrag({
      kind: 'frame', id: f.id, startX: e.clientX, startY: e.clientY,
      origin: { x: f.x, y: f.y }, carried,
      wasSelected: sel?.kind === 'frame' && sel.id === f.id,
      moved: false,
    })
  }

  function onResizeDown(e: React.PointerEvent, f: BoardFrame) {
    e.stopPropagation()
    if (!track(e)) return
    setSel({ kind: 'frame', id: f.id })
    setDrag({ kind: 'resize', id: f.id, startX: e.clientX, startY: e.clientY, origin: { x: f.x, y: f.y }, frameSize: { w: f.w, h: f.h }, moved: false })
  }

  function onPortDown(e: React.PointerEvent, n: BoardNode) {
    e.stopPropagation()
    if (!track(e)) return
    const p = toWorld(e.clientX, e.clientY)
    setWire({ from: n.id, x: p.x, y: p.y })
    setDrag({ kind: 'connect', id: n.id, startX: e.clientX, startY: e.clientY, origin: { x: 0, y: 0 }, moved: false })
  }

  /* Pinch und Fingerbuchhaltung laufen unabhaengig vom Ziehen — sonst waeren
     beim Aufziehen ohne aktiven Drag gar keine Listener gebunden. */
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!pointers.current.has(e.pointerId)) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

      const p = pinch.current
      if (!p || pointers.current.size < 2) return
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (p.dist < 1) return

      const r = wrapRef.current!.getBoundingClientRect()
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.view.z * (dist / p.dist)))
      const k = z / p.view.z
      // Der Punkt zwischen den Fingern bleibt stehen, und das Board folgt
      // zusaetzlich, wenn die beiden Finger gemeinsam wandern.
      const cx = (a.x + b.x) / 2 - r.left
      const cy = (a.y + b.y) / 2 - r.top
      const ox = p.cx - r.left
      const oy = p.cy - r.top
      setView({ z, x: cx - (ox - p.view.x) * k, y: cy - (oy - p.view.y) * k })
    }

    const onUp = (e: PointerEvent) => {
      pointers.current.delete(e.pointerId)
      if (pointers.current.size < 2) pinch.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  useEffect(() => {
    if (!drag) return

    const onMove = (e: PointerEvent) => {
      if (pinch.current) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (!drag.moved && Math.hypot(dx, dy) > 3) drag.moved = true

      if (drag.kind === 'pan') {
        setView((v) => ({ ...v, x: drag.origin.x + dx, y: drag.origin.y + dy }))
      } else if (drag.kind === 'node') {
        update((d) => {
          const n = d.nodes.find((x) => x.id === drag.id)
          if (n) { n.x = drag.origin.x + dx / viewRef.current.z; n.y = drag.origin.y + dy / viewRef.current.z }
        }, { transient: true })
        // Einen Knoten auf einen anderen ziehen verbindet die beiden.
        if (drag.moved) {
          const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]')
          const over = el?.getAttribute('data-node')
          setDropTarget(over && over !== drag.id ? over : null)
        }
      } else if (drag.kind === 'frame') {
        update((d) => {
          const f = d.frames.find((x) => x.id === drag.id)
          if (f) { f.x = drag.origin.x + dx / viewRef.current.z; f.y = drag.origin.y + dy / viewRef.current.z }
          for (const c of drag.carried ?? []) {
            const n = d.nodes.find((x) => x.id === c.id)
            if (n) { n.x = c.x + dx / viewRef.current.z; n.y = c.y + dy / viewRef.current.z }
          }
        }, { transient: true })
      } else if (drag.kind === 'resize') {
        update((d) => {
          const f = d.frames.find((x) => x.id === drag.id)
          if (f && drag.frameSize) {
            f.w = Math.max(160, drag.frameSize.w + dx / viewRef.current.z)
            f.h = Math.max(120, drag.frameSize.h + dy / viewRef.current.z)
          }
        }, { transient: true })
      } else if (drag.kind === 'connect') {
        const p = toWorld(e.clientX, e.clientY)
        setWire((w) => (w ? { ...w, x: p.x, y: p.y } : w))
      }
    }

    const onUp = (e: PointerEvent) => {
      if (drag.kind === 'connect' && wire) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-node]')
        const target = el?.getAttribute('data-node')
        if (target && target !== wire.from) {
          const exists = edges.some(
            (g) => (g.from === wire.from && g.to === target) || (g.from === target && g.to === wire.from),
          )
          if (!exists) update((d) => { d.edges.push({ id: uid(), from: wire.from, to: target }) })
        }
        setWire(null)
      }
      if (drag.kind === 'node' && dropTarget && dropTarget !== drag.id) {
        const from = drag.id!
        const to = dropTarget
        update((d) => {
          // Der gezogene Knoten springt zurueck — die Geste war das Verbinden,
          // nicht das Verschieben. Sonst laegen die beiden uebereinander.
          const n = d.nodes.find((x) => x.id === from)
          if (n) { n.x = drag.origin.x; n.y = drag.origin.y }
          const exists = d.edges.some(
            (g) => (g.from === from && g.to === to) || (g.from === to && g.to === from),
          )
          if (!exists) d.edges.push({ id: uid(), from, to })
        })
        setDropTarget(null)
        setDrag(null)
        return
      }
      setDropTarget(null)
      commit()
      // Erster Klick raeumt die Auswahl ab, der naechste legt an — auf der
      // freien Flaeche wie innerhalb eines Bereichs.
      const multiTouch = pinch.current !== null || pointers.current.size > 0
      if (drag.kind === 'pan' && !drag.moved && !multiTouch) {
        if (sel) setSel(null)
        else {
          const p = toWorld(e.clientX, e.clientY)
          addNode(p.x, p.y)
        }
      }
      // Ohne Maus gibt es keinen Doppelklick — ein Tipp auf den gewaehlten
      // Knoten oeffnet deshalb den Text.
      if (drag.kind === 'node' && !drag.moved && drag.wasSelected && !multiTouch) {
        setEditingId(drag.id!)
      }
      if (drag.kind === 'frame' && !drag.moved && drag.wasSelected && !multiTouch) {
        const p = toWorld(e.clientX, e.clientY)
        addNode(p.x, p.y)
      }
      setDrag(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, wire, sel, edges, dropTarget])

  /* ------------------ Zoom & Tasten ------------------ */

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect()
        const mx = e.clientX - r.left
        const my = e.clientY - r.top
        setView((v) => {
          const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * Math.exp(-e.deltaY * 0.0022)))
          const k = z / v.z
          return { z, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
        })
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }))
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeSelected() }
      if (e.key === 'Escape') setSel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [removeSelected])

  /**
   * Faehrt so, dass das Rechteck ganz im freien Teil des Bildes liegt.
   * Links bleibt Platz fuer das Verzeichnis, unten fuer die Werkzeugleiste —
   * sonst landet genau das, was man anspringt, hinter einem Bedienelement.
   */
  function glideTo(x: number, y: number, w: number, h: number, pad = 64) {
    const r = wrapRef.current!.getBoundingClientRect()
    if (w <= 0 || h <= 0) return

    const left = indexOpen ? 252 : pad
    const bottom = 92
    const availW = Math.max(120, r.width - left - pad)
    const availH = Math.max(120, r.height - pad - bottom)

    // Ein kleiner Bereich wuerde sonst auf 200 % und mehr aufgeblasen — man
    // sieht dann zwar ihn, aber nichts von seiner Umgebung mehr.
    const z = Math.min(1.6, Math.max(MIN_ZOOM, Math.min(availW / w, availH / h)))
    setGliding(true)
    setView({
      z,
      x: left + (availW - w * z) / 2 - x * z,
      y: pad + (availH - h * z) / 2 - y * z,
    })
    window.setTimeout(() => setGliding(false), 460)
  }

  /** Umfassendes Rechteck ueber alles, was auf dem Board liegt. */
  function everything() {
    const boxes = [
      ...frames.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })),
      ...nodes.map((n) => ({ x: n.x, y: n.y, w: n.w, h: sizes[n.id]?.h ?? 48 })),
    ]
    if (!boxes.length) return null
    const x0 = Math.min(...boxes.map((b) => b.x))
    const y0 = Math.min(...boxes.map((b) => b.y))
    const x1 = Math.max(...boxes.map((b) => b.x + b.w))
    const y1 = Math.max(...boxes.map((b) => b.y + b.h))
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  /** Welche Knoten liegen in einem Bereich — rein geometrisch, ueber den Mittelpunkt. */
  const nodesIn = (f: BoardFrame) =>
    nodes.filter((n) => {
      const sz = sizes[n.id] ?? { w: n.w, h: 48 }
      const cx = n.x + sz.w / 2
      const cy = n.y + sz.h / 2
      return cx > f.x && cx < f.x + f.w && cy > f.y && cy < f.y + f.h
    })

  const looseNodes = nodes.filter((n) => !frames.some((f) => nodesIn(f).includes(n)))

  function zoomBy(f: number) {
    const r = wrapRef.current!.getBoundingClientRect()
    const mx = r.width / 2
    const my = r.height / 2
    setView((v) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.z * f))
      const k = z / v.z
      return { z, x: mx - (mx - v.x) * k, y: my - (my - v.y) * k }
    })
  }

  /* ------------------ Kanten-Geometrie ------------------ */

  const anchor = (id: string, side: 'r' | 'l') => {
    const n = nodes.find((x) => x.id === id)
    if (!n) return null
    const s = sizes[id] ?? { w: n.w, h: 44 }
    return { x: side === 'r' ? n.x + s.w : n.x, y: n.y + s.h / 2 }
  }

  const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(38, Math.abs(b.x - a.x) * 0.45)
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`
  }

  const selNode = sel?.kind === 'node' ? nodes.find((n) => n.id === sel.id) : undefined

  return (
    <div className={'board-wrap' + (drag?.kind === 'pan' ? ' panning' : '')} ref={wrapRef}>
      <div className="board-canvas" onPointerDown={onCanvasDown}
        style={{ backgroundSize: `${26 * view.z}px ${26 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
        <div
          className={'board-layer' + (gliding ? ' board-layer--gliding' : '')}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
        >

          {frames.map((f) => (
            <div key={f.id} className={'frame' + (sel?.kind === 'frame' && sel.id === f.id ? ' frame--sel' : '') + (hotFrame === f.id ? ' frame--hot' : '')}
              style={{ left: f.x, top: f.y, width: f.w, height: f.h, borderColor: sel?.kind === 'frame' && sel.id === f.id ? undefined : `var(--n-${f.color})`, opacity: f.color === 'slate' ? 1 : 0.9 }}
              onPointerDown={(e) => onFrameDown(e, f)}>
              <div className="frame-label" contentEditable suppressContentEditableWarning
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={(e) => {
                  const label = e.currentTarget.textContent?.trim() || 'Bereich'
                  update((d) => { const x = d.frames.find((y) => y.id === f.id); if (x) x.label = label })
                }}>
                {f.label}
              </div>
              <div className="frame-resize" onPointerDown={(e) => onResizeDown(e, f)} />
            </div>
          ))}

          <svg className="edges" width="1" height="1">
            {edges.map((g) => {
              const a = anchor(g.from, 'r')
              const b = anchor(g.to, 'l')
              if (!a || !b) return null
              const d = curve(a, b)
              return (
                <g key={g.id}>
                  <path className="edge-hit" d={d} onPointerDown={(e) => { e.stopPropagation(); setSel({ kind: 'edge', id: g.id }) }} />
                  <path className={'edge' + (sel?.kind === 'edge' && sel.id === g.id ? ' edge--hot' : '')} d={d} />
                </g>
              )
            })}
            {wire && (() => {
              const a = anchor(wire.from, 'r')
              return a ? <path className="edge edge--hot" strokeDasharray="4 4" d={curve(a, wire)} /> : null
            })()}
          </svg>

          {nodes.map((n) => {
            const isSel = sel?.kind === 'node' && sel.id === n.id
            const mom = n.isGoal ? goalMomentum(state, n.id) : null
            return (
              <div
                key={n.id}
                data-node={n.id}
                ref={(el) => measure(n.id, el)}
                className={
                  'node' +
                  (isSel ? ' node--sel' : '') +
                  (n.isGoal ? ' node--goal' : '') +
                  (drag?.kind === 'node' && drag.id === n.id ? ' node--dragging' : '') +
                  (dropTarget === n.id ? ' node--drop' : '')
                }
                style={{
                  left: n.x, top: n.y, width: n.w,
                  // Die Karte faerbt sich im Stylesheet aus diesem Wert.
                  ['--n' as string]: `var(--n-${n.color})`,
                }}
                onPointerDown={(e) => onNodeDown(e, n)}
                onDoubleClick={() => setEditingId(n.id)}
              >
                <div
                  className="node-text"
                  contentEditable={editingId === n.id}
                  suppressContentEditableWarning
                  ref={(el) => { if (el && editingId === n.id && document.activeElement !== el) { el.focus(); placeCaretEnd(el) } }}
                  onBlur={(e) => {
                    const text = e.currentTarget.textContent ?? ''
                    setEditingId(null)
                    update((d) => {
                      const x = d.nodes.find((y) => y.id === n.id)
                      if (!x) return
                      if (!text.trim() && !x.isGoal) d.nodes = d.nodes.filter((y) => y.id !== n.id)
                      else x.text = text
                    })
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') (e.target as HTMLElement).blur()
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); (e.target as HTMLElement).blur() }
                  }}
                >
                  {n.text}
                </div>
                {n.isGoal && (
                  <div className="node-goal-foot">
                    <span className="node-goal-tag">Ziel</span>
                    {mom && mom.possible > 0 ? (
                      <>
                        <div className="node-goal-bar">
                          <i style={{ width: `${Math.round((mom.hits / mom.possible) * 100)}%` }} />
                        </div>
                        <span className="node-goal-pct">{Math.round((mom.hits / mom.possible) * 100)}%</span>
                      </>
                    ) : (
                      <span className="node-goal-pct">noch kein Check verknüpft</span>
                    )}
                  </div>
                )}
                <div className="port" onPointerDown={(e) => onPortDown(e, n)} title="Verbinden" />
              </div>
            )
          })}
        </div>
      </div>

      <div className="board-hud">
        <div className="eyebrow" style={{ background: 'color-mix(in srgb, var(--surface) 80%, transparent)', padding: '6px 11px', borderRadius: 999, backdropFilter: 'blur(6px)' }}>
          Mind my Business
        </div>
        {/* Solange nichts da ist, hilft der Hinweis mehr als ein leeres
            Verzeichnis. Sobald etwas liegt, tauschen die beiden die Plaetze. */}
        {nodes.length === 0 && frames.length === 0 ? (
          <div className="board-hint">Irgendwo hinklicken und losschreiben</div>
        ) : (
          <div className={'board-index' + (indexOpen ? '' : ' board-index--shut')}>
            <button className="board-index-head" onClick={() => setIndexOpen((o) => !o)}>
              <span>Bereiche</span>
              <span className="mono">{frames.length}</span>
              <ChevR className={'board-index-caret' + (indexOpen ? ' board-index-caret--open' : '')} />
            </button>

            {indexOpen && (
              <div className="board-index-list">
                {frames.map((f) => {
                  const inside = nodesIn(f)
                  return (
                    <button
                      key={f.id}
                      className="board-index-row"
                      onClick={() => { glideTo(f.x, f.y, f.w, f.h); setSel({ kind: 'frame', id: f.id }) }}
                      onMouseEnter={() => setHotFrame(f.id)}
                      onMouseLeave={() => setHotFrame(null)}
                    >
                      <i className="board-index-dot" style={{ background: `var(--n-${f.color})` }} />
                      <span className="board-index-name">{f.label}</span>
                      <span className="mono">{inside.length}</span>
                    </button>
                  )
                })}

                {frames.length === 0 && (
                  <div className="board-index-empty">
                    Noch keine Bereiche. Unten auf <b>Bereich</b> tippen und einen Rahmen um
                    zusammengehörige Einträge ziehen.
                  </div>
                )}

                {looseNodes.length > 0 && (
                  <button
                    className="board-index-row board-index-row--loose"
                    onClick={() => {
                      const x0 = Math.min(...looseNodes.map((n) => n.x))
                      const y0 = Math.min(...looseNodes.map((n) => n.y))
                      const x1 = Math.max(...looseNodes.map((n) => n.x + n.w))
                      const y1 = Math.max(...looseNodes.map((n) => n.y + (sizes[n.id]?.h ?? 48)))
                      glideTo(x0, y0, x1 - x0, y1 - y0)
                    }}
                  >
                    <i className="board-index-dot board-index-dot--none" />
                    <span className="board-index-name">Ohne Bereich</span>
                    <span className="mono">{looseNodes.length}</span>
                  </button>
                )}

                <button
                  className="board-index-row board-index-row--all"
                  onClick={() => { const e = everything(); if (e) glideTo(e.x, e.y, e.w, e.h) }}
                >
                  Alles zeigen
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="board-toolbar">
        <button className="btn btn--quiet btn--sm" onClick={() => {
          const r = wrapRef.current!.getBoundingClientRect()
          const c = toWorld(r.left + r.width / 2, r.top + r.height / 2)
          addNode(c.x, c.y)
        }}><Plus /> Eintrag</button>

        <button className="btn btn--quiet btn--sm" onClick={addFrame}>Bereich</button>

        <div className="divider-v" />

        {COLORS.map((c) => (
          <button key={c} className="swatch" aria-pressed={selNode?.color === c} disabled={!sel || sel.kind === 'edge'}
            onClick={() => paint(c)} aria-label={c} style={{ opacity: !sel || sel.kind === 'edge' ? 0.3 : 1 }}>
            <i style={{ background: `var(--n-${c})` }} />
          </button>
        ))}

        <div className="divider-v" />

        <button className="btn btn--quiet btn--sm" onClick={toggleGoal} disabled={sel?.kind !== 'node'}
          style={{ color: selNode?.isGoal ? 'var(--cobalt)' : undefined }}>
          <Link /> {selNode?.isGoal ? 'Ist Ziel' : 'Als Ziel'}
        </button>

        <button className="btn btn--quiet btn--sm btn--danger" onClick={removeSelected} disabled={!sel} aria-label="Löschen"><Trash /></button>
      </div>

      <div className="zoomctl">
        <button onClick={() => zoomBy(1 / 1.25)} aria-label="Rauszoomen">−</button>
        <span>{Math.round(view.z * 100)}%</span>
        <button onClick={() => zoomBy(1.25)} aria-label="Reinzoomen">+</button>
      </div>
    </div>
  )
}

function placeCaretEnd(el: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}
