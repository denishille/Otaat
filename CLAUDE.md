# OTAAT — Arbeitsweise

## Branches

**Direkt auf `main` arbeiten und dorthin pushen.** Das ist der Branch, den
Cloudflare baut und der hinter der Domain steht. Keine Feature-Branches, keine
Pull Requests, solange nicht ausdrücklich danach gefragt wird.

Startet eine Session auf einem anderen Branch, zuerst auf `main` wechseln und
die Arbeit dort machen.

## Befehle

```bash
npm run dev        # Vite auf :5173
npm run build      # tsc -b && vite build -> dist/
npm run typecheck  # nur Typen prüfen

node tools/bundle-single-file.mjs otaat-standalone.html   # eine Datei zum Verschicken
node tools/bundle-single-file.mjs --artifact out.html     # ohne äußeres Gerüst

npx wrangler deploy --dry-run   # Deploy-Config prüfen, ohne auszurollen
```

Vor jedem Commit läuft `npm run build` — der Build enthält `tsc -b` und
schlägt bei Typfehlern fehl.

## Wo was liegt

| Pfad | Inhalt |
|---|---|
| `src/lib/store.ts` | Einziger Schreibweg in den State. `update()` klont, mutiert, persistiert. `transient` für Drags, `commit()` schreibt durch. |
| `src/lib/scoring.ts` | Zielwerte, Serien, Momentum der Board-Ziele |
| `src/data/catalog.ts` | Das Regal — Vorlagen für Future Me Problems |
| `src/styles/tokens.css` | Alle Farben. Dark Mode ist eine Umdefinition derselben Variablen. |
| `supabase/migrations/` | Schema, Indizes, RLS |
| `src/data/brudi-source.ts` | Quelle der Essens-Rubrik. Liest nur die View `brudi_tag_public` (Datum, Kalorien, Ziel) — nie `tagesuebersicht` direkt, dort stehen Gewicht und Symptome. |
| `wrangler.jsonc` | Cloudflare-Deploy. `build.command` baut, `assets.directory` ist `dist/`. Der `name` muss dem Worker in Cloudflare entsprechen. SPA-Fallback über `not_found_handling` — **keine `_redirects` mit `/* /index.html 200`**, die weist Workers Assets als Endlosschleife ab. |

## Design

Schlicht und clean, ohne Icon- und Untertitel-Wildwuchs. Nicht jedes Element
braucht eine Erklärung darunter. Eine Akzentfarbe (Kobalt), eine Signalfarbe
(Orange), sonst Papier und Tinte — die sechs Board-Farben sind die einzige
Stelle mit einer Palette. Neue Farben kommen aus `tokens.css`, nicht als
Literal in eine Komponente.

Ton der Texte: trocken, direkt, kein To-Do-App-Sprech.
