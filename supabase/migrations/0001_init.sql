-- OTAAT — Schema
--
-- Eine Tabelle pro Entitaet, Inhalt als jsonb. Die App bleibt damit
-- schema-beweglich (neue Felder brauchen keine Migration), waehrend
-- Zeilenbesitz, Indizes und RLS sauber in der DB liegen.
--
-- Praefix `otaat_`, weil das Projekt DenisInc geteilt ist: dort liegen auch
-- Kalorienbrudi (tagesuebersicht, lebensmittel_analyse) und Malena Cosmetics
-- (termine). Ohne Praefix waeren `days` und `profiles` Namen, die sich die
-- naechste App garantiert auch nimmt.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles

create table if not exists public.otaat_profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  meta           jsonb not null default '{}'::jsonb,
  -- Geheimnis fuer den Kalender-Feed; regenerierbar, falls der Link leakt
  calendar_token uuid not null default gen_random_uuid(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists otaat_profiles_calendar_token_idx
  on public.otaat_profiles (calendar_token);

-- ------------------------------------------------------------ Nutzdaten

create table if not exists public.otaat_checks (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.otaat_days (
  id         text primary key,          -- "<user_id>:<YYYY-MM-DD>"
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.otaat_reminders (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  due        date not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.otaat_board_nodes (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.otaat_board_frames (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.otaat_board_edges (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists otaat_checks_user_idx        on public.otaat_checks (user_id);
create index if not exists otaat_days_user_date_idx     on public.otaat_days (user_id, date desc);
create index if not exists otaat_reminders_user_due_idx on public.otaat_reminders (user_id, due);
create index if not exists otaat_board_nodes_user_idx   on public.otaat_board_nodes (user_id);
create index if not exists otaat_board_frames_user_idx  on public.otaat_board_frames (user_id);
create index if not exists otaat_board_edges_user_idx   on public.otaat_board_edges (user_id);

comment on table public.otaat_profiles     is 'OTAAT: ein Profil je Nutzer, meta + Kalender-Token. Repo: github.com/denishille/Otaat';
comment on table public.otaat_checks       is 'OTAAT: Definitionen des Everything Checkers.';
comment on table public.otaat_days         is 'OTAAT: ein Tag je Zeile, Werte als jsonb.';
comment on table public.otaat_reminders    is 'OTAAT: Future Me Problems.';
comment on table public.otaat_board_nodes  is 'OTAAT: Knoten auf Mind my Business.';
comment on table public.otaat_board_frames is 'OTAAT: Bereiche auf Mind my Business.';
comment on table public.otaat_board_edges  is 'OTAAT: Verbindungslinien auf Mind my Business.';

-- ---------------------------------------------------------------- updated_at

create or replace function public.otaat_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['otaat_profiles','otaat_checks','otaat_days','otaat_reminders',
                           'otaat_board_nodes','otaat_board_frames','otaat_board_edges']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.otaat_touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS

do $$
declare t text;
begin
  foreach t in array array['otaat_profiles','otaat_checks','otaat_days','otaat_reminders',
                           'otaat_board_nodes','otaat_board_frames','otaat_board_edges']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists "own profile" on public.otaat_profiles;
create policy "own profile" on public.otaat_profiles
  for all to authenticated using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['otaat_checks','otaat_days','otaat_reminders',
                           'otaat_board_nodes','otaat_board_frames','otaat_board_edges']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I
       for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- --------------------------------------------------- Profil bei Signup anlegen

create or replace function public.otaat_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.otaat_profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists otaat_on_auth_user_created on auth.users;
create trigger otaat_on_auth_user_created
  after insert on auth.users
  for each row execute function public.otaat_handle_new_user();

-- --------------------------------------------------- Wer sich anmelden darf
--
-- Der Publishable Key steht im oeffentlichen Repo und ohnehin in jedem
-- ausgelieferten Bundle — so ist er gedacht, RLS ist der Schutz der Daten.
-- Was er nicht verhindert: dass sich Fremde ueberhaupt einen Account auf
-- diesem Projekt anlegen. Deshalb eine Gaesteliste. Wer nicht drinsteht,
-- kommt gar nicht erst bis zum Magic Link.
--
-- Neuen Menschen einladen:
--   insert into public.otaat_invited (email) values ('wer@example.com');

create table if not exists public.otaat_invited (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table public.otaat_invited enable row level security;
-- Keine Policy: nur service_role und die security-definer-Funktion unten
-- kommen an die Liste. Der Client hat hier nichts zu suchen.

insert into public.otaat_invited (email) values ('denis.hille@gmx.de')
  on conflict (email) do nothing;

create or replace function public.otaat_only_invited()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.otaat_invited
    where lower(email) = lower(new.email)
  ) then
    raise exception 'Diese Adresse ist fuer OTAAT nicht freigeschaltet.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists otaat_check_invited on auth.users;
create trigger otaat_check_invited
  before insert on auth.users
  for each row execute function public.otaat_only_invited();

-- --------------------------------------------------- Funktionen abschliessen
--
-- Trigger-Funktionen gehoeren nicht in die REST-API. Aufrufbar waeren sie
-- ohnehin nur mit Trigger-Kontext, aber als security definer haben sie unter
-- /rest/v1/rpc/ nichts verloren.

revoke execute on function public.otaat_handle_new_user()  from public, anon, authenticated;
revoke execute on function public.otaat_only_invited()     from public, anon, authenticated;
revoke execute on function public.otaat_touch_updated_at() from public, anon, authenticated;
