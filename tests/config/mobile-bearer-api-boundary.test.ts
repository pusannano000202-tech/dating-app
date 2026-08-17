import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const requestAuthenticatedRoutes = [
  'app/api/meetups/route.ts',
  'app/api/meetups/[id]/join/route.ts',
  'app/api/friend-requests/route.ts',
  'app/api/friend-requests/[id]/accept/route.ts',
  'app/api/friend-requests/[id]/decline/route.ts',
  'app/api/friends/department-sync/route.ts',
  'app/api/group-invites/route.ts',
  'app/api/group-invites/accept/route.ts',
  'app/api/notifications/route.ts',
  'app/api/notifications/read/route.ts',
  'app/api/deposits/route.ts',
  'app/api/score/route.ts',
  'app/api/score/invalidate/route.ts',
  'app/api/community/posts/route.ts',
  'app/api/community/posts/[id]/route.ts',
  'app/api/community/posts/[id]/like/route.ts',
  'app/api/community/reviewable-meetups/route.ts',
  'app/api/friend-date-proposals/route.ts',
  'app/api/friend-date-proposals/[id]/respond/route.ts',
  'app/api/friend-date-proposals/[id]/cancel/route.ts',
  'app/api/match/event-participation/route.ts',
  'app/api/match/events/rooms/route.ts',
  'app/api/match/event-room-invites/route.ts',
  'app/api/match/event-room-invites/accept/route.ts',
  'app/api/matches/[id]/review/route.ts',
  'app/api/matches/[id]/refund/route.ts',
  'app/api/matches/[id]/deposit-carryover/route.ts',
]

test('mobile social, meetup, deposit, and appearance routes accept request-scoped Bearer auth', () => {
  for (const path of requestAuthenticatedRoutes) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /createSupabaseRequestClient\(\w+\)/, `${path} must use request-scoped auth`)
    assert.doesNotMatch(source, /createSupabaseServerClient\(\)/, `${path} must not ignore Bearer auth`)
  }
})

test('Next 15 server auth awaits cookies while request auth reads the request cookie header', () => {
  const serverHelper = readFileSync('lib/supabase-server.ts', 'utf8')
  const requestHelper = readFileSync('lib/supabase-request.ts', 'utf8')

  assert.match(serverHelper, /export async function createSupabaseServerClient\(\)/)
  assert.match(serverHelper, /await cookies\(\)/)
  assert.doesNotMatch(serverHelper, /UnsafeUnwrappedCookies/)

  assert.match(requestHelper, /parseCookieHeader/)
  assert.match(requestHelper, /request\.headers\.get\(['"]cookie['"]\)/)
  assert.doesNotMatch(requestHelper, /createSupabaseServerClient/)

  for (const file of collectSourceFiles('app')) {
    const source = readFileSync(file, 'utf8')
    const calls = source.match(/createSupabaseServerClient\(\)/g)?.length ?? 0
    const awaitedCalls = source.match(/await\s+createSupabaseServerClient\(\)/g)?.length ?? 0

    assert.equal(
      awaitedCalls,
      calls,
      `${file} must await every createSupabaseServerClient() call`,
    )
  }
})

function collectSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(root, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(fullPath)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}
