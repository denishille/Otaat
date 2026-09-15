/**
 * Packt den Vite-Build in eine einzige HTML-Datei — zum Rumschicken und
 * Anklicken, ohne Server. Lauffaehig, aber ohne Supabase: alles landet im
 * localStorage des Browsers, in dem die Datei geoeffnet wird.
 *
 *   node tools/bundle-single-file.mjs [ziel.html]
 *
 * Mit --artifact wird das aeussere Geruest (doctype/html/head/body)
 * weggelassen, weil die Artifact-Plattform es selbst mitbringt.
 */
import fs from 'node:fs'
import path from 'node:path'

const DIST = 'dist'
const artifact = process.argv.includes('--artifact')
const out = process.argv.find((a) => a.endsWith('.html')) ?? 'otaat-standalone.html'

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ fehlt — erst `npm run build` laufen lassen.')
  process.exit(1)
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
const assets = fs.readdirSync(path.join(DIST, 'assets'))
const read = (ext) => {
  const file = assets.find((f) => f.endsWith(ext))
  if (!file) throw new Error(`kein ${ext} in dist/assets`)
  return fs.readFileSync(path.join(DIST, 'assets', file), 'utf8')
}

const css = read('.css')
// Ein wortwoertliches </script irgendwo im Bundle wuerde den Inline-Block
// vorzeitig schliessen. In gueltigem JS steht das nur in Strings, dort ist
// der Backslash folgenlos.
const js = read('.js').replaceAll('</script', '<\\/script')

const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/)?.[0] ?? ''
const preconnects = [...html.matchAll(/<link rel="preconnect"[^>]*>/g)].map((m) => m[0]).join('\n    ')

const head = `<title>OTAAT</title>
    ${preconnects}
    ${fonts}
    <style>
${css}
    </style>`

const body = `<div id="root"></div>
    <script type="module">
${js}
    </script>`

const page = artifact
  ? `${head}\n${body}\n`
  : `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#F7F5F0" />
    ${head}
  </head>
  <body>
    ${body}
  </body>
</html>
`

fs.writeFileSync(out, page)
console.log(`${out} — ${(Buffer.byteLength(page) / 1024).toFixed(0)} kB`)
