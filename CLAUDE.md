# OTAAT — Arbeitsweise

## Branches

**Arbeitsbranch ist `claude/habit-structure-app-1szmgx`.** Dort wird
entwickelt, committet und gepusht — das ist der Branch, den Cloudflare baut
und der hinter der Domain steht.

`main` wird nicht mehr gepflegt. Nicht dorthin pushen, nicht dorthin mergen,
auch wenn GitHub ihn als Default-Branch anzeigt und eine Session dort startet:
dann auf `claude/habit-structure-app-1szmgx` wechseln.

Keine Feature-Branches, keine Pull Requests, solange nicht ausdrücklich danach
gefragt wird.

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
| `wrangler.jsonc` | Cloudflare-Deploy. `build.command` baut, `assets.directory` ist `dist/`. Der `name` muss dem Worker in Cloudflare entsprechen. |

## Design

Schlicht und clean, ohne Icon- und Untertitel-Wildwuchs. Nicht jedes Element
braucht eine Erklärung darunter. Eine Akzentfarbe (Kobalt), eine Signalfarbe
(Orange), sonst Papier und Tinte — die sechs Board-Farben sind die einzige
Stelle mit einer Palette. Neue Farben kommen aus `tokens.css`, nicht als
Literal in eine Komponente.

Ton der Texte: trocken, direkt, kein To-Do-App-Sprech.
