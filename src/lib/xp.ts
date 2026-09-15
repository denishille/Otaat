/* Gamification, aber leise: kein Konfetti, keine Maskottchen.
   Nur eine Zahl, die groesser wird, und ein Titel, der sich aendert. */

export const XP_PER_CHECK = 4
export const XP_DAY_COMPLETE = 25
export const XP_REMINDER_DONE = 12
export const XP_GOAL_PAYOFF = 6

/** Level n beginnt bei 60 * n * (n-1) / 2 ... quadratisch wachsend. */
export function levelFor(xp: number): { level: number; into: number; span: number } {
  let level = 1
  let need = 80
  let acc = 0
  while (xp >= acc + need) {
    acc += need
    level += 1
    need = Math.round(need * 1.35)
  }
  return { level, into: xp - acc, span: need }
}

const TITLES = [
  'Frisch dabei',
  'Warmgelaufen',
  'Findet den Rhythmus',
  'Verlässlich',
  'Läuft von allein',
  'Ziemlich gefestigt',
  'Schwer zu bremsen',
  'Systemrelevant',
  'Naturgewalt',
]

export function titleFor(level: number): string {
  return TITLES[Math.min(level - 1, TITLES.length - 1)]
}
