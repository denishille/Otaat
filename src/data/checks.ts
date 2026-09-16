import type { CheckDef } from '../lib/types'

/* Startaufstellung des Everything Checkers.
   Reihenfolge ist Absicht: erst die beiden grossen Zeitbloecke des Tages,
   dann was der Koerper gemacht hat, dann der Kopf, dann Erholung, zuletzt
   die Sachen, von denen weniger besser ist. Sie laesst sich im Checker
   per Griff umsortieren, `sort` wird dabei neu vergeben.

   `target`   = ab wann der Tag fuer diesen Check als erfuellt gilt
   `inverse`  = weniger ist besser, target ist dann eine Obergrenze
   `fallback` = Startwert, solange es keinen Vortag zum Uebernehmen gibt */

export const DEFAULT_CHECKS: CheckDef[] = [
  { id: 'sleep',    name: 'Schlaf',        kind: 'number', unit: 'h', step: 0.5, target: 8, fallback: 8, sort: 10 },
  { id: 'work',     name: 'Arbeit',        kind: 'number', unit: 'h', step: 0.5, target: 8, fallback: 8, sort: 20 },
  { id: 'sport',    name: 'Sport',         kind: 'multi',  sort: 30,
    options: ['Kraft', 'Cardio', 'Mobility', 'Ballsport', 'Draußen', 'Nix'],
    noneOption: 'Nix' },
  { id: 'mood',     name: 'Laune',         kind: 'scale',  target: 4, sort: 40 },
  { id: 'focus',    name: 'Fokus',         kind: 'scale',  target: 4, sort: 50 },
  { id: 'people',   name: 'Unter Menschen',kind: 'bool',   sort: 60 },
  { id: 'meditate', name: 'Meditation',    kind: 'bool',   sort: 70 },
  { id: 'sauna',    name: 'Sauna',         kind: 'bool',   sort: 80 },
  { id: 'scroll',   name: 'Doomscrolling', kind: 'scale',  target: 2, inverse: true, sort: 90 },
  { id: 'coffee',   name: 'Kaffee',        kind: 'number', unit: 'Tassen', step: 1, target: 3, inverse: true, sort: 100 },
  { id: 'booze',    name: 'Alkohol',       kind: 'number', unit: 'Gläser', step: 1, target: 0, inverse: true, sort: 110 },
]

export const SCALE_LABELS = ['mies', 'geht so', 'ok', 'gut', 'stark']

/** Checks, die es mal gab und jetzt nicht mehr. Erfasste Tage bleiben erhalten,
    der Check wandert nur ins Archiv statt geloescht zu werden. */
export const RETIRED_CHECK_IDS = ['mobility', 'food', 'muscles']
