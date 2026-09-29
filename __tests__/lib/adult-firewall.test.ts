import {readdirSync, readFileSync, statSync} from 'node:fs'
import {join, relative} from 'node:path'

/**
 * FASE 15 — Social ↔ Adult firewall (static). Fails when a social surface
 * starts depending on +18 code, or +18 code starts writing to the public
 * social graph (likes, follows, posts, profile, preferences).
 */

const SRC = join(__dirname, '../../src')
const ADULT_DIRS = [
  'screens/Adult',
  'components/adult',
  'lib/adult',
  'state/adult',
]

/** Social-side files allowed to reference +18 modules, and why. */
const ALLOWED_IMPORTERS: Record<string, string> = {
  // Registers the gated /adult/* screens (each wrapped in AdultShell/AdultGate).
  'Navigation.tsx': 'route registration',
  // Clears the in-memory +18 entry and adult API token on session change.
  'state/session/index.tsx': 'teardown on logout/account switch',
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(name) ? [p] : []
  })
}

const files = walk(SRC).map(p => ({
  path: relative(SRC, p),
  code: readFileSync(p, 'utf8'),
}))
const isAdult = (path: string) => ADULT_DIRS.some(d => path.startsWith(d + '/'))

describe('social surfaces do not depend on +18 code', () => {
  it('only allow-listed files import adult modules', () => {
    const importers = files
      .filter(f => !isAdult(f.path))
      .filter(f =>
        /from '#\/(lib\/adult|state\/adult|screens\/Adult|components\/adult)/.test(
          f.code,
        ),
      )
      .map(f => f.path)
    expect(importers.sort()).toEqual(Object.keys(ALLOWED_IMPORTERS).sort())
  })

  it('the session only tears adult state down', () => {
    const session = files.find(f => f.path === 'state/session/index.tsx')!
    const adultImports = session.code
      .split('\n')
      .filter(l => /from '#\/(lib|state)\/adult/.test(l))
    expect(adultImports).toEqual([
      "import {clearAdultApiToken} from '#/lib/adult/api'",
      "import {clearAdultEntered} from '#/state/adult/entered'",
    ])
  })
})

describe('+18 code never writes to the public social graph', () => {
  const WRITES = [
    /\bagent\.(like|repost|follow|post|deleteLike|deleteFollow|deleteRepost|upsertProfile|mute|unmute)\(/,
    /\b(createRecord|putRecord|deleteRecord|applyWrites)\b/,
    /\bputPreferences\b/,
    /\bapp\.bsky\.feed\.(like|repost)\b/,
    /\bapp\.bsky\.graph\.(follow|block|listitem)\b(?!.*(would|never|NOT))/,
  ]
  it.each(files.filter(f => isAdult(f.path)).map(f => [f.path, f.code]))(
    '%s',
    (_path, code) => {
      const executable = (code as string)
        .split('\n')
        .filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n')
      for (const pattern of WRITES) expect(executable).not.toMatch(pattern)
    },
  )
})

describe('+18 data stays in its own cache namespace', () => {
  it('every adult react-query key goes through adultQueryKey', () => {
    for (const f of files.filter(x => isAdult(x.path))) {
      const raw = f.code.match(/queryKey:\s*\[(?!ADULT_QUERY_NAMESPACE)/g)
      expect([f.path, raw]).toEqual([f.path, null])
    }
  })
})
