/**
 * dsh-link.mjs — install THIS checkout into a DSH profile, or remove it again.
 *
 * This is the `link:` variant of `dsh plugin --profile <name> add`, for the case
 * where you are developing the plugin and want DSH to load the directory you are
 * editing rather than a published copy. It writes exactly what the plugin manager
 * writes and nothing more:
 *
 *   1. `<profile>/node_modules/<name>` -> this directory (a symlink);
 *   2. `<name>` in the profile manifest's `dependencies`;
 *   3. `<name>` appended to `dsh.profile.bundles` — the list that makes a package
 *      a PROFILE LAYER instead of an inert dependency.
 *
 * Why a symlink directly in the profile's `node_modules` is the right mechanism:
 * DSH resolves a bundle name with Node's own lookup, anchored at the profile
 * manifest first and the installation second (`resolveBundleDir` in
 * `@deepseek-ai/dsh-app-boot`). A plain entry there is treated exactly like a
 * pnpm-managed one, so no package manager runs, no lockfile is created, and the
 * installation's own `cordis` instance is still shared through the profile
 * fallback directory.
 *
 * Reversible by construction: `--remove` restores the manifest to what it was and
 * deletes only the symlink this script created.
 *
 * Usage:
 *   node scripts/dsh-link.mjs                    # install into the current profile
 *   node scripts/dsh-link.mjs --profile desktop
 *   node scripts/dsh-link.mjs --remove --profile desktop
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const NAME = MANIFEST.name

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name, fallback) => {
  const index = argv.indexOf(name)
  return index === -1 ? fallback : argv[index + 1]
}

const remove = flag('--remove')
const profileName = value('--profile', 'desktop')
const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const profileDir = join(home, 'profiles', profileName)
const manifestPath = join(profileDir, 'package.json')
const linkPath = join(profileDir, 'node_modules', NAME)

if (!existsSync(manifestPath)) {
  const available = existsSync(join(home, 'profiles')) ? readdirSync(join(home, 'profiles')).join(', ') : '(none)'
  console.error(`dsh-link: no profile at ${profileDir}`)
  console.error(`          available: ${available}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
manifest.dependencies ??= {}
manifest.dsh ??= {}
manifest.dsh.profile ??= {}
manifest.dsh.profile.bundles ??= []

if (remove) {
  let touched = false
  if (manifest.dependencies[NAME] !== undefined) {
    delete manifest.dependencies[NAME]
    touched = true
  }
  const at = manifest.dsh.profile.bundles.indexOf(NAME)
  if (at !== -1) {
    manifest.dsh.profile.bundles.splice(at, 1)
    touched = true
  }
  if (existsSync(linkPath) || lstatSync(linkPath, { throwIfNoEntry: false }) !== undefined) {
    rmSync(linkPath, { recursive: false, force: true })
    console.log(`dsh-link: removed ${linkPath}`)
  }
  if (touched) {
    writeManifest()
    console.log(`dsh-link: ${NAME} removed from ${manifestPath}`)
  } else {
    console.log(`dsh-link: ${NAME} was not installed in profile "${profileName}"`)
  }
  console.log('dsh-link: restart DSH for the change to take effect')
  process.exit(0)
}

// --- install -----------------------------------------------------------------

const target = ROOT
const existing = lstatSync(linkPath, { throwIfNoEntry: false })
if (existing !== undefined) {
  if (!existing.isSymbolicLink()) {
    console.error(`dsh-link: refusing to replace ${linkPath} — it is not a symlink`)
    process.exit(1)
  }
  const current = readlinkSync(linkPath)
  if (resolve(current) === target) {
    console.log(`dsh-link: already linked -> ${target}`)
  } else {
    rmSync(linkPath)
    symlinkSync(target, linkPath, 'dir')
    console.log(`dsh-link: relinked ${linkPath} -> ${target}`)
  }
} else {
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(target, linkPath, 'dir')
  console.log(`dsh-link: linked ${linkPath} -> ${target}`)
}

manifest.dependencies[NAME] = `link:${target}`
if (!manifest.dsh.profile.bundles.includes(NAME)) manifest.dsh.profile.bundles.push(NAME)
writeManifest()

/**
 * Rewrite the profile manifest.
 *
 * Two-space JSON with a trailing newline, matching what `initProfile` writes, so
 * a diff of this file stays readable and a future `dsh plugin` run does not
 * reformat the whole thing.
 */
function writeManifest() {
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
}

console.log(`dsh-link: profile "${profileName}" now loads ${NAME} from source`)
console.log('')
console.log('  bundles  : ' + manifest.dsh.profile.bundles.join(', '))
console.log('')
console.log('Restart DSH, then hard-reload the app window (Ctrl+Shift+R / Cmd+Shift+R):')
console.log('  bundle layers are assembled at boot, and the client bundle is served')
console.log('  with an immutable cache header, so a plain reload keeps the old copy.')
