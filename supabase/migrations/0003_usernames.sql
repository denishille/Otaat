-- Ein Name, unter dem andere einen finden. Wird gebraucht, sobald etwas
-- geteilt werden soll: eine Mail-Adresse will man dafuer nicht rumreichen.

alter table public.otaat_profiles
  add column if not exists username text;

-- Klein geschrieben eindeutig, damit "Denis" und "denis" nicht zwei Leute sind.
create unique index if not exists otaat_profiles_username_idx
  on public.otaat_profiles (lower(username));

alter table public.otaat_profiles drop constraint if exists otaat_profiles_username_form;
alter table public.otaat_profiles add constraint otaat_profiles_username_form
  check (username is null or username ~ '^[A-Za-z0-9_.-]{3,24}$');

-- Das Verzeichnis: nur Kennung und Name, nichts sonst. `meta` und das
-- Kalender-Token bleiben privat — deshalb eine View statt einer zweiten
-- Leserichtlinie auf der Tabelle.
create or replace view public.otaat_handles with (security_invoker = off) as
select id, username from public.otaat_profiles where username is not null;

revoke all on public.otaat_handles from public, anon;
grant select on public.otaat_handles to authenticated;

comment on view public.otaat_handles is
  'OTAAT: oeffentliches Verzeichnis der Namen. Nur fuer Angemeldete, nur id + username.';
