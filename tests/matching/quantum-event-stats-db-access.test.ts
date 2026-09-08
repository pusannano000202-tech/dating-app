import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const route = readFileSync(
  join(process.cwd(), 'app/api/match/events/stats/route.ts'),
  'utf8',
)
const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260810213000_quantum_event_stats_profile_gender_rpc.sql',
  ),
  'utf8',
)

test('event stats reads only the profile genders it needs through a server-only RPC', () => {
  assert.match(route, /\.rpc\(\s*'get_quantum_event_profile_genders'/)
  assert.doesNotMatch(route, /\.from\('profiles'\)/)

  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.get_quantum_event_profile_genders\(\s*p_user_ids UUID\[\]\s*\)/i,
  )
  assert.match(migration, /RETURNS TABLE\(user_id UUID, gender TEXT\)/i)
  assert.match(migration, /SECURITY DEFINER/i)
  assert.match(migration, /SET search_path = ''/i)
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.get_quantum_event_profile_genders\(UUID\[\]\)\s+FROM PUBLIC, anon, authenticated/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_quantum_event_profile_genders\(UUID\[\]\)\s+TO service_role/i,
  )
  assert.doesNotMatch(migration, /GRANT\s+SELECT[\s\S]*?public\.profiles/i)
})
