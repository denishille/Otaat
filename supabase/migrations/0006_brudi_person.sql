-- Die Essens-Quelle bekommt eine Person.
--
-- Bisher stand `person = 'Denis'` fest in der View. Im Kalorienbrudi-Bestand
-- gibt es zwei — Denis und Leni —, und wer OTAAT benutzt, soll sagen koennen,
-- welcher davon er ist.
--
-- Damit aendert sich auch, wer die View lesen darf. Solange nur Denis' Zahlen
-- drinstanden und er selbst sie freigegeben hat, war der oeffentliche
-- Schluessel vertretbar. Leni hat das nicht entschieden. Also: `anon` fliegt
-- raus, `authenticated` bleibt — lesen kann es nur noch, wer in OTAAT
-- angemeldet ist, und anmelden darf sich nur, wer in `otaat_invited` steht.
--
-- Die Basistabellen bleiben unveraendert gesperrt. Gewicht, Symptome,
-- Stuhlgang und die Lebensmittelliste kommen hier nicht vor.

create or replace view public.brudi_tag_public
with (security_invoker = off) as
with tag as (
  select person, datum, kalorien_kcal, kalorienziel_kcal, protein_g, kohlenhydrate_g, fett_g
  from public.tagesuebersicht
),
posten as (
  select
    person, datum, kalorien_kcal,
    ballaststoffe_g, zucker_g, cholesterin_mg, omega3_g,
    calcium_mg, eisen_mg, kalium_mg, magnesium_mg, selen_ug, zink_mg, jod_ug,
    folat_ug, vitamin_a_ug, vitamin_b12_ug, vitamin_c_mg, vitamin_d_ug,
    vitamin_e_mg, vitamin_k_ug,
    case lower(saeure_base)
      when 'gut' then 1 when 'basisch' then 1
      when 'neutral' then 0
      when 'schlecht' then -1 when 'sauer' then -1
    end as saeure_base_n,
    case lower(low_fodmap)
      when 'gut' then 1 when 'neutral' then 0 when 'schlecht' then -1
    end as low_fodmap_n,
    case lower(darmgesundheit)
      when 'gut' then 1 when 'neutral' then 0 when 'schlecht' then -1
    end as darm_n
  from public.lebensmittel_analyse
  where duplikat is not true
),
naehrwerte as (
  select
    person, datum,
    sum(ballaststoffe_g)  as ballaststoffe_g,
    sum(zucker_g)         as zucker_g,
    sum(cholesterin_mg)   as cholesterin_mg,
    sum(omega3_g)         as omega3_g,
    sum(calcium_mg)       as calcium_mg,
    sum(eisen_mg)         as eisen_mg,
    sum(kalium_mg)        as kalium_mg,
    sum(magnesium_mg)     as magnesium_mg,
    sum(selen_ug)         as selen_ug,
    sum(zink_mg)          as zink_mg,
    sum(jod_ug)           as jod_ug,
    sum(folat_ug)         as folat_ug,
    sum(vitamin_a_ug)     as vitamin_a_ug,
    sum(vitamin_b12_ug)   as vitamin_b12_ug,
    sum(vitamin_c_mg)     as vitamin_c_mg,
    sum(vitamin_d_ug)     as vitamin_d_ug,
    sum(vitamin_e_mg)     as vitamin_e_mg,
    sum(vitamin_k_ug)     as vitamin_k_ug,
    round(sum(saeure_base_n * kalorien_kcal) filter (where saeure_base_n is not null)
          / nullif(sum(kalorien_kcal) filter (where saeure_base_n is not null), 0), 3) as saeure_base_idx,
    round(sum(low_fodmap_n * kalorien_kcal) filter (where low_fodmap_n is not null)
          / nullif(sum(kalorien_kcal) filter (where low_fodmap_n is not null), 0), 3) as low_fodmap_idx,
    round(sum(darm_n * kalorien_kcal) filter (where darm_n is not null)
          / nullif(sum(kalorien_kcal) filter (where darm_n is not null), 0), 3) as darm_idx
  from posten
  group by person, datum
)
select
  t.datum, t.kalorien_kcal, t.kalorienziel_kcal,
  t.protein_g, t.kohlenhydrate_g, t.fett_g,
  n.ballaststoffe_g, n.zucker_g, n.cholesterin_mg, n.omega3_g,
  n.calcium_mg, n.eisen_mg, n.kalium_mg, n.magnesium_mg, n.selen_ug, n.zink_mg, n.jod_ug,
  n.folat_ug, n.vitamin_a_ug, n.vitamin_b12_ug, n.vitamin_c_mg, n.vitamin_d_ug,
  n.vitamin_e_mg, n.vitamin_k_ug,
  n.saeure_base_idx, n.low_fodmap_idx, n.darm_idx,
  t.person
from tag t
left join naehrwerte n on n.datum = t.datum and n.person = t.person;

-- Wer zur Auswahl steht. Nur die Namen, sonst nichts.
create or replace view public.brudi_personen
with (security_invoker = off) as
  select distinct person from public.tagesuebersicht where person is not null;

revoke select on public.brudi_tag_public from anon;
grant  select on public.brudi_tag_public to authenticated;
revoke select on public.brudi_personen  from anon;
grant  select on public.brudi_personen  to authenticated;

comment on view public.brudi_personen is
  'OTAAT: welche Kalorienbrudi-Konten es gibt. Nur Namen, nur fuer Angemeldete.';
