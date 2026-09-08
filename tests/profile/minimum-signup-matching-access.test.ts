import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(join(
  process.cwd(),
  'supabase/migrations/20260905100002_minimum_matching_access.sql',
), 'utf8')

function functionBody(name: string, nextName?: string): string {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  assert.notEqual(start, -1, `${name} must be redefined by the forward migration`)
  const end = nextName
    ? migration.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : migration.indexOf('REVOKE ALL ON FUNCTION', start + 1)
  assert.notEqual(end, -1, `${name} must have a bounded body`)
  return migration.slice(start, end)
}

test('every current Tonight intake preserves its signature and uses canonical matching readiness', () => {
  const submit = functionBody('submit_tonight_application', 'accept_tonight_friend_invite')
  const accept = functionBody('accept_tonight_friend_invite', 'get_tonight_friend_invite')
  const invite = functionBody('get_tonight_friend_invite')

  assert.match(submit, /submit_tonight_application\([\s\S]*p_round_id UUID,[\s\S]*p_ranked_activity_ids UUID\[\],[\s\S]*p_matching_consent_accepted BOOLEAN,[\s\S]*p_matching_consent_version TEXT,[\s\S]*p_friend_invite_code TEXT DEFAULT NULL,[\s\S]*p_idempotency_key TEXT DEFAULT NULL/)
  assert.match(accept, /accept_tonight_friend_invite\([\s\S]*p_token_hash TEXT,[\s\S]*p_ranked_activity_ids UUID\[\],[\s\S]*p_matching_consent_accepted BOOLEAN,[\s\S]*p_matching_consent_version TEXT,[\s\S]*p_idempotency_key TEXT/)
  assert.match(invite, /get_tonight_friend_invite\([\s\S]*p_token_hash TEXT[\s\S]*\)/)

  assert.match(submit, /IF NOT public\.is_profile_matching_ready\(v_caller\) THEN[\s\S]*RAISE EXCEPTION 'matching_features_not_ready'/)
  assert.match(accept, /IF NOT public\.is_profile_matching_ready\(v_caller\) THEN[\s\S]*RAISE EXCEPTION 'matching_profile_not_ready'/)
  assert.match(invite, /v_profile_ready := public\.is_profile_matching_ready\(v_caller\)/)
  assert.doesNotMatch(`${submit}\n${accept}\n${invite}`, /profile\.is_profile_complete/)
})

test('matching gate keeps successful idempotent replay ahead of the new-write readiness check', () => {
  const submit = functionBody('submit_tonight_application', 'accept_tonight_friend_invite')
  const accept = functionBody('accept_tonight_friend_invite', 'get_tonight_friend_invite')

  assert.ok(submit.indexOf('RETURN QUERY SELECT v_existing.id') < submit.indexOf('is_profile_matching_ready(v_caller)'))
  assert.ok(submit.indexOf('is_profile_matching_ready(v_caller)') < submit.indexOf('INSERT INTO public.tonight_applications'))
  assert.ok(accept.indexOf("v_invite.status = 'accepted'") < accept.indexOf('is_profile_matching_ready(v_caller)'))
  assert.ok(accept.indexOf('is_profile_matching_ready(v_caller)') < accept.indexOf('INSERT INTO public.tonight_applications'))
})

test('Tonight readiness consumers retain the final least-privilege grants', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.submit_tonight_application\(UUID, UUID\[\], BOOLEAN, TEXT, TEXT, TEXT\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.submit_tonight_application\(UUID, UUID\[\], BOOLEAN, TEXT, TEXT, TEXT\)\s*TO service_role/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_tonight_friend_invite\(TEXT\)\s*TO authenticated/)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.accept_tonight_friend_invite\(TEXT, UUID\[\], BOOLEAN, TEXT, TEXT\)\s*TO authenticated/)
})
