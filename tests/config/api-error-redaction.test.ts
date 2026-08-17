import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const exposedApiRoutes = [
  'app/api/admin/config/route.ts',
  'app/api/admin/matches/[id]/review/route.ts',
  'app/api/admin/matches/pending/route.ts',
  'app/api/admin/users/[id]/appearance-override/route.ts',
  'app/api/groups/transfer-leadership/route.ts',
  'app/api/groups/remove-member/route.ts',
  'app/api/groups/leave/route.ts',
  'app/api/groups/disband/route.ts',
  'app/api/group-invites/accept/route.ts',
  'app/api/friend-requests/[id]/accept/route.ts',
  'app/api/friend-requests/[id]/cancel/route.ts',
  'app/api/friend-requests/[id]/decline/route.ts',
  'app/api/notifications/read/route.ts',
  'app/api/deposits/summary/route.ts',
  'app/api/match-pool/cancel/route.ts',
  'app/api/matches/[id]/route.ts',
  'app/api/matches/[id]/card/route.ts',
  'app/api/matches/[id]/cancel/route.ts',
  'app/api/matches/[id]/checkin/route.ts',
  'app/api/matches/[id]/attendance-state/route.ts',
  'app/api/matches/[id]/continuation/route.ts',
  'app/api/matches/[id]/daily-cards/route.ts',
  'app/api/matches/[id]/confirm/route.ts',
]

test('database details are redacted from user-facing API responses', () => {
  const helper = readFileSync(join(process.cwd(), 'lib/api/public-error.ts'), 'utf8')
  assert.match(helper, /PUBLIC_ERROR_CODE/)
  assert.match(helper, /return fallback/)

  for (const relativePath of exposedApiRoutes) {
    const source = readFileSync(join(process.cwd(), relativePath), 'utf8')
    assert.doesNotMatch(source, /(?:error|detailError)\.message\s*\|\|/)
  }
})
