import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/20260814023200_matching_precard_rpc_boundary.sql',
  ),
  'utf8',
)

test('precard RPCs derive the owner from auth uid and expose no user id input', () => {
  assert.match(migration, /FUNCTION public\.get_my_pre_match_card_draft\(\)/i)
  assert.match(migration, /FUNCTION public\.save_my_pre_match_card_draft\(\s*p_content_text TEXT,\s*p_completed_items SMALLINT\s*\)/i)
  assert.doesNotMatch(migration, /p_user_id/i)
  assert.match(migration, /auth\.uid\(\)/i)
  assert.match(migration, /SECURITY DEFINER/i)
  assert.match(migration, /SET search_path = ''/i)
})

test('precard RPC boundary removes direct browser table access', () => {
  assert.match(
    migration,
    /REVOKE ALL ON TABLE public\.pre_match_card_drafts FROM PUBLIC, anon, authenticated/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_my_pre_match_card_draft\(\) TO authenticated/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.save_my_pre_match_card_draft\(TEXT, SMALLINT\) TO authenticated/i,
  )
  assert.doesNotMatch(migration, /GRANT .* ON TABLE public\.pre_match_card_drafts/i)
})
