import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore, update } from '../lib/store'
import { achsenWert, availableParams, fensterTage, guete, niceTicks, reihe, zeigeWert, type Param, type Reihe } from '../lib/trends'
import { resolvedTheme } from '../lib/store'
import { fromISO } from '../lib/dates'
import { isTouch } from '../lib/device'
import type { AppState } from '../lib/types'

type AppMeta = AppState['meta']

/* Dashboard: ein Liniengraph, so viele Groessen darin, wie man will.
   -----------------------------------------------------------------------
   Eine davon ist die Haupt-KPI. Sie bekommt die echte Achse links, ihre
   Linie ist dick und **nach gut und schlecht eingefaerbt** — acht Stunden
   Schlaf gruen, vier rot. Alle anderen liegen als duenne Linien darueber,
   jede auf ihre eigene Spanne gestreckt: es geht um den Verlauf nebeneinander,
   und Kalorien und Stunden haben keine gemeinsame Achse.

   Quer gehalten wird der Graph zum Vollbild. Das ist kein Beiwerk — die
   App wird am Handy benutzt, und vierzehn Tage auf 390 Pixeln sind kein
   Verlauf, sondern ein Zacken. */

const FENSTER = [30, 90, 180] as const

/** Farben der Nebenlinien. Die sechs Board-Farben, in dieser Reihenfolge. */
const NEBEN = ['--n-cobalt', '--n-plum', '--n-slate', '--n-amber', '--n-moss', '--n-signal']

/* ---------------------------------------------------------------- */
/* Messen und Lauschen                                               */
/* ---------------------------------------------------------------- */

/** Quer oder hoch. Nur auf dem Handy interessant, am Schreibtisch ist immer quer. */
function useQuer(): boolean {
  const [quer, setQuer] = useState(
    () => isTouch && typeof matchMedia !== 'undefined' && matchMedia('(orientation: landscape)').matches,
  )
  useEffect(() => {
    if (!isTouch || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(orientation: landscape)')
    const an = (e: MediaQueryListEvent | MediaQueryList) => setQuer(e.matches)
    an(mq)
    mq.addEventListener('change', an)
    return () => mq.removeEventListener('change', an)
  }, [])
  return quer
}

/** Die tatsaechliche Groesse eines Kastens in Pixeln. */
function useBox(ref: React.RefObject<HTMLElement>) {
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const lies = () => {
      const r = el.getBoundingClientRect()
      setBox({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    lies()
    const ro = new ResizeObserver(lies)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return box
}

/**
 * Die Farben aus `tokens.css`, als Zahlen.
 *
 * Gemischt wird im Rechner, nicht im Stylesheet: ein Verlauf braucht je Tag
 * einen eigenen Halt, und `color-mix` hundertachtzigmal im SVG ist teuer.
 * Gelesen statt hineingeschrieben, damit Dark Mode und jede spaetere
 * Farbaenderung ohne Zutun mitkommen — Literale gehoeren nicht in eine
 * Komponente.
 */
function useFarben(theme: string) {
  return useMemo(() => {
    const css = typeof getComputedStyle !== 'undefined'
      ? getComputedStyle(document.documentElement) : null
    const hol = (n: string, ersatz: string) => (css?.getPropertyValue(n).trim() || ersatz)
    return {
      schlecht: hex(hol('--signal', '#FF5A1F')),
      mitte: hex(hol('--n-amber', '#C98A00')),
      gut: hex(hol('--good', '#12885A')),
      neben: NEBEN.map((n) => hol(n, '#8C93A3')),
    }
  }, [theme])
}

type RGB = [number, number, number]

function hex(s: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(s.trim())
  if (!m) return [128, 128, 128]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const misch = (a: RGB, b: RGB, t: number): RGB =>
  [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB

/** 0 = schlecht, 1 = gut. Ueber die Mitte, sonst wird aus Rot und Gruen Schlamm. */
function ampel(f: ReturnType<typeof useFarben>, g: number): string {
  const c = g < 0.5 ? misch(f.schlecht, f.mitte, g * 2) : misch(f.mitte, f.gut, (g - 0.5) * 2)
  return `rgb(${c[0]},${c[1]},${c[2]})`
}

/* ---------------------------------------------------------------- */
/* Der Graph                                                         */
/* ---------------------------------------------------------------- */

interface GraphProps {
  reihen: Reihe[]
  tage: string[]
  w: number
  h: number
  quer: boolean
  farben: ReturnType<typeof useFarben>
  zeiger: number | null
  setZeiger: (i: number | null) => void
}

function Graph({ reihen, tage, w, h, quer, farben, zeiger, setZeiger }: GraphProps) {
  const haupt = reihen[0]
  // Genug Platz fuer die laengste Achsenmarke ("2.255", "100 %", "10:30").
  const padL = haupt ? (quer ? 50 : 46) : 10
  const padR = 10
  const padT = 10
  const padB = quer ? 24 : 22
  const x0 = padL
  const x1 = Math.max(padL + 10, w - padR)
  const y0 = padT
  const y1 = Math.max(padT + 10, h - padB)
  const n = tage.length

  const x = (i: number) => (n < 2 ? (x0 + x1) / 2 : x0 + (i * (x1 - x0)) / (n - 1))

  /**
   * Die Haupt-KPI bekommt die gerundete Spanne der Achse, damit Linie und
   * Marken zusammenpassen. Jede Nebenlinie wird auf ihre eigene Spanne
   * gestreckt: es geht um den Verlauf nebeneinander, und Kalorien und Stunden
   * haben keine gemeinsame Achse.
   */
  const skala = useMemo(
    () => (haupt ? niceTicks(haupt.min, haupt.max, quer ? 5 : 4) : null),
    [haupt, quer],
  )

  const yVon = (r: Reihe) => {
    const lo = r === haupt && skala ? skala.lo : r.min
    const hi = r === haupt && skala ? skala.hi : r.max
    const spanne = hi - lo
    return (v: number) => (spanne <= 0 ? (y0 + y1) / 2 : y1 - ((v - lo) / spanne) * (y1 - y0))
  }

  /** Luecken brechen die Linie, statt quer durch den Graphen zu ziehen. */
  const pfade = (r: Reihe) => {
    const y = yVon(r)
    const out: string[] = []
    let d = ''
    r.werte.forEach((v, i) => {
      if (v === null) { if (d) { out.push(d); d = '' } return }
      d += `${d ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
    })
    if (d) out.push(d)
    return out
  }

  // Die Haltepunkte des Verlaufs: je Tag einer, in der Farbe seiner Guete.
  const stops = useMemo(() => {
    if (!haupt) return []
    const out: { o: number; c: string }[] = []
    let letzte = ''
    haupt.werte.forEach((v, i) => {
      if (v === null) return
      const c = ampel(farben, guete(haupt, v))
      if (c === letzte && i > 0) return
      letzte = c
      out.push({ o: n < 2 ? 0 : i / (n - 1), c })
    })
    return out
  }, [haupt, farben, n])

  const achse = useMemo(() => {
    if (!haupt || !skala) return []
    const y = yVon(haupt)
    return skala.ticks.map((v) => ({ v, y: y(v) }))
  }, [haupt, skala, y0, y1])

  // Vier bis sechs Datumsmarken, nie mehr — sonst steht unten eine Wand.
  const marken = useMemo(() => {
    const wie = quer ? 6 : 4
    const schritt = Math.max(1, Math.floor((n - 1) / (wie - 1)))
    const out: { i: number; text: string }[] = []
    for (let i = 0; i < n; i += schritt) {
      const d = fromISO(tage[i])
      out.push({ i, text: `${d.getDate()}.${d.getMonth() + 1}.` })
    }
    return out
  }, [tage, n, quer])

  const flaeche = useRef<SVGRectElement>(null)
  /** Welcher Tag liegt unter dem Finger? Gerundet, nicht abgeschnitten. */
  const greif = (e: React.PointerEvent) => {
    const r = flaeche.current?.getBoundingClientRect()
    if (!r || n < 1) return
    const anteil = (e.clientX - r.left - x0) / Math.max(1, x1 - x0)
    setZeiger(Math.max(0, Math.min(n - 1, Math.round(anteil * (n - 1)))))
  }

  const ziel = haupt?.param.target
  const zielY = haupt && skala && ziel !== undefined && ziel >= skala.lo && ziel <= skala.hi
    ? yVon(haupt)(ziel) : null

  return (
    <svg className="graph" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img">
      <defs>
        {haupt && (
          <linearGradient id="hauptlauf" gradientUnits="userSpaceOnUse" x1={x0} y1={0} x2={x1} y2={0}>
            {stops.length === 0 && <stop offset="0" stopColor="currentColor" />}
            {stops.map((s, k) => <stop key={k} offset={s.o} stopColor={s.c} />)}
          </linearGradient>
        )}
      </defs>

      {/* Waagerechte Hilfslinien an den Achsenmarken. */}
      {haupt && achse.map((a, k) => (
        <g key={k}>
          <line x1={x0} y1={a.y} x2={x1} y2={a.y} className="graph-raster" />
          <text x={x0 - 6} y={a.y + 3.5} className="graph-achse" textAnchor="end">
            {achsenWert(haupt.param, a.v)}
          </text>
        </g>
      ))}

      {zielY !== null && (
        <>
          <line x1={x0} y1={zielY} x2={x1} y2={zielY} className="graph-ziel" />
          <text x={x1 - 2} y={zielY - 4} className="graph-zieltext" textAnchor="end">Ziel</text>
        </>
      )}

      {/* Erst die Nebenlinien, damit die Haupt-KPI obenauf liegt. */}
      {reihen.slice(1).map((r, k) =>
        pfade(r).map((d, j) => (
          <path key={`${r.param.id}-${j}`} d={d} fill="none"
            stroke={farben.neben[k % farben.neben.length]} strokeWidth={1.25}
            strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        )),
      )}

      {haupt && pfade(haupt).map((d, j) => (
        <path key={j} d={d} fill="none" stroke="url(#hauptlauf)"
          strokeWidth={quer ? 3.5 : 3} strokeLinecap="round" strokeLinejoin="round" />
      ))}

      {marken.map((m) => (
        <text key={m.i} x={x(m.i)} y={h - 6} className="graph-achse" textAnchor="middle">{m.text}</text>
      ))}

      {zeiger !== null && zeiger >= 0 && zeiger < n && (
        <g>
          <line x1={x(zeiger)} y1={y0} x2={x(zeiger)} y2={y1} className="graph-zeiger" />
          {reihen.map((r, k) => {
            const v = r.werte[zeiger]
            if (v === null) return null
            return (
              <circle key={r.param.id} cx={x(zeiger)} cy={yVon(r)(v)} r={k === 0 ? 4 : 3}
                fill={k === 0 ? ampel(farben, guete(r, v)) : farben.neben[(k - 1) % farben.neben.length]}
                stroke="var(--paper)" strokeWidth={1.5} />
            )
          })}
        </g>
      )}

      <rect ref={flaeche} x={0} y={0} width={w} height={h} fill="transparent"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={greif} onPointerMove={(e) => e.buttons !== 0 && greif(e)} />
    </svg>
  )
}

/* ---------------------------------------------------------------- */
/* Die Seite                                                         */
/* ---------------------------------------------------------------- */

export function Trends() {
  const { state } = useStore()
  const quer = useQuer()
  const farben = useFarben(resolvedTheme(state.meta.theme))

  const dash = state.meta.dash
  const tage = dash?.tage ?? 90
  const [zeiger, setZeiger] = useState<number | null>(null)

  const params = useMemo(() => availableParams(state), [state])
  const nachId = useMemo(() => new Map(params.map((p) => [p.id, p])), [params])

  // Ohne Wahl faengt es mit dem an, was ohnehin die meisten interessiert.
  const hauptId = dash?.haupt && nachId.has(dash.haupt) ? dash.haupt
    : params.find((p) => p.id === 'sleep')?.id ?? params[0]?.id
  const extraIds = (dash?.extra ?? []).filter((id) => nachId.has(id) && id !== hauptId)

  const daten = useMemo(() => {
    const d = fensterTage(tage)
    const ids = [hauptId, ...extraIds].filter(Boolean) as string[]
    return { tage: d, reihen: ids.map((id) => reihe(state, nachId.get(id)!, d)) }
  }, [state, tage, hauptId, extraIds.join(','), nachId])

  /**
   * Die Auswahl steht in `meta` und wird damit mitsynchronisiert — wer am
   * Handy drei Groessen uebereinanderlegt, will sie am Laptop wiederfinden.
   * Geschrieben wird immer der ganze Stand, auch die Teile, die gerade nur
   * Vorgabe waren: sonst bleibt die erste Aenderung die einzige, die ankommt.
   */
  const setzen = (fn: (d: NonNullable<AppMeta['dash']>) => void) =>
    update((s) => {
      const d = { tage, haupt: hauptId ?? '', extra: [...extraIds] }
      fn(d)
      s.meta.dash = d
    })

  const kastenRef = useRef<HTMLDivElement>(null)
  const box = useBox(kastenRef)

  // Beim Tageswechsel oder neuer Auswahl zeigt der Zeiger ins Leere.
  useEffect(() => { setZeiger(null) }, [tage, hauptId, extraIds.join(',')])

  if (!params.length) {
    return (
      <div className="dash-leer">
        Noch nichts zu zeichnen. Sobald im Checker ein paar Tage stehen, lässt sich hier
        alles gegeneinander legen.
      </div>
    )
  }

  const gruppen: { titel: string; welche: Param[] }[] = [
    { titel: 'Eigene', welche: params.filter((p) => p.gruppe === 'eigen') },
    { titel: 'Ring', welche: params.filter((p) => p.gruppe === 'ring') },
    { titel: 'Essen', welche: params.filter((p) => p.gruppe === 'essen') },
  ].filter((g) => g.welche.length > 0)

  const legende = (
    <div className="dash-legende">
      {daten.reihen.map((r, k) => {
        const v = zeiger !== null ? r.werte[zeiger] : letzterWert(r)
        return (
          <div key={r.param.id} className="dash-leg">
            <i style={{
              background: k === 0 && v !== null
                ? ampel(farben, guete(r, v))
                : k === 0 ? 'var(--ink-4)' : farben.neben[(k - 1) % farben.neben.length],
            }} />
            <span className="dash-leg-name">{r.param.name}</span>
            <span className="dash-leg-wert">{zeigeWert(r.param, v)}</span>
          </div>
        )
      })}
    </div>
  )

  /* Quer gehalten: nur der Graph, ueber das ganze Bild. Die Auswahl hat man
     vorher getroffen; hier will man sehen, nicht einstellen. */
  if (quer) {
    return (
      <div className="dash-voll">
        <div className="dash-voll-kopf">
          {legende}
          <span className="dash-voll-tag">
            {zeiger !== null ? langTag(daten.tage[zeiger]) : `${tage} Tage`}
          </span>
        </div>
        <div className="dash-voll-graph" ref={kastenRef}>
          {box.w > 0 && (
            <Graph reihen={daten.reihen} tage={daten.tage} w={box.w} h={box.h}
              quer farben={farben} zeiger={zeiger} setZeiger={setZeiger} />
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="today-head">
        <div>
          <div className="eyebrow">Dashboard</div>
          <h1 className="display">Was <em>zusammen</em> läuft</h1>
        </div>
      </div>

      <div className="dash-steuer">
        <label className="dash-haupt">
          <span>Haupt-KPI</span>
          <select className="select" value={hauptId ?? ''}
            onChange={(e) => setzen((d) => {
              d.haupt = e.target.value
              d.extra = d.extra.filter((x) => x !== e.target.value)
            })}>
            {params.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="dash-fenster">
          {FENSTER.map((f) => (
            <button key={f} className={'chip chip--btn' + (f === tage ? ' chip--on' : ' chip--line')}
              onClick={() => setzen((d) => { d.tage = f })}>{f} T</button>
          ))}
        </div>
      </div>

      <div className="dash-karte">
        <div className="dash-tag">
          {zeiger !== null ? langTag(daten.tage[zeiger]) : 'Tippen für einen Tag'}
        </div>
        <div className="dash-graph" ref={kastenRef}>
          {box.w > 0 && (
            <Graph reihen={daten.reihen} tage={daten.tage} w={box.w} h={box.h}
              quer={false} farben={farben} zeiger={zeiger} setZeiger={setZeiger} />
          )}
        </div>
        {legende}
      </div>

      {isTouch && (
        <div className="dash-hinweis">Handy quer halten: dann füllt der Graph das ganze Bild.</div>
      )}

      <div className="dash-waehler">
        <div className="grid-head">
          <span className="grid-count">Dazulegen</span>
        </div>
        {gruppen.map((g) => (
          <div key={g.titel} className="dash-gruppe">
            <div className="dash-gruppe-titel">{g.titel}</div>
            <div className="dash-chips">
              {g.welche.map((p) => {
                const an = extraIds.includes(p.id)
                const ist = p.id === hauptId
                return (
                  <button key={p.id} disabled={ist}
                    className={'chip chip--btn' + (ist ? ' chip--sel' : an ? ' chip--on' : ' chip--line')}
                    onClick={() => setzen((d) => {
                      d.extra = an ? d.extra.filter((x) => x !== p.id) : [...d.extra, p.id]
                    })}>
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const letzterWert = (r: Reihe): number | null => {
  for (let i = r.werte.length - 1; i >= 0; i--) if (r.werte[i] !== null) return r.werte[i]
  return null
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
function langTag(iso: string): string {
  const d = fromISO(iso)
  return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`
}
