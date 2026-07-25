import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function readSource(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

test('matching security migration closes direct card, identity, group, and queue mutation paths', () => {
  const migration = readSource(
    'supabase/migrations/20260723150000_matching_security_hardening.sql',
  )

  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS quantum_private/i)
  assert.match(migration, /REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /CREATE POLICY match_card_submissions_select_self[\s\S]*auth\.uid\(\)[\s\S]*user_id/i)
  assert.match(migration, /REVOKE ALL ON TABLE public\.match_member_aliases[\s\S]*authenticated/i)
  assert.match(migration, /REVOKE ALL ON TABLE public\.match_daily_card_schedule[\s\S]*authenticated/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.create_group_with_leader/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.update_group_size/i)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.enter_match_pool/i)
  assert.match(migration, /IF v_group\.status <> 'forming' THEN/i)
  assert.doesNotMatch(migration, /v_group\.status NOT IN \('forming', 'ready'\)/i)
  assert.match(migration, /quantum_private\.match_setup_ready\(member\.user_id\)/i)
  assert.match(migration, /DROP POLICY IF EXISTS "groups_leader_write" ON public\.groups/i)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.groups[\s\S]*authenticated/i)
  assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.match_pool[\s\S]*authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.populate_match_member_aliases\(UUID\)[\s\S]*authenticated/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.assign_match_daily_card_schedule\(UUID\)[\s\S]*authenticated/i)
  assert.match(migration, /SET search_path = ''/i)
})

test('groups API requires atomic RPCs and never falls back to direct writes', () => {
  const route = readSource('app/api/groups/route.ts')

  assert.match(route, /\.rpc\('create_group_with_leader'/)
  assert.match(route, /\.rpc\('update_group_size'/)
  assert.match(route, /function isRpcUnavailableError/)
  assert.match(route, /error\.code === 'PGRST202'/)
  assert.match(route, /group_create_rpc_unavailable/)
  assert.match(route, /group_size_rpc_unavailable/)
  assert.doesNotMatch(route, /\.from\('groups'\)\s*\.insert\(/)
  assert.doesNotMatch(route, /\.from\('group_members'\)\s*\.insert\(/)
  assert.doesNotMatch(route, /\.from\('groups'\)\s*\.update\(\{\s*size\s*\}\)/)
})
