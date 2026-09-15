-- OTAAT — Schema
-- Eine Tabelle pro Entitaet, Inhalt als jsonb. Die App bleibt damit
-- schema-beweglich (neue Feldern brauchen keine Migration), waehrend
-- Zeilenbesitz, Indizes und RLS sauber in der DB liegen.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  meta           jsonb not null default '{}'::jsonb,
  -- Geheimnis fuer den Kalender-Feed; regenerierbar, falls der Link leakt
  calendar_token uuid not null default gen_random_uuid(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists profiles_calendar_token_idx
  on public.profiles (calendar_token);

-- ------------------------------------------------------------ Nutzdaten

create table if not exists public.checks (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.days (
  id         text primary key,          -- "<user_id>:<YYYY-MM-DD>"
  user_id    uuid not null references auth.users (id) on delete cascade,
  date       date not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.reminders (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  due        date not null,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.board_nodes (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.board_frames (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.board_edges (
  id         text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists checks_user_idx       on public.checks (user_id);
create index if not exists days_user_date_idx    on public.days (user_id, date desc);
create index if not exists reminders_user_due_idx on public.reminders (user_id, due);
create index if not exists board_nodes_user_idx  on public.board_nodes (user_id);
create index if not exists board_frames_user_idx on public.board_frames (user_id);
create index if not exists board_edges_user_idx  on public.board_edges (user_id);

-- ---------------------------------------------------------------- updated_at

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['profiles','checks','days','reminders','board_nodes','board_frames','board_edges']
  loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format(
      'create trigger touch_%1$s before update on public.%1$s
       for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles     enable row level security;
alter table public.checks       enable row level security;
alter table public.days         enable row level security;
alter table public.reminders    enable row level security;
alter table public.board_nodes  enable row level security;
alter table public.board_frames enable row level security;
alter table public.board_edges  enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

do $$
declare t text;
begin
  foreach t in array array['checks','days','reminders','board_nodes','board_frames','board_edges']
  loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I
       for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- --------------------------------------------------- Profil bei Signup anlegen

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
