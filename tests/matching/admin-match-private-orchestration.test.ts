import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(
  join(process.cwd(), 'app', 'api', 'admin', 'matches', 'create', 'route.ts'),
  'utf8',
)

test('manual match creation requires recent super-admin access and delegates scoring privately', () => {
  assert.match(route, /requireRequestAccess/)
  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.ok(
    route.indexOf('requireRequestAccess(req') < route.indexOf('readJson(req)'),
    'authorization must run before parsing the mutation body',
  )
  assert.match(route, /createSupabaseAdminClient/)
  assert.match(route, /createPrivatePendingMatch/)
  assert.match(route, /isUuid\(groupA\)/)
  assert.match(route, /isUuid\(groupB\)/)
  assert.doesNotMatch(route, /body\.score/)
  assert.doesNotMatch(route, /body\.breakdown/)
  assert.doesNotMatch(route, /rpc\('admin_create_pending_match'/)
})
