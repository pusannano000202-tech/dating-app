import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sql = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814014000_deposit_post_match_settlement_and_qa_cleanup.sql',
  ),
  'utf8',
)

test('completed match settlement accepts historical membership but still requires caller deposit ownership', () => {
  const carryover = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.choose_deposit_carryover'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.prepare_refund_request'),
  )
  const refund = sql.slice(
    sql.indexOf('CREATE OR REPLACE FUNCTION public.prepare_refund_request'),
    sql.indexOf('CREATE OR REPLACE FUNCTION public.cleanup_deposit_settlement_qa_fixture'),
  )

  for (const functionSql of [carryover, refund]) {
    assert.match(functionSql, /gm\.user_id = v_caller/)
    assert.doesNotMatch(functionSql, /gm\.left_at IS NULL/)
    assert.match(functionSql, /d\.match_id = p_match_id[\s\S]*d\.user_id = v_caller/)
  }
})

test('deposit QA cleanup is service-only and bounded by run and suite tags', () => {
  assert.match(sql, /p_run_id !~ '\^qa-release-/)
  assert.match(sql, /raw_user_meta_data ->> 'qa_run_id' = p_run_id/)
  assert.match(sql, /raw_user_meta_data ->> 'qa_suite' = 'deposit-settlement'/)
  assert.match(sql, /score_breakdown ->> 'source' = 'release_qa'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.cleanup_deposit_settlement_qa_fixture\(TEXT\)[\s\S]*PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.cleanup_deposit_settlement_qa_fixture\(TEXT\)[\s\S]*TO service_role/)
})
