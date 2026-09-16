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

/** A — Raster: 3x3, einer gefuellt, leicht aus der Mitte. */
function grid(s = 512) {
  const gap = s * 0.19
  const c = s / 2
  const r = s * 0.052
  let o = ''
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const on = x === 1 && y === -1
      o += on
        ? `<circle cx="${c + x * gap}" cy="${c + y * gap}" r="${r * 1.35}" fill="${COBALT}"/>`
        : `<circle cx="${c + x * gap}" cy="${c + y * gap}" r="${r}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.022}"/>`
    }
  }
  return o
}

/** B — Reihe: fuenf Punkte, der zweite gefuellt, mit Fokusring. */
function row(s = 512) {
  const c = s / 2
  const gap = s * 0.175
  const r = s * 0.052
  let o = ''
  for (let i = 0; i < 5; i++) {
    const x = c + (i - 2) * gap
    if (i === 1) {
      o += `<circle cx="${x}" cy="${c}" r="${r * 2.1}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.016}"/>`
      o += `<circle cx="${x}" cy="${c}" r="${r * 1.3}" fill="${COBALT}"/>`
    } else {
      o += `<circle cx="${x}" cy="${c}" r="${r}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.022}"/>`
    }
  }
  return o
}

/** C — Zifferblatt: acht Punkte auf der Kreisbahn, einer gefuellt. */
function dial(s = 512) {
  const c = s / 2
  const R = s * 0.29
  const r = s * 0.058
  let o = `<circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.008}" opacity=".55"/>`
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI * 2) / 8
    const [x, y] = pt(c, c, R, a)
    o += i === 1
      ? `<circle cx="${x}" cy="${y}" r="${r * 1.22}" fill="${COBALT}"/>`
      : `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.024}"/>`
  }
  return o
}

/** D — Ausbruch: Raster, einer geht raus und zieht eine Spur. */
function breakout(s = 512) {
  const gap = s * 0.18
  const c = s / 2
  const r = s * 0.05
  const off = s * 0.1
  let o = ''
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      if (x === 1 && y === -1) continue
      o += `<circle cx="${c + x * gap}" cy="${c + y * gap}" r="${r}" fill="none" stroke="${MUTED}" stroke-width="${s * 0.021}"/>`
    }
  }
  const bx = c + gap + off
  const by = c - gap - off
  o += `<path d="M ${c + gap} ${c - gap} L ${bx} ${by}" stroke="${COBALT}" stroke-width="${s * 0.014}" stroke-linecap="round" opacity=".45"/>`
  o += `<circle cx="${bx}" cy="${by}" r="${r * 1.4}" fill="${COBALT}"/>`
  return o
}

const DRAFTS = { a: grid, b: row, c: dial, d: breakout }
/** Der Entwurf, der in die App geht. */
const CHOSEN = 'c'

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
