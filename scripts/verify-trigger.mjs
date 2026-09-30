/**
 * verify-trigger.mjs — "should the intro play right now" (feature B).
 *
 * This drives `decideTrigger` out of the SHIPPED bundle, not a copy of it. The
 * rule set is the part of the plugin a user is most likely to configure into a
 * corner (five modes, a cooldown, and an allow/deny list that all compose), so it
 * is a pure function of plain values and is tested exhaustively here rather than
 * by opening five conversations by hand.
 *
 * The composition order is part of the contract and is asserted directly: the
 * list and the cooldown are VETOES that apply to every mode, not two more modes.
 *
 * Usage: node scripts/verify-trigger.mjs
 */
import { createReport } from './lib/harness.mjs'
import { loadClientBundle } from './lib/client-bundle.mjs'

const report = createReport('trigger rules')
const bundle = loadClientBundle()

if (typeof bundle.decideTrigger !== 'function') {
  console.error('verify-trigger: the bundle does not export decideTrigger — cannot verify')
  process.exit(2)
}
const decide = bundle.decideTrigger

const NOW = 1_800_000_000_000

/** The defaults, with only the fields a case cares about overridden. */
const input = (over = {}) => ({
  triggerMode: 'new-and-pinned',
  pinned: false,
  isNewConversation: false,
  entered: false,
  sessionId: 'session-1',
  hasPlayed: false,
  sessionList: { mode: 'off', ids: [] },
  cooldownMinutes: 0,
  lastPlayedAt: null,
  now: NOW,
  playedThisLaunch: false,
  ...over,
})

const plays = (label, over, reason) => {
  const decision = decide(input(over))
  const ok = decision.play === true && (reason === undefined || decision.reason === reason)
  report.check(ok, label, decision.play ? `reason=${decision.reason} (want ${String(reason)})` : `refused: ${decision.why}`)
}
const refuses = (label, over) => {
  const decision = decide(input(over))
  report.check(decision.play === false, label, decision.play ? `played (reason=${decision.reason})` : '')
}

console.log('the two hard preconditions:')
refuses('triggerMode "off" never plays on its own', { triggerMode: 'off', isNewConversation: true })
report.check(decide(input({ triggerMode: 'off' })).why === 'triggerMode is off', 'and it says why, for the debug log')
refuses('an ordinary mode with no current session has nothing to attach to', { sessionId: null, triggerMode: 'always', entered: true })
refuses('not even a new conversation, when no session is open', { sessionId: null, isNewConversation: true, pinned: true })

console.log('\nnew-and-pinned (the shipped behaviour):')
plays('a new, unseen conversation plays once', { isNewConversation: true }, 'new-conversation')
refuses('a new conversation that has already played does not play again', { isNewConversation: true, hasPlayed: true })
refuses('an ordinary conversation does not play', {})
plays('the pinned conversation plays on entry', { pinned: true, entered: true }, 'pinned')
refuses('the pinned conversation does not replay without a re-entry', { pinned: true, entered: false })
plays('the pin outranks the already-played record', { pinned: true, entered: true, hasPlayed: true }, 'pinned')

console.log('\nnew-only ignores the pin:')
plays('a new, unseen conversation plays', { triggerMode: 'new-only', isNewConversation: true }, 'new-conversation')
refuses('the pin is not consulted at all', { triggerMode: 'new-only', pinned: true, entered: true })
refuses('nor is a re-entry', { triggerMode: 'new-only', entered: true })

console.log('\nalways plays on every entry:')
plays('entering a conversation plays', { triggerMode: 'always', entered: true }, 'always')
plays('entering the pinned one plays too', { triggerMode: 'always', pinned: true, entered: true }, 'always')
plays('and the already-played record is irrelevant', { triggerMode: 'always', entered: true, hasPlayed: true }, 'always')
refuses('a re-render of the same conversation does not', { triggerMode: 'always', entered: false })

console.log('\nstartup-only spends one play per launch:')
plays('the first play of a launch happens', { triggerMode: 'startup-only' }, 'startup-only')
refuses('the second does not', { triggerMode: 'startup-only', playedThisLaunch: true })
/**
 * "Once per DSH start" is a rule about the APP, not about a conversation, and a
 * conversation is not always open — the app can be sitting on the settings page
 * when it starts. Requiring one made the feature fail silently in exactly that
 * case, so this asserts the opposite.
 */
plays('it fires even with no conversation open at all', { triggerMode: 'startup-only', sessionId: null }, 'startup-only')
refuses(
  'but still only once per launch without a conversation',
  { triggerMode: 'startup-only', sessionId: null, playedThisLaunch: true },
)
plays(
  'an allow list cannot apply without a session, so it does not block startup',
  { triggerMode: 'startup-only', sessionId: null, sessionList: { mode: 'allow', ids: ['other'] } },
  'startup-only',
)
refuses(
  'while the cooldown still applies, because it is about not being a nuisance',
  { triggerMode: 'startup-only', sessionId: null, cooldownMinutes: 10, lastPlayedAt: NOW - 1000 },
)

console.log('\nthe session list is a veto over every mode:')
refuses('allow list, session not on it', { triggerMode: 'always', entered: true, sessionList: { mode: 'allow', ids: ['other'] } })
plays('allow list, session on it', { triggerMode: 'always', entered: true, sessionList: { mode: 'allow', ids: ['session-1'] } }, 'always')
refuses('deny list, session on it', { triggerMode: 'always', entered: true, sessionList: { mode: 'deny', ids: ['session-1'] } })
plays('deny list, session not on it', { triggerMode: 'always', entered: true, sessionList: { mode: 'deny', ids: ['other'] } }, 'always')
refuses('the list also vetoes a brand new conversation', { isNewConversation: true, sessionList: { mode: 'deny', ids: ['session-1'] } })
refuses('and it vetoes the pinned conversation', { pinned: true, entered: true, sessionList: { mode: 'deny', ids: ['session-1'] } })

console.log('\nthe cooldown is a veto over every mode:')
refuses('a play one minute ago inside a 30 minute cooldown', { triggerMode: 'always', entered: true, cooldownMinutes: 30, lastPlayedAt: NOW - 60_000 })
plays(
  'a play 31 minutes ago clears it',
  { triggerMode: 'always', entered: true, cooldownMinutes: 30, lastPlayedAt: NOW - 31 * 60_000 },
  'always',
)
plays('no recorded play at all means no cooldown to serve', { triggerMode: 'always', entered: true, cooldownMinutes: 30 }, 'always')
plays('cooldown 0 disables the gate', { triggerMode: 'always', entered: true, cooldownMinutes: 0, lastPlayedAt: NOW - 1 }, 'always')
refuses('the cooldown also vetoes the pinned conversation', { pinned: true, entered: true, cooldownMinutes: 10, lastPlayedAt: NOW - 1000 })
refuses('and it vetoes a brand new conversation', { isNewConversation: true, cooldownMinutes: 10, lastPlayedAt: NOW - 1000 })
{
  // A clock that moved backwards must not lock the user out for ever.
  const backwards = decide(input({ triggerMode: 'always', entered: true, cooldownMinutes: 10, lastPlayedAt: NOW + 60_000 }))
  report.check(backwards.play === true, 'a last-played stamp in the future does not block playback')
}

console.log('\nan unhandled mode is refused, not guessed:')
refuses('an unknown triggerMode falls through to "no"', { triggerMode: 'wat', isNewConversation: true, pinned: true, entered: true })

console.log('\nevery decision carries a reason string for diagnostics:')
{
  const sample = decide(input({ isNewConversation: true }))
  report.check(typeof sample.why === 'string' && sample.why !== '', 'a played decision explains itself')
  const refusal = decide(input())
  report.check(typeof refusal.why === 'string' && refusal.why !== '', 'and so does a refusal')
}

report.finish()
