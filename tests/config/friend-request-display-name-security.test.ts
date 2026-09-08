import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814018000_friend_request_by_display_name.sql',
  ),
  'utf8',
)
const route = fs.readFileSync(
  path.join(process.cwd(), 'app/api/friend-requests/route.ts'),
  'utf8',
)
const retirement = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814019000_retire_profile_display_name_resolver.sql',
  ),
  'utf8',
)
const unorderedPairHardening = fs.readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260814020000_friend_request_unordered_pair_idempotency.sql',
  ),
  'utf8',
)

test('nickname friend requests are atomic, rate limited, and do not return the target user id', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS private\.friend_request_lookup_rate_limits/)
  assert.match(migration, /v_count > 12/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.request_friend_by_display_name/)
  assert.match(migration, /v_caller UUID := auth\.uid\(\)/)
  assert.match(migration, /RETURNS TABLE \([\s\S]*request_id UUID[\s\S]*request_status TEXT[\s\S]*duplicate BOOLEAN/)
  assert.doesNotMatch(migration, /RETURNS TABLE \([\s\S]*user_id UUID/)
  assert.match(migration, /NULL::UUID, 'unavailable'::TEXT, false/)
  assert.doesNotMatch(migration, /RAISE EXCEPTION 'nickname_not_found'/)
  assert.doesNotMatch(migration, /RAISE EXCEPTION 'cannot_send_to_self'/)
  assert.doesNotMatch(migration, /RAISE EXCEPTION 'already_friends'/)
  assert.match(route, /request_friend_by_display_name/)
  assert.match(route, /recipient_unavailable/)
  assert.doesNotMatch(route, /\.rpc\('resolve_profile_display_name'/)
  assert.match(
    retirement,
    /REVOKE ALL ON FUNCTION public\.resolve_profile_display_name\(TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated/,
  )
  assert.match(unorderedPairHardening, /CREATE UNIQUE INDEX IF NOT EXISTS uq_friend_requests_pending_user_pair/)
  assert.match(unorderedPairHardening, /LEAST\(sender_user_id, receiver_user_id\)/)
  assert.match(unorderedPairHardening, /GREATEST\(sender_user_id, receiver_user_id\)/)
  assert.match(unorderedPairHardening, /Serialize both A-to-B and B-to-A requests/)
  assert.match(unorderedPairHardening, /UPDATE public\.friend_requests AS expired[\s\S]*expires_at <= now\(\)/)
})
