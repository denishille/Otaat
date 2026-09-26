-- Oura: Token-Ablage
--
-- Persoenliche Zugangstoken hat Oura im Dezember 2025 abgeschafft. Neue
-- Anbindungen muessen ueber OAuth 2.0, und damit gibt es ein Tokenpaar je
-- Nutzer, das regelmaessig aufgefrischt werden muss.
--
-- Beide Tabellen haben RLS an und **keine einzige Policy**. Das ist Absicht:
-- an die Token kommt nur die Edge Function mit dem service_role-Schluessel.
-- Kein angemeldeter Client, auch nicht der eigene — ein Zugangstoken, das im
-- Browser landet, ist ein Zugangstoken, das im Browser liegt.

create table if not exists public.otaat_oura_tokens (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  -- Wann das Zugangstoken ablaeuft. Die Function frischt kurz vorher auf.
  expires_at    timestamptz not null,
  connected_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Der Zwischenschritt im OAuth-Tanz. Oura schickt den Nutzer mit `code` und
-- `state` zurueck, und zwar **ohne** Anmeldung an unserer Seite — der
-- Rueckweg ist ein blanker Browser-Aufruf. Dieses Zufallswort ist das
-- Einzige, was den Rueckkehrer einem Konto zuordnet. Einmal verwendbar,
-- danach geloescht, und was liegen bleibt, verfaellt nach zehn Minuten.
create table if not exists public.otaat_oura_state (
  state      text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.otaat_oura_tokens enable row level security;
alter table public.otaat_oura_state  enable row level security;

drop trigger if exists touch_otaat_oura_tokens on public.otaat_oura_tokens;
create trigger touch_otaat_oura_tokens before update on public.otaat_oura_tokens
  for each row execute function public.otaat_touch_updated_at();

comment on table public.otaat_oura_tokens is
  'OTAAT: OAuth-Token je Nutzer fuer die Oura-Cloud. Nur fuer service_role lesbar.';
comment on table public.otaat_oura_state is
  'OTAAT: kurzlebiger Zwischenschritt des OAuth-Rueckwegs. Einmal verwendbar.';

-- Damit die App weiss, ob eine Verbindung steht, ohne je ein Token zu sehen:
-- eine View mit dem Datum und sonst nichts.
--
-- `security_invoker = off` ist hier noetig und nicht schlampig: die Tabelle
-- darunter hat keine Policy, eine Invoker-View saehe also auch nichts. Die
-- View laeuft als ihr Eigentuemer und schraenkt selbst auf `auth.uid()` ein —
-- dieselbe Bauart wie `otaat_handles`. Die beiden Token stehen nicht in der
-- Spaltenliste und kommen damit auch nicht heraus.
create or replace view public.otaat_oura_status
with (security_invoker = off) as
  select user_id, connected_at, updated_at
  from public.otaat_oura_tokens
  where user_id = auth.uid();

grant select on public.otaat_oura_status to authenticated;
