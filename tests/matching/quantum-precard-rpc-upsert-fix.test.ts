import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814023300_matching_precard_rpc_upsert_fix.sql',
  ),
  'utf8',
)

test('precard save RPC targets the primary-key constraint without an ambiguous column reference', () => {
  assert.match(migration, /FUNCTION public\.save_my_pre_match_card_draft/i)
  assert.match(
    migration,
    /ON CONFLICT ON CONSTRAINT pre_match_card_drafts_pkey DO UPDATE/i,
  )
  assert.doesNotMatch(migration, /ON CONFLICT \(user_id\)/i)
  assert.match(migration, /SECURITY DEFINER[\s\S]*SET search_path = ''/i)
})
