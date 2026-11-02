# OTAAT

*One Thing At A Time.* Drei Seiten, ein Datenmodell.

| Seite | Was da passiert |
|---|---|
| **Everything Checker** | Der tägliche Selbst-Check. 14 Felder ab Werk, beliebig erweiterbar. Serien, Zielwerte, XP. |
| **Future Me Problems** | Alles, was einmal im Jahr oder alle zehn Jahre anklopft. Mit einem Regal von 160+ Vorlagen. |
| **Mind my Business** | Freies Board. Reinklicken, schreiben, verbinden, einrahmen, einfärben. Einträge lassen sich als **Ziel** markieren — dann können Checks darauf einzahlen. |

---

## Warum Cloudflare + Supabase und nicht Vercel

Kurz: Vercel würde hier nichts gewinnen, was du nicht schon hast.

Vercel hostet die Seite genauso gut, aber „Datenbank mit drin" heißt bei Vercel
**Vercel Postgres** — also nacktes Postgres (Neon unter der Haube). Kein Auth,
kein Row Level Security out of the box, kein Realtime, keine Storage-Buckets.
Das müsstest du alles selbst bauen oder wieder dazukaufen. Supabase bringt
Postgres **plus** Auth, RLS, Edge Functions und Realtime als ein Paket — und
zwar genau das Paket, das du in deinen anderen Projekten schon laufen hast.

Zur konkreten Frage „können wir mit Cloudflare Functions direkt in Supabase
schreiben": Ja — aber wir brauchen es nicht mal. Das Frontend schreibt mit dem
`anon`-Key **direkt** in Supabase, und RLS sorgt dafür, dass jeder nur an seine
eigenen Zeilen kommt. Eine Funktion dazwischen wäre eine Station ohne Aufgabe.

Server-Code gibt es hier genau an einer Stelle, und der liegt bei Supabase,
nicht bei Cloudflare: [`supabase/functions/calendar-feed`](supabase/functions/calendar-feed)
liefert den Kalender-Feed aus (siehe unten).

Unterm Strich: **Cloudflare Pages für das Frontend, Supabase für alles
dahinter.** Ein Anbieter weniger, ein Login weniger, und du bleibst bei dem
Stack, den du schon kennst.

---

## Loslegen

```bash
npm install
npm run dev
```

Läuft sofort — **ohne** Supabase. Dann liegt alles im `localStorage` dieses
Browsers. Gut zum Ausprobieren, schlecht als Langzeitspeicher.

## Mit Supabase

1. Projekt anlegen, dann das Schema einspielen:

   ```bash
   supabase link --project-ref <ref>
   supabase db push          # oder: SQL-Editor, Inhalt von supabase/migrations/0001_init.sql
   ```

2. `.env.local` anlegen:

   ```
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

3. In Supabase unter **Authentication → URL Configuration** die Site-URL und
   die Redirect-URLs eintragen (lokal `http://localhost:5173`, dazu die
   Produktions-Domain). Anmeldung läuft per Magic Link, kein Passwort.

Beim ersten Login auf einem leeren Account wird der lokale Stand **hochgeschoben**
statt überschrieben — was du offline angelegt hast, geht nicht verloren.

## Deployment auf Cloudflare

Das Projekt laeuft als **Worker mit statischen Assets** (Workers Builds), nicht
als klassisches Pages-Projekt. Alles Noetige steht in `wrangler.jsonc`:
`build.command` baut, `assets.directory` zeigt auf `dist/`. Im Dashboard muss
dafuer kein Build-Command hinterlegt sein — wrangler fuehrt ihn selbst aus.

Zwei Dinge, die das Repo nicht regeln kann:

**Der Name muss passen.** `name` in `wrangler.jsonc` muss dem Worker in
Cloudflare entsprechen. Stimmt er nicht, legt wrangler kommentarlos einen
zweiten Worker an — der Build ist gruen, die Domain zeigt trotzdem den alten
Stand.

**Das Deploy-Command entscheidet, ob es live geht.** `npx wrangler deploy`
schaltet die neue Version scharf. `npx wrangler versions upload` laedt sie nur
hoch, ohne sie auszurollen — gedacht fuer Vorschau-Branches. Steht das fuer den
Production Branch auf `versions upload`, aendert sich an der Domain nie etwas,
egal wie oft gebaut wird.

| Einstellung | Wert |
|---|---|
| Branch | `main` |
| Deploy command | `npx wrangler deploy` |
| Environment variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |

Die Node-Version steht in `.nvmrc`. Die Env-Variablen muessen zur **Build**-Zeit
gesetzt sein, nicht zur Laufzeit: Vite backt sie in das Bundle. Nachtraeglich
gesetzte Variablen wirken erst nach einem neuen Build.

Die Navigation laeuft ueber Hash-Routing (`#/today`), Rewrite-Regeln braucht es
also nicht. Falls spaeter auf History-Routing umgestellt wird, uebernimmt
`not_found_handling: "single-page-application"` in `wrangler.jsonc` den
Fallback.

**Keine `_redirects` mit `/* /index.html 200` anlegen.** Das ist der uebliche
SPA-Catch-all bei Cloudflare Pages, aber Workers Assets weist ihn ab: Workers
entfernt `.html` und `/index` von sich aus, dadurch faellt `/index.html` auf
`/` zurueck, matcht die Regel erneut und die API antwortet mit
`Infinite loop detected in this rule`. `public/_headers` ist unproblematisch
und bleibt.

> Der `anon`-Key gehoert ins Frontend, das ist so vorgesehen. Was ihn absichert,
> ist RLS — nicht Geheimhaltung. Der **Service-Role-Key** dagegen darf niemals
> in den Build; er wird ausschliesslich in der Edge Function verwendet, wo
> Supabase ihn automatisch injiziert.

## Essen kommt von woanders

Die Rubrik **Essen** im Everything Checker wird nicht von Hand gepflegt: sie
liest die Kalorien des Tages aus dem Kalorienbrudi-Bestand, der im selben
Supabase-Projekt liegt. Die Werte landen wie jeder andere Check im Tagesbestand,
zaehlen also in Serien, Statistik und Zusammenhaenge mit hinein.

Gelesen wird ausschliesslich die View `brudi_tag_public` aus
[`supabase/migrations/0002`](supabase/migrations/0002_brudi_tag_public.sql):
Datum, Kalorien, Tagesziel. **Kein** Gewicht, keine Symptome, keine
Lebensmittelliste, nichts aus dem Kosmetikstudio. Die drei Basistabellen
bleiben fuer den oeffentlichen Schluessel gesperrt -- RLS ist dort an, und es
gibt keine Policy.

Diese drei Spalten sind damit bewusst oeffentlich lesbar: der Schluessel steht
im ausgelieferten Bundle. Das war die Abwaegung gegen eine Anmeldung -- soll es
doch hinter einen Login, braucht `tagesuebersicht` eine Policy fuer
`authenticated` und die View faellt weg.

Quelle und Schluessel stehen in `src/data/brudi-source.ts` und lassen sich ueber
`VITE_BRUDI_URL` / `VITE_BRUDI_KEY` ueberschreiben.

## Kalender (Apple)

Zwei Wege, beide unter **Future Me Problems → Kalender**:

* **Export** — eine `.ics`-Datei zum Doppelklicken. Einmaliger Stand.
* **Abo** — ein Link, den Apple Kalender regelmäßig abholt. Änderungen kommen
  automatisch mit, und jeder Eintrag bringt seine Vorwarnzeit als `VALARM` mit.
  Die Benachrichtigung kommt dann vom System, nicht aus dieser App.

Fürs Abo muss die Edge Function deployed sein:

```bash
supabase functions deploy calendar-feed --no-verify-jwt
```

`--no-verify-jwt` ist nötig, weil Kalender-Clients keinen Bearer-Token schicken.
Autorisiert wird über ein zufälliges Token in der URL (`profiles.calendar_token`).
Wer den Link hat, sieht die Liste — also nicht weitergeben. Leakt er doch:

```sql
update public.profiles set calendar_token = gen_random_uuid() where id = auth.uid();
```

Mail-Zugriff ist bewusst **nicht** drin: Apple Mail hat keine brauchbare API von
außen, und für Erinnerungen ist der Kalender sowieso der richtige Ort.

---

## Aufbau

```
src/
  data/checks.ts       Startaufstellung des Everything Checkers
  data/catalog.ts      Das Regal — 160+ Vorlagen, nach Lebensbereich sortiert
  lib/store.ts         Einziger Schreibweg in den State (lokal + Supabase-Sync)
  lib/scoring.ts       Zielwerte, Serien, Momentum der Board-Ziele
  lib/dates.ts         Rhythmen, Fälligkeiten, deutsche Datumsformate
  lib/ics.ts           ICS-Erzeugung fürs Frontend
  views/Today.tsx      Everything Checker
  views/FutureMe.tsx   Future Me Problems
  views/Board.tsx      Mind my Business
supabase/
  migrations/          Schema, Indizes, RLS
  functions/           Kalender-Feed
```

**Datenfluss.** Jede Änderung geht durch `update()` in `lib/store.ts`. Der State
wird geklont, mutiert, sofort nach `localStorage` geschrieben und — falls
angemeldet — nach 900 ms gebündelt zu Supabase gepusht. Board-Drags laufen als
`transient`, damit nicht bei jedem Pixel gespeichert wird; `commit()` schreibt
beim Loslassen durch.

**Warum `jsonb` statt breiter Tabellen.** Ein Check kann Zahl, Skala, Auswahl
oder Freitext sein, und du wirst noch Felder dazuerfinden. Besitz, Datum und
Fälligkeit stehen als echte Spalten da — indiziert und von RLS bewacht — der
Rest liegt im `payload`. Neue Felder brauchen damit keine Migration.

## Gamification

XP für erfasste Checks, für vollständige Tage, für erledigte Reminder und extra
dafür, wenn ein Check auf ein Board-Ziel einzahlt. Level und Titel stehen in
`lib/xp.ts`. Kein Konfetti, keine Maskottchen — nur eine Zahl, die wächst, und
eine Serie, die man nicht abreißen lassen will.

## Design

Eine Akzentfarbe (Kobalt), eine Signalfarbe (Orange), sonst Papier und Tinte.
Die sechs Board-Farben sind die einzige Stelle mit einer Palette. Tokens stehen
in `src/styles/tokens.css`, Dark Mode ist eine Umdefinition derselben Variablen.
