import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const ROOT = process.cwd()
const migrationPath = join(ROOT, 'supabase/migrations/20260903104000_tonight_account_onboarding.sql')
const sql = () => readFileSync(migrationPath, 'utf8')

test('initial owner bootstrap is service-only, serialized, and refuses a second super admin', () => {
  const source = sql()
  assert.match(source, /bootstrap_initial_super_admin/)
  assert.match(source, /pg_advisory_xact_lock/)
  assert.match(source, /auth\.role\(\)[\s\S]*service_role|session_user[\s\S]*postgres/i)
  assert.match(source, /super_admin_already_bootstrapped/)
  assert.match(source, /REVOKE ALL ON FUNCTION quantum_private\.bootstrap_initial_super_admin/)
  assert.match(source, /GRANT EXECUTE ON FUNCTION quantum_private\.bootstrap_initial_super_admin\(UUID\) TO service_role/)
  assert.doesNotMatch(source, /GRANT EXECUTE ON FUNCTION quantum_private\.bootstrap_initial_super_admin\(UUID\) TO authenticated/)
})

test('partner invitations store only a digest and require claim then recent-auth approval', () => {
  const source = sql()
  assert.match(source, /CREATE TABLE public\.tonight_partner_onboarding_invites/)
  assert.match(source, /token_hash TEXT NOT NULL UNIQUE/)
  assert.match(source, /invited_user_id UUID NOT NULL/)
  assert.doesNotMatch(source, /raw_token\s+TEXT/i)
  assert.match(source, /create_tonight_partner_invite/)
  assert.match(source, /claim_tonight_partner_invite/)
  assert.match(source, /approve_tonight_partner_invite/)
  assert.match(source, /cancel_tonight_partner_invite/)
  assert.match(source, /FOR UPDATE/)
  assert.match(source, /invite_target_mismatch/)
  assert.match(source, /invite_expired/)
  assert.match(source, /invite_already_used/)
  assert.match(source, /require_recent_super_admin_auth/)
  assert.match(source, /grant_venue_partner_membership/)
})

test('partner invitation target and pending pair are serialized and fail closed inside the database', () => {
  const source = sql()
  assert.match(source, /partner-invite-pair:[\s\S]*?p_venue_id[\s\S]*?p_invited_user_id/)
  assert.match(source, /invite_target_not_ordinary_user/)
  const getter = source.match(/CREATE OR REPLACE FUNCTION public\.get_tonight_partner_invite[\s\S]*?\$\$;/)?.[0]
  assert.ok(getter)
  assert.match(getter, /invite\.invited_user_id = v_caller/)
})

test('admin and partner grants share a per-user lock and approval rechecks exclusive role ownership', () => {
  const source = sql()
  assert.match(source, /quantum:exclusive-access-role:/)
  assert.match(source, /CREATE TRIGGER admins_partner_role_exclusivity/)
  assert.match(source, /CREATE TRIGGER venue_partners_admin_role_exclusivity/)
  const approve = source.match(/CREATE OR REPLACE FUNCTION public\.approve_tonight_partner_invite[\s\S]*?\$\$;/)?.[0]
  assert.ok(approve)
  assert.match(approve, /lock_tonight_exclusive_access_role\(v_invite\.claimed_by_user_id\)/)
  assert.match(approve, /SELECT 1 FROM public\.admins[\s\S]*?claimed_by_user_id/)
  assert.match(approve, /SELECT 1 FROM public\.venue_partner_memberships[\s\S]*?claimed_by_user_id[\s\S]*?revoked_at IS NULL/)
})

test('claim approval cancellation and market review replay their canonical mutation event', () => {
  const source = sql()
  for (const action of ['partner-claim:', 'partner-approve:', 'partner-cancel:', 'market-approve:', 'market-reject:']) {
    assert.match(source, new RegExp(`idempotency_key = '${action}' \\|\\| pg_catalog\\.btrim\\(p_idempotency_key\\)`))
  }
  assert.match(source, /idempotency_conflict/)
})

test('an alternate idempotency key that observes an existing market request is also durably replayable', () => {
  const source = sql()
  const request = source.match(/CREATE OR REPLACE FUNCTION public\.request_my_tonight_market_membership[\s\S]*?\$\$;/)?.[0]
  assert.ok(request)
  assert.match(request, /IF FOUND THEN[\s\S]*?INSERT INTO quantum_private\.tonight_account_onboarding_events[\s\S]*?'market-request:' \|\| pg_catalog\.btrim\(p_idempotency_key\)[\s\S]*?RETURN v_id/)
})

test('partner invite tables are private and expose only bounded security-definer RPCs', () => {
  const source = sql()
  assert.match(source, /ALTER TABLE public\.tonight_partner_onboarding_invites ENABLE ROW LEVEL SECURITY/)
  assert.match(source, /REVOKE ALL ON TABLE public\.tonight_partner_onboarding_invites[\s\S]*?PUBLIC, anon, authenticated/)
  assert.match(source, /SET search_path = ''/)
  assert.match(source, /CREATE TRIGGER tonight_partner_onboarding_invites_guard/)
  assert.match(source, /partner_invite_delete_forbidden/)
})

test('PNU access uses a fail-closed review queue because legacy school email proof is retired', () => {
  const source = sql()
  assert.match(source, /CREATE TABLE public\.tonight_market_membership_requests/)
  assert.match(source, /manual_review_required/)
  assert.match(source, /request_my_tonight_market_membership/)
  assert.match(source, /approve_tonight_market_membership_request/)
  assert.match(source, /reject_tonight_market_membership_request/)
  assert.doesNotMatch(source, /school_email_verified_at/)
  assert.match(source, /super_admin_grant_tonight_market_membership/)
})

test('onboarding changes retain automatic actor/time/before/after evidence', () => {
  const source = sql()
  assert.match(source, /CREATE TABLE quantum_private\.tonight_account_onboarding_events/)
  assert.match(source, /actor_user_id/)
  assert.match(source, /occurred_at/)
  assert.match(source, /before_state/)
  assert.match(source, /after_state/)
  assert.match(source, /idempotency_key/)
  assert.match(source, /prevent_tonight_account_onboarding_event_mutation/)
})

test('every onboarding mutation validates the same bounded idempotency contract before writing', () => {
  const source = sql()
  const mutationNames = [
    'create_tonight_partner_invite',
    'claim_tonight_partner_invite',
    'approve_tonight_partner_invite',
    'cancel_tonight_partner_invite',
    'request_my_tonight_market_membership',
    'approve_tonight_market_membership_request',
    'reject_tonight_market_membership_request',
  ]

  for (const name of mutationNames) {
    const body = source.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}[\\s\\S]*?\\$\\$;`))?.[0]
    assert.ok(body, `${name} function body should exist`)
    assert.match(body, /p_idempotency_key[\s\S]*NOT BETWEEN 8 AND 128/, `${name} should reject weak or oversized keys`)
  }
})

test('partner invite mutation guards use separate update and delete triggers', () => {
  const source = sql()
  assert.doesNotMatch(source, /BEFORE UPDATE OR DELETE ON public\.tonight_partner_onboarding_invites/)
  assert.match(source, /BEFORE UPDATE ON public\.tonight_partner_onboarding_invites/)
  assert.match(source, /BEFORE DELETE ON public\.tonight_partner_onboarding_invites/)
})
