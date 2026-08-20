import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const route = readFileSync(
  join(process.cwd(), 'app', 'api', 'admin', 'matches', 'create', 'route.ts'),
  'utf8',
)

test('admin match creation authenticates admin and delegates scoring to private server orchestration', () => {
  assert.match(route, /rpc\('is_admin'/)
  assert.match(route, /createSupabaseAdminClient/)
  assert.match(route, /createPrivatePendingMatch/)
  assert.match(route, /isUuid\(groupA\)/)
  assert.match(route, /isUuid\(groupB\)/)
  assert.doesNotMatch(route, /body\.score/)
  assert.doesNotMatch(route, /body\.breakdown/)
  assert.doesNotMatch(route, /rpc\('admin_create_pending_match'/)
})
