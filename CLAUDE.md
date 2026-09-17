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
| `src/lib/store.ts` | Einziger Schreibweg in den State. `update()` klont, mutiert, persistiert. `transient` für Drags, `commit()` schreibt durch. **`migrate()`: der gespeicherte Stand gewinnt** (`{ ...vorgabe, ...gespeichert }`) — eigene Optionen, umbenannte Rubriken, eigene Zielwerte und die Reihenfolge überleben jeden Versionssprung. Strukturelle Änderungen an einer Rubrik gehören in einen Schritt mit Versionsabfrage, nie in ein pauschales Überschreiben mit `DEFAULT_CHECKS`. |
| `src/lib/scoring.ts` | Zielwerte, Serien, Momentum der Board-Ziele. **`countedValues()` ist die Wahrheit**: ein Tag zählt erst als bestätigt, vorher sind die vom Vortag übernommenen Werte nur ein Vorschlag. Gemessene Rubriken (`kind: 'external'`) zählen immer. Statistik, Zusammenhänge und Serien lesen ausschließlich darüber. |
| `src/lib/insights.ts` | Der Zusammenhang-Finder. Rangkorrelation (Spearman) über alle Merkmalspaare, am selben Tag, versetzt um 1/2/3/7 Tage und als Last der letzten 3 bzw. 7 Tage. Versetzte Tests rechnen den Vortag des Ergebnisses heraus, sonst findet man nur den Eigenlauf. Die Freiheitsgrade kommen aus der **wirksamen** Stichprobengröße (Bartlett), nicht aus der Zahl der Tage. Am Ende Benjamini-Yekutieli über **alle** durchgeführten Tests — wer `tests` nicht mitzählt, macht die Korrektur kaputt. Eine Mehrfachauswahl liefert jede Option als eigenes Merkmal. |
| `src/data/catalog.ts` | Das Regal — Vorlagen für Future Me Problems |
| `src/views/Board.tsx` | Mehrere Boards. Knoten, Bereiche und Linien tragen ein `board`-Feld, die Boards selbst liegen in `meta.boards` mit `meta.activeBoard`. Beim Anlegen immer das aktive Board eintragen, sonst taucht der Eintrag nirgends auf. |
| `src/styles/tokens.css` | Alle Farben. Dark Mode ist eine Umdefinition derselben Variablen. |
| `src/data/otaat-source.ts` | Projekt-URL, Publishable Key und die Tabellennamen. Der Schlüssel steht absichtlich im Klartext — er liegt ohnehin in jedem Bundle, RLS ist der Schutz. **Alle Tabellen tragen `otaat_`**, weil das Projekt DenisInc mit Kalorienbrudi und Malena Cosmetics geteilt ist. |
| `supabase/migrations/` | Schema, Indizes, RLS. Der Nutzer `denis.hille@gmx.de` wurde **per SQL angelegt**, nicht über GoTrue — wenn der Magic Link je zickt, ist das der erste Verdächtige (Zeile in `auth.users` löschen, neu anmelden, das Gerät schiebt seinen Stand hoch). Wer sich anmelden darf, steht in `otaat_invited` — ohne Eintrag kommt niemand über den Signup-Trigger. Einladen: `insert into public.otaat_invited (email) values ('wer@example.com');` |
| Anmeldung | **Passwort ist der Hauptweg, nicht der Magic Link.** Auf dem iPhone öffnet der Link in Safari, und die App vom Homescreen hat einen eigenen Speicher — die Sitzung landet dann im falschen Fach. Dazu lässt Supabases eingebauter Mailer nur **zwei Mails pro Stunde** durch (`over_email_send_rate_limit`, 429). Der Link bleibt als Ausweg. Eigenes SMTP im Dashboard würde das Limit heben. |
| `otaat_profiles.username` | Der Name, unter dem andere einen finden — Konto, nicht App, deshalb **nicht** in `AppState`. Lesbar für alle Angemeldeten, aber nur über die View `otaat_handles` (id + username); `meta` und das Kalender-Token bleiben privat. |
| `src/lib/store.ts` (Sync) | `pullAll()` **vereinigt**, ersetzt nicht: sonst schiebt das erste leere Gerät seinen Stand hoch und das zweite zieht ihn sich über die eigenen Tage. Bei gleichem Datum schlägt ein bestätigter Tag einen unbestätigten, sonst gewinnt der Server. `replaceTable()` schickt nur geänderte Zeilen und räumt über `in (...)` in Blöcken auf — **nie wieder `not in (...)` mit allen Ids**, das waren bei 180 Tagen acht Kilobyte URL. |
| `src/data/brudi-source.ts` | Quelle der Essens-Rubrik. Liest nur die View `brudi_tag_public` (Datum, Kalorien, Ziel) — nie `tagesuebersicht` direkt, dort stehen Gewicht und Symptome. |
| `wrangler.jsonc` | Cloudflare-Deploy. `build.command` baut, `assets.directory` ist `dist/`. Der `name` muss dem Worker in Cloudflare entsprechen. SPA-Fallback über `not_found_handling` — **keine `_redirects` mit `/* /index.html 200`**, die weist Workers Assets als Endlosschleife ab. |

## Design

Schlicht und clean, ohne Icon- und Untertitel-Wildwuchs. Nicht jedes Element
braucht eine Erklärung darunter. Eine Akzentfarbe (Kobalt), eine Signalfarbe
(Orange), sonst Papier und Tinte — die sechs Board-Farben sind die einzige
Stelle mit einer Palette. Neue Farben kommen aus `tokens.css`, nicht als
Literal in eine Komponente.

Ton der Texte: trocken, direkt, kein To-Do-App-Sprech.
