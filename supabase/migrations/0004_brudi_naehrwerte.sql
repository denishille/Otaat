-- Die Essens-Quelle liefert jetzt mehr als Kalorien.
--
-- Im Checker stehen Kalorien und die drei Makros. Die Mikronaehrwerte und die
-- Einordnungen (Saeure/Base, FODMAP, Darm) tauchen nirgends als Rubrik auf —
-- sie gehen nur in die Zusammenhangs-Suche. Zwanzig Karten fuer Selen und
-- Vitamin K will niemand jeden Abend ansehen, aber ob der Magnesiumtag drei
-- Tage spaeter am Schlaf haengt, will man wissen.
--
-- Die Makros stehen tagesfertig in `tagesuebersicht`. Alles andere liegt je
-- Lebensmittel in `lebensmittel_analyse` und wird hier auf den Tag summiert.
-- `duplikat is not true` ist die Bedingung, mit der die Summe der Zeilen genau
-- die Tageskalorien trifft — nachgerechnet ueber den ganzen Bestand, auch fuer
-- den 21.09. mit seinen vierzehn Dubletten.
--
-- Die drei Einordnungen sind Text je Lebensmittel (gut / neutral / schlecht,
-- bei Saeure/Base vereinzelt auch basisch / sauer). Daraus wird je Tag eine
-- Zahl zwischen -1 und +1: jedes Lebensmittel zaehlt +1, 0 oder -1, gewichtet
-- mit seinen Kalorien. Ein Apfel verschiebt den Tag also weniger als eine
-- Pizza. Zeilen ohne Einordnung bleiben draussen, statt als 0 zu zaehlen —
-- sonst zoege jede Luecke den Tag Richtung Mitte.

create or replace view public.brudi_tag_public
with (security_invoker = off) as
with tag as (
  select datum, kalorien_kcal, kalorienziel_kcal, protein_g, kohlenhydrate_g, fett_g
  from public.tagesuebersicht
  where person = 'Denis'
),
-- Eine Zeile je Lebensmittel, mit den drei Einordnungen als Zahl.
posten as (
  select
    datum,
    kalorien_kcal,
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
  where person = 'Denis' and duplikat is not true
),
naehrwerte as (
  select
    datum,
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
    -- Kalorien-gewichtetes Mittel, auf drei Stellen. `nullif` faengt den Tag
    -- ab, an dem keine einzige Zeile eine Einordnung traegt.
    round(sum(saeure_base_n * kalorien_kcal) filter (where saeure_base_n is not null)
          / nullif(sum(kalorien_kcal) filter (where saeure_base_n is not null), 0), 3) as saeure_base_idx,
    round(sum(low_fodmap_n * kalorien_kcal) filter (where low_fodmap_n is not null)
          / nullif(sum(kalorien_kcal) filter (where low_fodmap_n is not null), 0), 3) as low_fodmap_idx,
    round(sum(darm_n * kalorien_kcal) filter (where darm_n is not null)
          / nullif(sum(kalorien_kcal) filter (where darm_n is not null), 0), 3) as darm_idx
  from posten
  group by datum
)
select
  t.datum, t.kalorien_kcal, t.kalorienziel_kcal,
  t.protein_g, t.kohlenhydrate_g, t.fett_g,
  n.ballaststoffe_g, n.zucker_g, n.cholesterin_mg, n.omega3_g,
  n.calcium_mg, n.eisen_mg, n.kalium_mg, n.magnesium_mg, n.selen_ug, n.zink_mg, n.jod_ug,
  n.folat_ug, n.vitamin_a_ug, n.vitamin_b12_ug, n.vitamin_c_mg, n.vitamin_d_ug,
  n.vitamin_e_mg, n.vitamin_k_ug,
  n.saeure_base_idx, n.low_fodmap_idx, n.darm_idx
from tag t
left join naehrwerte n on n.datum = t.datum;

comment on view public.brudi_tag_public is
  'OTAAT liest hier die Essens-Rubrik: Tageswerte von Denis aus dem Kalorienbrudi-Bestand. Kein Gewicht, keine Symptome, keine Lebensmittelliste.';

grant select on public.brudi_tag_public to anon, authenticated;
