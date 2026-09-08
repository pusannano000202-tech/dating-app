import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const routeUrl = new URL(
  '../../app/api/admin/community/sports-events/route.ts',
  import.meta.url,
)

test('sports admin route uses the request guard and a mutation-origin check', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /requireRequestAccess\(request/)
  assert.match(source, /allowedRoles: \['admin', 'super_admin'\]/)
  assert.match(source, /checkMutationOrigin: request\.method !== 'GET'/)
  assert.match(source, /createSupabaseRequestClient\(request\)/)
})

test('sports admin route forwards only parsed create or update payloads', async () => {
  const source = await readFile(routeUrl, 'utf8')
  assert.match(source, /parseSportsEventMutation\(await voiceBody\(request\)\)/)
  assert.match(source, /const \{ action, \.\.\.payload \} = mutation/)
  assert.match(source, /command\(request, action, payload\)/)
  assert.match(source, /community_sports_event_command/)
})
