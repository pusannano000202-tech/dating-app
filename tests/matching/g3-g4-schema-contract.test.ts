import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SQL_PATH = path.join(
  process.cwd(),
  'docs/implementation/community-voice/g3-g4-schema.sql',
)

function sql(): string {
  return readFileSync(SQL_PATH, 'utf8')
}

test('department identity snapshots are private, immutable, and captured for Tonight and weekly intake', () => {
  const source = sql()
  assert.match(source, /create or replace function quantum_private\.get_member_department_identity\(p_user_id uuid\)/i)
  assert.match(source, /alter table quantum_private\.tonight_applicant_features[\s\S]*add column if not exists department_key text/i)
  assert.match(source, /before insert on quantum_private\.tonight_applicant_features/i)
  assert.match(source, /before update of school_scope_key, department_key[\s\S]*department_snapshot_immutable/i)
  assert.match(source, /alter table public\.quantum_weekly_application_members[\s\S]*add column if not exists department_key text/i)
})

test('Tonight allocator input and publish wrapper carry and enforce department snapshots', () => {
  const source = sql()
  assert.match(source, /'school_scope_key', feature\.school_scope_key/i)
  assert.match(source, /'department_key', feature\.department_key/i)
  assert.match(source, /same_department_random_unit/i)
  assert.match(source, /service_publish_tonight_allocation_impl_20260902201247/i)
  assert.match(source, /grant execute on function public\.service_publish_tonight_allocation\(uuid, integer, jsonb, text\)[\s\S]*to service_role/i)
})

test('same-school participation summary exposes exact counts without a small-count suppression branch', () => {
  const source = sql()
  assert.match(source, /create or replace function public\.get_my_tonight_participation_summary\(p_round_id uuid\)/i)
  assert.match(source, /'disclosureBasis', 'all_valid_participants'/i)
  assert.match(source, /'otherOrUnspecifiedPeople'/i)
  assert.match(source, /or exists \([\s\S]*from public\.tonight_applications as mine/i)
  assert.doesNotMatch(source, /small_count|min(?:imum)?_sample|suppression/i)
})

test('weekly discovery separates active applicant people from assigned people and excludes partial parties', () => {
  const source = sql()
  assert.match(source, /'applicant_count'/i)
  assert.match(source, /application_row\.status = 'active'/i)
  assert.match(source, /member\.consent_status = 'accepted'/i)
  assert.match(source, /member\.lifecycle_status = 'active'/i)
  assert.match(source, /'assigned_count'/i)
})

test('weekly allocation review and execution are school scoped, revisioned, idempotent, and service atomic', () => {
  const source = sql()
  assert.match(source, /weekly_allocation_operator_grants/i)
  assert.match(source, /weekly_allocation:(?:review|execute)/i)
  assert.match(source, /weekly_allocation_proposals/i)
  assert.match(source, /expected_revision/i)
  assert.match(source, /idempotency_key/i)
  assert.match(source, /create or replace function public\.service_execute_weekly_allocation_batch/i)
  assert.match(source, /create or replace function public\.service_create_weekly_allocation_proposal/i)
  assert.match(source, /create or replace function public\.service_get_weekly_allocator_input/i)
  assert.match(source, /create or replace function public\.super_admin_set_weekly_allocation_operator_grant/i)
  assert.match(source, /create or replace function public\.super_admin_get_weekly_allocation_operator_grant/i)
  assert.match(source, /create or replace function public\.operator_get_weekly_allocation_proposal/i)
  assert.match(source, /actor_kind[\s\S]*'service'[\s\S]*'complete'/i)
  assert.match(source, /actor_kind[\s\S]*'service'[\s\S]*'fail'/i)
  assert.match(source, /auth\.role\(\)[\s\S]*service_role_required/i)
})

test('snapshot backfills are correlated and legacy occurrence members cannot bypass department checks', () => {
  const source = sql()
  assert.doesNotMatch(
    source,
    /set school_scope_key = identity\.school_scope_key,[\s\S]*?from quantum_private\.get_member_department_identity\((?:feature|member)\./i,
  )
  assert.match(source, /assert_weekly_department_compatibility[\s\S]*quantum_event_participations/i)
  assert.match(source, /existing_department_identity_missing/i)
})

test('all new private tables and public definer functions have explicit privilege boundaries', () => {
  const source = sql()
  assert.match(source, /enable row level security/i)
  assert.match(source, /revoke all on table quantum_private\.weekly_allocation_operator_grants[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(source, /revoke all on function public\.get_my_tonight_participation_summary\(uuid\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(source, /grant execute on function public\.get_my_tonight_participation_summary\(uuid\)[\s\S]*to authenticated/i)
})
