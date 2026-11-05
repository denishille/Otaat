import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useStore, update } from '../lib/store'
import { achsenWert, auspraegung, availableParams, fensterTage, guete, niceTicks, reihe, zeigeSchnitt, zeigeWert, type Param, type Reihe } from '../lib/trends'
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

/**
 * Die tatsaechliche Groesse eines Kastens in Pixeln.
 *
 * **Als Callback-Ref, nicht als `useRef` mit Effekt.** Ein Ref-Objekt behaelt
 * seine Identitaet, also lief der Effekt genau einmal und der Beobachter
 * blieb am ersten Element haengen. Beim Drehen ins Querformat tauscht React
 * den Kasten gegen einen anderen aus: der alte flog aus dem Dokument, meldete
 * dabei 0 x 0, und der Graph verschwand — auch nach dem Zurueckdrehen, weil
 * nie wieder jemand eine Groesse gemeldet hat. React ruft eine Callback-Ref
 * dagegen bei jedem Wechsel auf, erst mit `null`, dann mit dem neuen Knoten.
 */
function useBox() {
  const [box, setBox] = useState({ w: 0, h: 0 })
  const beobachter = useRef<ResizeObserver | null>(null)
  const ref = useCallback((el: HTMLElement | null) => {
    beobachter.current?.disconnect()
    beobachter.current = null
    if (!el) return
    const lies = () => {
      const r = el.getBoundingClientRect()
      setBox({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    lies()
    beobachter.current = new ResizeObserver(lies)
    beobachter.current.observe(el)
  }, [])
  return [ref, box] as const
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
  /** 1 = ganzes Fenster. Groesser heisst naeher dran. */
  zoom: number
  /** Linke Kante des Ausschnitts, 0..1 des Fensters. */
  schub: number
  setSicht: (zoom: number, schub: number) => void
}

function Graph({ reihen, tage, w, h, quer, farben, zeiger, setZeiger, zoom, schub, setSicht }: GraphProps) {
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

  /*
   * Der sichtbare Ausschnitt. Bei `zoom = 1` ist es das ganze Fenster; sonst
   * liegen `spanne` Tage im Bild, und `von` sagt, welcher links steht.
   * Neunzig Tage auf 390 Pixeln sind vier Pixel pro Tag — da sieht man einen
   * Zacken, keinen Verlauf. Also: weit anfangen, nah herangehen koennen.
   */
  const spanne = Math.max(2, Math.min(n, Math.round(n / zoom)))
  const von = Math.max(0, Math.min(n - spanne, Math.round(schub * (n - spanne))))
  const bis = von + spanne - 1

  const x = (i: number) => (spanne < 2 ? (x0 + x1) / 2 : x0 + ((i - von) * (x1 - x0)) / (spanne - 1))
  /** Umgekehrt: welcher Tag liegt an dieser Stelle? */
  const iVon = (px: number) =>
    Math.max(0, Math.min(n - 1, Math.round(von + ((px - x0) / Math.max(1, x1 - x0)) * (spanne - 1))))
  const imBild = (i: number) => i >= von && i <= bis

  /**
   * Die Haupt-KPI bekommt die gerundete Spanne der Achse, damit Linie und
   * Marken zusammenpassen. Jede Nebenlinie wird auf ihre eigene Spanne
   * gestreckt: es geht um den Verlauf nebeneinander, und Kalorien und Stunden
   * haben keine gemeinsame Achse.
   */
  /** Min und Max nur dessen, was gerade im Bild ist — sonst liegt eine
      herangezoomte Woche als flache Linie in der Mitte. */
  const grenzen = (r: Reihe): [number, number] => {
    const da = r.werte.slice(von, bis + 1).filter((v): v is number => v !== null)
    return da.length ? [Math.min(...da), Math.max(...da)] : [r.min, r.max]
  }

  const skala = useMemo(
    () => {
      if (!haupt) return null
      const [lo, hi] = grenzen(haupt)
      return niceTicks(lo, hi, quer ? 5 : 4)
    },
    [haupt, quer, von, bis],
  )

  const yVon = (r: Reihe) => {
    const [gLo, gHi] = grenzen(r)
    const lo = r === haupt && skala ? skala.lo : gLo
    const hi = r === haupt && skala ? skala.hi : gHi
    const hoch = hi - lo
    return (v: number) => (hoch <= 0 ? (y0 + y1) / 2 : y1 - ((v - lo) / hoch) * (y1 - y0))
  }

  /** Luecken brechen die Linie, statt quer durch den Graphen zu ziehen. */
  const pfade = (r: Reihe) => {
    const y = yVon(r)
    const out: string[] = []
    let d = ''
    r.werte.forEach((v, i) => {
      // Ein Tag Rand auf jeder Seite, damit die Linie am Bildrand nicht
      // abbricht, sondern aus dem Schnitt herauslaeuft.
      if (i < von - 1 || i > bis + 1) return
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
      if (v === null || !imBild(i)) return
      // Die Guete misst am ganzen Fenster, nicht am Ausschnitt: sonst
      // wechselte beim Scrollen die Farbe derselben Nacht.
      const c = ampel(farben, guete(haupt, v))
      if (c === letzte && out.length) return
      letzte = c
      out.push({ o: spanne < 2 ? 0 : Math.max(0, Math.min(1, (i - von) / (spanne - 1))), c })
    })
    return out
  }, [haupt, farben, von, bis, spanne])

  const achse = useMemo(() => {
    if (!haupt || !skala) return []
    const y = yVon(haupt)
    return skala.ticks.map((v) => ({ v, y: y(v) }))
  }, [haupt, skala, y0, y1])

  // Vier bis sechs Datumsmarken, nie mehr — sonst steht unten eine Wand.
  const marken = useMemo(() => {
    const wie = quer ? 6 : 4
    const schritt = Math.max(1, Math.floor((spanne - 1) / (wie - 1)))
    const out: { i: number; text: string }[] = []
    for (let i = von; i <= bis; i += schritt) {
      const d = fromISO(tage[i])
      out.push({ i, text: `${d.getDate()}.${d.getMonth() + 1}.` })
    }
    return out
  }, [tage, von, bis, spanne, quer])

  const flaeche = useRef<SVGRectElement>(null)

  /*
   * Finger auf dem Graphen.
   *
   *   ein Finger, ohne Weg   -> Tag auswaehlen
   *   ein Finger, mit Weg    -> durch die Zeit schieben
   *   zwei Finger            -> naeher heran oder weiter weg
   *
   * Das Ziehen muss das Antippen schlagen, sonst springt bei jedem Schieben
   * der Zeiger mit; deshalb entscheidet erst das Loslassen, ob es ein Tipp
   * war. `touch-action: pan-y` laesst die Seite senkrecht weiter scrollen —
   * der Graph ist auf dem Handy nur 240 Pixel hoch, und wer ihn beim
   * Scrollen trifft, soll nicht haengenbleiben.
   */
  const finger = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ x: number; schub: number; zoom: number; weit: number; ankerI: number; ankerPx: number } | null>(null)
  const gezogen = useRef(false)

  const maxZoom = Math.max(1, n / 7)
  const klemm = (z: number) => Math.max(1, Math.min(maxZoom, z))

  /** Zoomen und dabei den Tag unter `ankerPx` an seiner Stelle lassen. */
  const zoomeUm = (neuZoom: number, ankerI: number, ankerPx: number) => {
    const z = klemm(neuZoom)
    const neuSpanne = Math.max(2, Math.min(n, Math.round(n / z)))
    const rest = n - neuSpanne
    const neuVon = ankerI - ((ankerPx - x0) / Math.max(1, x1 - x0)) * (neuSpanne - 1)
    setSicht(z, rest <= 0 ? 0 : Math.max(0, Math.min(1, neuVon / rest)))
  }

  const weite = () => {
    const [a, b] = [...finger.current.values()]
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const runter = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gezogen.current = false
    const r = flaeche.current?.getBoundingClientRect()
    if (!r) return
    if (finger.current.size === 2) {
      const mitte = [...finger.current.values()].reduce((a, f) => a + f.x, 0) / 2 - r.left
      start.current = { x: mitte, schub, zoom, weit: weite(), ankerI: iVon(mitte), ankerPx: mitte }
      gezogen.current = true
    } else {
      start.current = { x: e.clientX - r.left, schub, zoom, weit: 0, ankerI: 0, ankerPx: 0 }
    }
  }

  const bewegt = (e: React.PointerEvent) => {
    if (!finger.current.has(e.pointerId) || !start.current) return
    finger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = flaeche.current?.getBoundingClientRect()
    if (!r) return

    if (finger.current.size >= 2) {
      const w = weite()
      if (start.current.weit > 4) {
        zoomeUm((start.current.zoom * w) / start.current.weit, start.current.ankerI, start.current.ankerPx)
      }
      return
    }
    const dx = e.clientX - r.left - start.current.x
    if (Math.abs(dx) > 6) gezogen.current = true
    const rest = n - spanne
    if (rest <= 0 || !gezogen.current) return
    const tage = (dx / Math.max(1, x1 - x0)) * (spanne - 1)
    setSicht(zoom, Math.max(0, Math.min(1, start.current.schub - tage / rest)))
  }

  const hoch = (e: React.PointerEvent) => {
    const r = flaeche.current?.getBoundingClientRect()
    const war = finger.current.size
    finger.current.delete(e.pointerId)
    if (war === 1 && !gezogen.current && r) setZeiger(iVon(e.clientX - r.left))
    if (finger.current.size === 0) start.current = null
  }

  /*
   * Am Schreibtisch zoomt das Rad, dort wo der Zeiger steht.
   *
   * Von Hand angehaengt und nicht ueber `onWheel`: React haengt seine
   * Rad-Zuhoerer passiv an die Wurzel, und damit kam hier nichts an —
   * gemessen, das Ereignis erreichte das Rechteck, der Handgriff lief nie.
   * Passiv liesse sich ausserdem das Zoomen der ganzen Seite nicht
   * unterbinden, und dann waechst beim Trackpad-Kneifen der Browser mit.
   */
  useEffect(() => {
    const el = flaeche.current
    if (!el) return
    const rad = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const px = e.clientX - r.left
      zoomeUm(zoom * (e.deltaY < 0 ? 1.25 : 1 / 1.25), iVon(px), px)
    }
    el.addEventListener('wheel', rad, { passive: false })
    return () => el.removeEventListener('wheel', rad)
  })

  const ziel = haupt?.param.target
  const zielY = haupt && skala && ziel !== undefined && ziel >= skala.lo && ziel <= skala.hi
    ? yVon(haupt)(ziel) : null

  return (
    <svg className="graph" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img">
      <defs>
        <clipPath id="graphfeld">
          <rect x={x0} y={y0 - 4} width={Math.max(0, x1 - x0)} height={Math.max(0, y1 - y0 + 8)} />
        </clipPath>
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
      <g clipPath="url(#graphfeld)">
      {reihen.slice(1).map((r, k) => {
        const farbe = farben.neben[k % farben.neben.length]
        /* Ein Haken ist kein Verlauf. Als Linie gezeichnet schoss "unter
           Menschen" senkrecht zwischen null und eins durchs ganze Bild und
           uebertoente alles andere; als Punktreihe steht da, was es ist —
           an diesen Tagen war es so, an den anderen nicht. */
        if (r.param.art === 'anteil') {
          return r.werte.map((v, i) =>
            v === null || v < 0.5 || !imBild(i) ? null : (
              <circle key={`${r.param.id}-${i}`} cx={x(i)} cy={y0 + 5 + k * 7} r={2.3}
                fill={farbe} opacity={0.85} />
            ),
          )
        }
        return pfade(r).map((d, j) => (
          <path key={`${r.param.id}-${j}`} d={d} fill="none"
            stroke={farbe} strokeWidth={1.25}
            strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
        ))
      })}

      {haupt && pfade(haupt).map((d, j) => (
        <path key={j} d={d} fill="none" stroke="url(#hauptlauf)"
          strokeWidth={quer ? 3.5 : 3} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      </g>

      {/* Am Rand wird die Marke buendig gesetzt statt mittig — sonst haengt
          das letzte Datum zur Haelfte ausserhalb des Bildes. */}
      {marken.map((m) => {
        const px = x(m.i)
        const anker = px > x1 - 24 ? 'end' : px < x0 + 24 ? 'start' : 'middle'
        return (
          <text key={m.i} x={anker === 'end' ? x1 : anker === 'start' ? x0 : px}
            y={h - 6} className="graph-achse" textAnchor={anker}>{m.text}</text>
        )
      })}

      {zeiger !== null && imBild(zeiger) && (
        <g>
          <line x1={x(zeiger)} y1={y0} x2={x(zeiger)} y2={y1} className="graph-zeiger" />
          {reihen.map((r, k) => {
            const v = r.werte[zeiger]
            if (v === null) return null
            if (k > 0 && r.param.art === 'anteil' && v < 0.5) return null
            const cy = k > 0 && r.param.art === 'anteil' ? y0 + 5 + (k - 1) * 7 : yVon(r)(v)
            return (
              <circle key={r.param.id} cx={x(zeiger)} cy={cy} r={k === 0 ? 4 : 3}
                fill={k === 0 ? ampel(farben, guete(r, v)) : farben.neben[(k - 1) % farben.neben.length]}
                stroke="var(--paper)" strokeWidth={1.5} />
            )
          })}
        </g>
      )}

      <rect ref={flaeche} x={0} y={0} width={w} height={h} fill="transparent"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={runter} onPointerMove={bewegt}
        onPointerUp={hoch} onPointerCancel={hoch} />
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
  // Der Ausschnitt ist Ansichtssache und gehoert nicht in den Bestand: beim
  // naechsten Oeffnen will man wieder das Ganze sehen, nicht den Dienstag.
  const [sicht, setSichtRoh] = useState({ zoom: 1, schub: 0 })
  const setSicht = (zoom: number, schub: number) => setSichtRoh({ zoom, schub })

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

  const [kastenRef, box] = useBox()

  // Beim Tageswechsel oder neuer Auswahl zeigt der Zeiger ins Leere.
  useEffect(() => {
    setZeiger(null)
    setSichtRoh({ zoom: 1, schub: 0 })
  }, [tage, hauptId, extraIds.join(',')])

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

  /** "23.9. – 14.10. · 22 Tage" — sagt, wie weit man hereingezoomt ist. */
  const ausschnitt = () => {
    const n = daten.tage.length
    const breite = Math.max(2, Math.min(n, Math.round(n / sicht.zoom)))
    const von = Math.max(0, Math.min(n - breite, Math.round(sicht.schub * (n - breite))))
    if (breite >= n) return `${tage} Tage`
    return `${kurzTag(daten.tage[von])} – ${kurzTag(daten.tage[von + breite - 1])} · ${breite} Tage`
  }

  const stufen = daten.reihen.slice(1).map((r) => ({
    param: r.param,
    zeilen: auspraegung(daten.reihen[0], r),
  })).filter((g) => g.zeilen.length >= 2)

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
            {zeiger !== null && `${langTag(daten.tage[zeiger])} · `}{ausschnitt()}
          </span>
        </div>
        <div className="dash-voll-graph" ref={kastenRef}>
          {box.w > 0 && (
            <Graph reihen={daten.reihen} tage={daten.tage} w={box.w} h={box.h}
              quer farben={farben} zeiger={zeiger} setZeiger={setZeiger}
              zoom={sicht.zoom} schub={sicht.schub} setSicht={setSicht} />
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
        {/* Links der gegriffene Tag, rechts der Ausschnitt. Beides zugleich,
            sonst verdeckt das Datum die Spanne und "ganz zeigen" sieht aus,
            als taete es nichts. */}
        <div className="dash-tag">
          <span>{zeiger !== null ? langTag(daten.tage[zeiger]) : 'Tippen für einen Tag'}</span>
          {sicht.zoom > 1 && (
            <>
              <span className="dash-tag-sicht">{ausschnitt()}</span>
              <button className="btn btn--quiet btn--sm" onClick={() => setSichtRoh({ zoom: 1, schub: 0 })}>
                ganz
              </button>
            </>
          )}
        </div>
        <div className="dash-graph" ref={kastenRef}>
          {box.w > 0 && (
            <Graph reihen={daten.reihen} tage={daten.tage} w={box.w} h={box.h}
              quer={false} farben={farben} zeiger={zeiger} setZeiger={setZeiger}
              zoom={sicht.zoom} schub={sicht.schub} setSicht={setSicht} />
          )}
        </div>
        {legende}
      </div>

      <div className="dash-hinweis">
        {isTouch
          ? 'Zwei Finger zoomen, einer schiebt, Tippen wählt einen Tag. Quer gehalten füllt der Graph das Bild.'
          : 'Mausrad zoomt, Ziehen schiebt, Klick wählt einen Tag.'}
      </div>

      {stufen.length > 0 && (
        <div className="dash-stufen">
          <div className="grid-head">
            <span className="grid-count">{daten.reihen[0].param.name} aufgeteilt</span>
          </div>
          {stufen.map((g) => (
            <div key={g.param.id} className="dash-stufe">
              <div className="dash-gruppe-titel">nach {g.param.name}</div>
              <table className="dash-tab">
                <tbody>
                  {g.zeilen.map((z) => {
                    const spanne = g.zeilen.map((y) => y.schnitt)
                    const lo = Math.min(...spanne)
                    const hi = Math.max(...spanne)
                    const anteil = hi > lo ? (z.schnitt - lo) / (hi - lo) : 0.5
                    return (
                      <tr key={z.label}>
                        <th>{z.label}</th>
                        <td className="dash-tab-balken">
                          <i style={{
                            width: `${12 + anteil * 88}%`,
                            background: ampel(farben, guete(daten.reihen[0], z.schnitt)),
                          }} />
                        </td>
                        <td className="dash-tab-wert">{zeigeSchnitt(daten.reihen[0].param, z.schnitt)}</td>
                        <td className="dash-tab-n">{z.n} T</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
          <div className="dash-hinweis">
            Durchschnitt der {daten.reihen[0].param.name} an Tagen, an denen beides erfasst ist.
            Eine Aufteilung, keine Ursache.
          </div>
        </div>
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

const kurzTag = (iso: string): string => {
  const d = fromISO(iso)
  return `${d.getDate()}.${d.getMonth() + 1}.`
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
function langTag(iso: string): string {
  const d = fromISO(iso)
  return `${WD[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}.`
}
