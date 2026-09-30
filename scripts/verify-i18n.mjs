/**
 * verify-i18n.mjs — the language switch, and the rule that makes it possible.
 *
 * The rule is that NO COMPONENT CONTAINS A SENTENCE. Every word a user reads is a
 * key resolved through the dictionaries in `i18n.ts`. Without a check, that rule
 * decays the first time someone is in a hurry: one hardcoded string is invisible
 * in the language they happen to speak, and shows up as half-translated UI for
 * everyone else.
 *
 * So this file enforces four things:
 *
 *   1. both dictionaries define exactly the same keys, with the same placeholders;
 *   2. every key a component asks for exists (including the dynamically built
 *      families, which TypeScript cannot check);
 *   3. no component carries user-facing CJK outside a comment;
 *   4. `resolveLocale` and `formatMessage` behave.
 *
 * Usage: node scripts/verify-i18n.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createReport } from './lib/harness.mjs'
import { loadClientBundle } from './lib/client-bundle.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLIENT_DIR = join(ROOT, 'src', 'client')
const report = createReport('i18n')

const bundle = loadClientBundle()
const { CATALOGS, resolveLocale, translatorFor, formatMessage } = bundle

console.log('the dictionaries:')
{
  const zh = Object.keys(CATALOGS.zh).sort()
  const en = Object.keys(CATALOGS.en).sort()
  report.check(zh.length > 60, `the catalogues are substantial (${String(zh.length)} keys)`)
  const missingEn = zh.filter((key) => !(key in CATALOGS.en))
  const missingZh = en.filter((key) => !(key in CATALOGS.zh))
  report.check(missingEn.length === 0, 'every Chinese key has an English translation', missingEn.join(', '))
  report.check(missingZh.length === 0, 'and no English key is missing from Chinese', missingZh.join(', '))

  const empty = [...zh, ...en].filter((key) => String(CATALOGS.zh[key] ?? CATALOGS.en[key]).trim() === '')
  report.check(empty.length === 0, 'no translation is empty', empty.join(', '))

  // A translation that drops {n} or {name} silently loses information the user
  // needs; the placeholder set must match across languages.
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',')
  const mismatched = zh.filter((key) => placeholders(CATALOGS.zh[key]) !== placeholders(CATALOGS.en[key]))
  report.check(
    mismatched.length === 0,
    'both languages use the same placeholders in every message',
    mismatched.map((key) => `${key}: zh[${placeholders(CATALOGS.zh[key])}] en[${placeholders(CATALOGS.en[key])}]`).join('; '),
  )

  const identical = zh.filter((key) => CATALOGS.zh[key] === CATALOGS.en[key])
  console.log(`  note  ${String(identical.length)} key(s) read the same in both languages (proper nouns, symbols): ${identical.join(', ') || '(none)'}`)
}

console.log('\nthe families that TypeScript cannot check:')
{
  const FAMILIES = [
    ['lib.tab', ['library', 'playback', 'trigger', 'overlay', 'schedule', 'interface']],
    ['lib.sort', ['default', 'name', 'size', 'newest', 'oldest']],
    ['trigger.mode', ['new-and-pinned', 'new-only', 'always', 'startup-only', 'off']],
    ['trigger.list', ['off', 'allow', 'deny']],
    ['overlay.effect', ['none', 'scanlines', 'vignette', 'grain', 'glow']],
    ['ui.locale', ['auto', 'zh', 'en']],
    ['sched.day', ['0', '1', '2', '3', '4', '5', '6']],
    ['reason', ['preview', 'new-conversation', 'pinned', 'random', 'selected', 'active', 'explicit', 'fallback', 'schedule', 'always', 'startup-only']],
    ['lib.source', ['yours', 'embedded', 'env', 'legacy']],
  ]
  for (const [prefix, suffixes] of FAMILIES) {
    const names = suffix => `${prefix}.${suffix}`
    // The mode buttons also render a `.title` tooltip per value.
    const wanted = suffixes.flatMap((suffix) => (prefix === 'trigger.mode' ? [names(suffix), names(suffix) + '.title'] : [names(suffix)]))
    const missing = wanted.filter((key) => !(key in CATALOGS.zh) || !(key in CATALOGS.en))
    report.check(missing.length === 0, `every key in the ${prefix}.… family exists in both languages`, missing.join(', '))
  }
}

console.log('\nno component carries user-facing copy:')
{
  /**
   * Strip comments, tracking strings and template literals so that a `//` inside a
   * URL is not mistaken for a line comment. What is left is executable text; any
   * CJK in it is copy that would never switch language.
   */
  function stripComments(source) {
    let out = ''
    let i = 0
    let quote = null
    while (i < source.length) {
      const char = source[i]
      const next = source[i + 1]
      if (quote !== null) {
        out += char
        if (char === '\\') {
          out += next ?? ''
          i += 2
          continue
        }
        if (char === quote) quote = null
        i += 1
        continue
      }
      if (char === '/' && next === '/') {
        while (i < source.length && source[i] !== '\n') i += 1
        continue
      }
      if (char === '/' && next === '*') {
        i += 2
        while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
        i += 2
        continue
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char
        out += char
        i += 1
        continue
      }
      out += char
      i += 1
    }
    return out
  }

  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/
  const DICTIONARY = 'i18n.ts'
  const files = readdirSync(CLIENT_DIR).filter((name) => name.endsWith('.ts') && name !== DICTIONARY)
  report.check(files.length >= 6, `the client half still has its component modules (${String(files.length)})`)
  for (const name of files) {
    const source = stripComments(readFileSync(join(CLIENT_DIR, name), 'utf8'))
    const lines = source.split('\n').filter((line) => CJK.test(line))
    report.check(lines.length === 0, `${name} contains no hardcoded CJK outside a comment`, lines.join('\n         '))
  }
  report.check(
    readFileSync(join(CLIENT_DIR, DICTIONARY), 'utf8').includes('overlay.skip'),
    'the dictionary module is where the copy actually lives',
  )
}

console.log('\nlocale resolution:')
{
  report.check(resolveLocale('zh', 'en-US') === 'zh', 'an explicit choice wins over the browser')
  report.check(resolveLocale('en', 'zh-CN') === 'en', 'in both directions')
  report.check(resolveLocale('auto', 'zh-CN') === 'zh', 'auto follows a Chinese browser')
  report.check(resolveLocale('auto', 'zh') === 'zh', 'including a bare zh')
  report.check(resolveLocale('auto', 'en-GB') === 'en', 'auto falls back to English otherwise')
  report.check(resolveLocale('auto', undefined) === 'en', 'and does not throw without a navigator')
  report.check(resolveLocale('auto', 'ZH-Hans') === 'zh', 'the region tag is matched case-insensitively')
}

console.log('\nmessage formatting:')
{
  report.check(formatMessage('plain') === 'plain', 'a message with no placeholder is unchanged')
  report.check(formatMessage('{n} 秒后跳过', { n: 5 }) === '5 秒后跳过', 'a placeholder is substituted')
  report.check(formatMessage('{a} and {b}', { a: 'x', b: 'y' }) === 'x and y', 'several placeholders are substituted')
  report.check(formatMessage('{missing}', {}) === '{missing}', 'an unknown placeholder stays visible rather than becoming undefined')
  const t = translatorFor('en')
  report.check(t('overlay.skip') === CATALOGS.en['overlay.skip'], 'a translator reads its own language')
  report.check(t('overlay.skipIn', { n: 3 }).includes('3'), 'and applies parameters')
  report.check(t('no.such.key') === 'no.such.key', 'an unknown key returns itself instead of throwing')
}

report.finish()
