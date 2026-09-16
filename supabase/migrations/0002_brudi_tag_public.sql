-- Essens-Rubrik im Everything Checker: Kalorien aus dem Kalorienbrudi-Bestand.
--
-- `tagesuebersicht` hat RLS an und keine Policy, ist fuer anon also dicht --
-- und soll es bleiben: dort stehen auch Gewicht, Stuhlgang und Symptome.
-- Diese View gibt bewusst nur drei Spalten frei, und nur fuer Denis.
--
-- Die View laeuft mit den Rechten ihres Eigentuemers (security_invoker = off,
-- der Standard) und kommt damit an die Tabelle, ohne dass fuer anon eine
-- Policy auf tagesuebersicht noetig waere. Genau das ist hier gewollt: der
-- Zugang bleibt auf diese drei Spalten begrenzt.
--
-- Geprueft mit `set role anon`: View 114 Zeilen, tagesuebersicht 0,
-- lebensmittel_analyse 0, termine 0.

create or replace view public.brudi_tag_public
with (security_invoker = off) as
select
  datum,
  kalorien_kcal,
  kalorienziel_kcal
from public.tagesuebersicht
where person = 'Denis';

comment on view public.brudi_tag_public is
  'OTAAT: Kalorien und Tagesziel von Denis. Bewusst oeffentlich lesbar -- '
  'enthaelt keine Koerper-, Verdauungs- oder Symptomdaten. Zugriff auf '
  'tagesuebersicht selbst bleibt fuer anon gesperrt.';

revoke all on public.brudi_tag_public from public;
grant select on public.brudi_tag_public to anon, authenticated;
