import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  decodeTonightRoundCursor,
  normalizeTonightRoundPage,
} from '../../lib/server/tonight/round-page'

const source = (relative: string) => {
  const path = join(process.cwd(), relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

test('ten thousand synthetic rounds are capped to fifty with an opaque keyset cursor', () => {
  const rows = Array.from({ length: 10_000 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    starts_at: new Date(Date.UTC(2026, 8, 3) - index * 86_400_000).toISOString(),
  }))

  const page = normalizeTonightRoundPage(rows, 50)

  assert.equal(page.rounds.length, 50)
  assert.ok(page.nextCursor)
  assert.deepEqual(decodeTonightRoundCursor(page.nextCursor), {
    startsAt: rows[49].starts_at,
    id: rows[49].id,
  })
})

test('round cursors fail closed when malformed or incomplete', () => {
  assert.throws(() => decodeTonightRoundCursor('not-a-round-cursor'), /invalid_field/)
  const incomplete = Buffer.from(JSON.stringify({ v: 1, s: '2026-09-03T10:30:00.000Z' })).toString('base64url')
  assert.throws(() => decodeTonightRoundCursor(incomplete), /invalid_field/)
})

test('admin rounds route validates limit and cursor before calling the paged RPC', () => {
  const route = source('app/api/admin/tonight/rounds/route.ts')

  assert.match(route, /assertStrictSearchParams\(request, \['limit', 'cursor'\]\)/)
  assert.match(route, /asInteger\([\s\S]*?min: 1, max: 50/)
  assert.match(route, /decodeTonightRoundCursor/)
  assert.match(route, /p_limit:\s*limit/)
  assert.match(route, /p_before_starts_at:\s*cursor\?\.startsAt \?\? null/)
  assert.match(route, /p_before_id:\s*cursor\?\.id \?\? null/)
  assert.match(route, /next_cursor:\s*page\.nextCursor/)
})

test('live admin adapter consumes bounded round pages and preserves the opaque cursor', () => {
  const adapter = source('components/tonight/live-adapters.ts')

  assert.match(adapter, /\/api\/admin\/tonight\/rounds\?limit=50\$\{roundCursorQuery\}/)
  assert.match(adapter, /cursor=\$\{encodeURIComponent\(currentRoundCursor\)\}/)
  assert.match(adapter, /nextCursor:\s*nullableString\(roundsResponse\.next_cursor\)/)
  assert.doesNotMatch(adapter, /requestJson\('\/api\/admin\/tonight\/rounds'\)/)
})

test('operator and super-admin consoles can navigate to older and newer bounded round pages', () => {
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  for (const consoleSource of [admin, superAdmin]) {
    assert.match(consoleSource, /더 오래된 50회차/)
    assert.match(consoleSource, /더 최신 50회차/)
    assert.match(consoleSource, /roundCursor:/)
  }
})
