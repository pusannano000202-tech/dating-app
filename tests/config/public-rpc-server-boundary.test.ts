import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function readSource(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), 'utf8')
}

test('signed-out aggregate and invite lookups stay behind server-only Supabase credentials', () => {
  const inviteRoute = readSource('app/api/group-invites/route.ts')
  const statsRoute = readSource('app/api/match-pool/stats/route.ts')

  assert.match(inviteRoute, /createSupabaseAdminClient/)
  assert.match(inviteRoute, /\^\[a-f0-9\]\{32\}\$/i)
  assert.match(inviteRoute, /service_unavailable/)
  assert.match(statsRoute, /createSupabaseAdminClient/)
  assert.match(statsRoute, /service_unavailable/)

  const getHandler = inviteRoute.slice(
    inviteRoute.indexOf('export async function GET'),
    inviteRoute.indexOf('export async function POST'),
  )
  const postHandler = inviteRoute.slice(inviteRoute.indexOf('export async function POST'))
  assert.match(getHandler, /const supabase = createSupabaseRequestClient\(req\)/)
  assert.equal(postHandler.match(/const supabase = createSupabaseRequestClient\(req\)/g)?.length, 1)
})

test('privileged read RPCs are not executable by browser roles', () => {
  const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
  const migrationName = readdirSync(migrationsDir)
    .filter((name) => name.endsWith('_harden_public_read_rpc_server_boundary.sql'))
    .sort()
    .at(-1)

  assert.ok(migrationName, 'server-boundary migration is required')
  const migration = readFileSync(join(migrationsDir, migrationName), 'utf8')

  assert.match(migration, /SET search_path = ''/)
  assert.match(migration, /FROM public\.group_invites/)
  assert.match(migration, /JOIN public\.groups/)
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.get_group_invite_by_token\(TEXT\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.get_match_pool_stats\(\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_group_invite_by_token\(TEXT\)\s+TO service_role/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_match_pool_stats\(\)\s+TO service_role/)
})
