import type { CheckDef } from '../lib/types'

/* Startaufstellung des Everything Checkers.
   Alles frei umbenennbar, loeschbar, erweiterbar — das hier ist nur Tag 1.
   `target` = ab wann der Tag fuer diesen Check als erfuellt gilt.
   `inverse` = weniger ist besser, target ist dann eine Obergrenze. */

export const DEFAULT_CHECKS: CheckDef[] = [
  { id: 'mobility',  name: 'Mobility',        kind: 'bool',   sort: 10 },
  { id: 'sport',     name: 'Sport',           kind: 'choice', sort: 20,
    options: ['Kraft', 'Cardio', 'Ballsport', 'Draußen', 'Nix'] },
  { id: 'sleep',     name: 'Schlaf',          kind: 'number', unit: 'h',      step: 0.5, target: 7,  sort: 30 },
  { id: 'food',      name: 'Essen',           kind: 'scale',  target: 4,  sort: 40 },
  { id: 'muscles',   name: 'Muskeln meckern', kind: 'scale',  target: 2,  inverse: true, sort: 50 },
  { id: 'work',      name: 'Arbeit',          kind: 'number', unit: 'h',      step: 0.5, target: 6,  sort: 60 },
  { id: 'focus',     name: 'Fokus',           kind: 'scale',  target: 4,  sort: 70 },
  { id: 'mood',      name: 'Laune',           kind: 'scale',  target: 4,  sort: 80 },
  { id: 'people',    name: 'Unter Menschen',  kind: 'bool',   sort: 90 },
  { id: 'meditate',  name: 'Meditation',      kind: 'bool',   sort: 100 },
  { id: 'sauna',     name: 'Sauna',           kind: 'bool',   sort: 110 },
  { id: 'scroll',    name: 'Doomscrolling',   kind: 'number', unit: 'h',      step: 0.25, target: 1, inverse: true, sort: 120 },
  { id: 'coffee',    name: 'Kaffee',          kind: 'number', unit: 'Tassen', step: 1,    target: 3, inverse: true, sort: 130 },
  { id: 'booze',     name: 'Alkohol',         kind: 'number', unit: 'Gläser', step: 1,    target: 0, inverse: true, sort: 140 },
]

export const SCALE_LABELS = ['mies', 'geht so', 'ok', 'gut', 'stark']
