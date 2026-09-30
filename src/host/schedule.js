/**
 * schedule.js — "play this clip during these hours", as one pure function.
 *
 * Time rules are evaluated on the HOST, next to the other "which clip plays now"
 * decisions, for the same reason the random pick is: the answer must not depend
 * on the browser's clock, on which page is open, or on how many reloads happened.
 *
 * The reading of `days` is the only subtle part, and it is deliberate:
 *
 *   a rule's `days` names the weekday its window STARTS on.
 *
 * So `22:00`-`02:00` on `[5]` (Friday) means "Friday night", and at 01:00 on
 * Saturday morning the rule still matches, because the window that is running
 * began on Friday. The alternative reading — "the weekday it is now" — would make
 * the same rule mean "Saturday 00:00-02:00", which is not what anyone writing
 * "Friday night" intends.
 */
import { minutesOf } from './settings.js'

/** Local wall-clock minutes since midnight for `at`. */
function minutesOfDay(at) {
  return at.getHours() * 60 + at.getMinutes()
}

/**
 * Whether one rule's window contains `at`.
 *
 * A window whose ends are equal is zero-width and never matches: a rule the user
 * has not finished filling in must not silently cover the whole day.
 *
 * @param {{ start: string, end: string, days: number[], enabled?: boolean }} rule
 * @param {Date} at
 * @returns {boolean}
 */
export function ruleMatches(rule, at) {
  if (rule.enabled === false) return false
  const start = minutesOf(rule.start)
  const end = minutesOf(rule.end)
  if (start === end) return false
  const now = minutesOfDay(at)
  const day = at.getDay()
  if (start < end) return rule.days.includes(day) && now >= start && now < end
  // Wraps midnight: before `end` we are still inside yesterday's window.
  if (now >= start) return rule.days.includes(day)
  return now < end && rule.days.includes((day + 6) % 7)
}

/**
 * Every enabled rule whose window contains `at`, in list order.
 *
 * The whole list rather than just the first, because "first match wins" is only
 * the first half of the rule: a rule can match and still be unusable (it names a
 * clip that has since been deleted), and the answer to that is the NEXT matching
 * rule, not giving up. `ClipResolver` walks this list and stops at the first rule
 * it can actually resolve.
 *
 * @param {Array<{ start: string, end: string, days: number[], enabled?: boolean }>} rules
 * @param {Date} [at]
 * @returns {Array<(typeof rules)[number]>}
 */
export function scheduledRules(rules, at = new Date()) {
  if (!Array.isArray(rules)) return []
  return rules.filter((rule) => ruleMatches(rule, at))
}

/**
 * The first enabled rule whose window contains `at`, or null.
 *
 * Precedence is visible in the panel instead of being an undocumented ranking
 * inside the code: the list order IS the priority.
 *
 * @param {Array<{ start: string, end: string, days: number[], enabled?: boolean }>} rules
 * @param {Date} [at]
 * @returns {(typeof rules)[number] | null}
 */
export function pickScheduledRule(rules, at = new Date()) {
  return scheduledRules(rules, at)[0] ?? null
}
