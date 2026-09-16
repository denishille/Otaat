/**
 * Erzeugt die App-Icons. Vier Entwuerfe zum Vergleichen, und aus dem
 * gewaehlten die Dateien, die iOS und der Browser brauchen.
 *
 *   node tools/make-icons.mjs            # schreibt public/
 *   node tools/make-icons.mjs --drafts   # zusaetzlich alle vier als PNG
 *
 * iOS nimmt fuer das Lesezeichen auf dem Homescreen nur PNG, kein SVG —
 * deshalb wird hier gerendert statt nur kopiert.
 */
import fs from 'node:fs'
import path from 'node:path'

const INK = '#14161C'
const COBALT = '#2B4BF2'
const MUTED = '#3C4354'

const pt = (cx, cy, r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

const pol = (c, r, a) => [c + r * Math.cos(a), c + r * Math.sin(a)]
/** Bogen auf der Kreisbahn, von Winkel a0 bis a1. */
const arc = (c, r, a0, a1) => {
  const [x0, y0] = pol(c, r, a0)
  const [x1, y1] = pol(c, r, a1)
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`
}

/** C1 — Lauf: ein Bogen laeuft bis zum gefuellten Punkt, davor Punkte, dahinter nichts. */
function sweep(s = 512) {
  const c = s / 2
  const R = s * 0.3
  const N = 12
  const ON = 4
  const top = -Math.PI / 2
  const step = (Math.PI * 2) / N
  // Der Bogen endet kurz vor dem Punkt — so braucht es keine Aussparung in
  // der Hintergrundfarbe und die Marke funktioniert auf jedem Untergrund.
  let o = `<path d="${arc(c, R, top, top + (ON - 0.42) * step)}" fill="none" stroke="${COBALT}" stroke-width="${s * 0.028}" stroke-linecap="round" opacity=".9"/>`
  for (let i = 0; i < N; i++) {
    if (i === ON) continue
    const [x, y] = pol(c, R, top + i * step)
    // Punkte werden zum aktiven hin praesenter — das Jahr laeuft mit.
    const near = 1 - Math.min(Math.abs(i - ON), N - Math.abs(i - ON)) / (N / 2)
    o += `<circle cx="${x}" cy="${y}" r="${s * 0.026}" fill="${MUTED}" opacity="${(0.35 + near * 0.5).toFixed(2)}"/>`
  }
  const [ax, ay] = pol(c, R, top + ON * step)
  o += `<circle cx="${ax}" cy="${ay}" r="${s * 0.066}" fill="${COBALT}"/>`
  return o
}

/** C2 — Halo: ruhiger Kranz, der aktive Punkt bekommt einen Ring. */
function halo(s = 512) {
  const c = s / 2
  const R = s * 0.29
  const N = 8
  const top = -Math.PI / 2
  let o = ''
  for (let i = 0; i < N; i++) {
    const [x, y] = pol(c, R, top + (i * Math.PI * 2) / N)
    o += i === 1
      ? `<circle cx="${x}" cy="${y}" r="${s * 0.105}" fill="none" stroke="${COBALT}" stroke-width="${s * 0.016}" opacity=".45"/>` +
        `<circle cx="${x}" cy="${y}" r="${s * 0.058}" fill="${COBALT}"/>`
      : `<circle cx="${x}" cy="${y}" r="${s * 0.038}" fill="${MUTED}"/>`
  }
  return o
}

/** C3 — Atem: die Punkte wachsen einmal um den Kreis, der groesste ist gefuellt. */
function breath(s = 512) {
  const c = s / 2
  const R = s * 0.29
  const N = 10
  const top = -Math.PI / 2
  let o = ''
  for (let i = 0; i < N; i++) {
    const [x, y] = pol(c, R, top + (i * Math.PI * 2) / N)
    const t = i / (N - 1)
    if (i === N - 1) {
      o += `<circle cx="${x}" cy="${y}" r="${s * 0.072}" fill="${COBALT}"/>`
    } else {
      o += `<circle cx="${x}" cy="${y}" r="${s * (0.018 + t * 0.03)}" fill="${MUTED}" opacity="${(0.4 + t * 0.5).toFixed(2)}"/>`
    }
  }
  return o
}

/** C4 — Kern: Kranz aussen, der eine Punkt sitzt in der Mitte. */
function core(s = 512) {
  const c = s / 2
  const R = s * 0.3
  const N = 10
  const top = -Math.PI / 2
  let o = ''
  for (let i = 0; i < N; i++) {
    const [x, y] = pol(c, R, top + (i * Math.PI * 2) / N)
    o += `<circle cx="${x}" cy="${y}" r="${s * 0.032}" fill="${MUTED}" opacity=".7"/>`
  }
  o += `<circle cx="${c}" cy="${c}" r="${s * 0.105}" fill="${COBALT}"/>`
  return o
}

const DRAFTS = { c1: sweep, c2: halo, c3: breath, c4: core }
/** Der Entwurf, der in die App geht. */
const CHOSEN = 'c1'

const svg = (body, s = 512, bg = INK) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">` +
  `<rect width="${s}" height="${s}" fill="${bg}"/>${body}</svg>`

const outDir = 'public'
fs.mkdirSync(outDir, { recursive: true })

// Favicon bleibt SVG — scharf in jeder Groesse, und Browser koennen das.
fs.writeFileSync(path.join(outDir, 'favicon.svg'), svg(DRAFTS[CHOSEN](512)))

const { chromium } = await import('playwright-core')
const exe = fs.existsSync('/opt/pw-browsers/chromium/chrome-linux/chrome')
  ? '/opt/pw-browsers/chromium/chrome-linux/chrome'
  : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })

async function png(markup, size, file) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block}</style>${markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}`,
  )
  await page.screenshot({ path: file, omitBackground: false })
  await page.close()
  console.log(file)
}

// iOS maskiert das Icon selbst, deshalb randlos und ohne eigene Rundung
await png(svg(DRAFTS[CHOSEN](512)), 180, path.join(outDir, 'apple-touch-icon.png'))
await png(svg(DRAFTS[CHOSEN](512)), 192, path.join(outDir, 'icon-192.png'))
await png(svg(DRAFTS[CHOSEN](512)), 512, path.join(outDir, 'icon-512.png'))

if (process.argv.includes('--drafts')) {
  const dir = process.argv[process.argv.indexOf('--drafts') + 1] ?? 'icon-drafts'
  fs.mkdirSync(dir, { recursive: true })
  for (const [k, fn] of Object.entries(DRAFTS)) {
    await png(svg(fn(512)), 512, path.join(dir, `${k}-gross.png`))
    await png(svg(fn(512)), 60, path.join(dir, `${k}-klein.png`))
  }
}

await browser.close()
