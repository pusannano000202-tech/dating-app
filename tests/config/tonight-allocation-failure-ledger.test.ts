import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const read = (relativePath: string): string =>
  readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const MIGRATION =
  'supabase/migrations/20260903040909_tonight_allocator_failure_ledger.sql'

test('allocator failures are durable, revisioned, bounded, and PII-free', () => {
  const migration = read(MIGRATION)

  assert.match(migration, /CREATE TABLE IF NOT EXISTS quantum_private\.tonight_allocator_failures/i)
  assert.match(migration, /round_id UUID PRIMARY KEY[\s\S]*?REFERENCES public\.tonight_rounds/i)
  assert.match(migration, /lower_bound_team_count INTEGER NOT NULL/i)
  assert.match(migration, /upper_bound_team_count INTEGER NOT NULL/i)
  assert.match(migration, /applicant_count INTEGER NOT NULL/i)
  assert.match(migration, /attempted_at TIMESTAMPTZ NOT NULL/i)
  assert.match(migration, /status TEXT NOT NULL[\s\S]*?CHECK \(status IN \('open', 'resolved'\)\)/i)
  assert.match(migration, /revision INTEGER NOT NULL DEFAULT 0/i)
  assert.match(migration, /lower_bound_team_count <= upper_bound_team_count/i)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL ON TABLE quantum_private\.tonight_allocator_failures[\s\S]*?PUBLIC, anon, authenticated/i)
  assert.doesNotMatch(
    migration,
    /display_name|phone|email|photo|appearance|gender|age_years|subject_user|reporter_user/i,
  )
})

test('service record and resolve RPCs are idempotent while the admin reader is keyset bounded', () => {
  const migration = read(MIGRATION)

  assert.match(migration, /FUNCTION public\.service_record_tonight_allocator_failure\(/i)
  assert.match(migration, /p_expected_round_revision INTEGER/i)
  assert.match(migration, /pg_catalog\.pg_advisory_xact_lock[\s\S]*?tonight-round-transition:/i)
  assert.match(migration, /FROM public\.tonight_rounds AS round_row[\s\S]*?FOR UPDATE/i)
  assert.match(migration, /v_round\.revision <> p_expected_round_revision/i)
  assert.match(migration, /v_round\.status <> 'open'/i)
  assert.match(
    migration,
    /CURRENT_TIMESTAMP < v_round\.allocation_publish_at[\s\S]*?CURRENT_TIMESTAMP >= v_round\.deposit_due_at/i,
  )
  assert.match(migration, /mutation_outcome[\s\S]*?'stale'/i)
  assert.match(migration, /INSERT INTO quantum_private\.tonight_allocator_failures/i)
  assert.match(migration, /ON CONFLICT \(round_id\) DO UPDATE/i)
  assert.match(migration, /last_record_idempotency_key IS DISTINCT FROM/i)
  assert.match(migration, /FUNCTION public\.service_resolve_tonight_allocator_failure\(/i)
  assert.match(migration, /v_round\.status NOT IN \('awaiting_deposits', 'completed'\)/i)
  assert.match(migration, /status = 'resolved'/i)
  assert.match(migration, /FUNCTION public\.admin_list_tonight_allocator_failures\(/i)
  assert.match(migration, /IF NOT public\.is_admin\(v_caller\)/i)
  assert.match(migration, /p_limit IS NULL OR p_limit < 1 OR p_limit > 50/i)
  assert.match(migration, /\(failure\.attempted_at, failure\.round_id\) < \(p_before_attempted_at, p_before_round_id\)/i)
  assert.match(migration, /LIMIT p_limit \+ 1/i)
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.service_record_tonight_allocator_failure\([\s\S]*?TO service_role/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.service_resolve_tonight_allocator_failure\([\s\S]*?TO service_role/i,
  )
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.admin_list_tonight_allocator_failures\([\s\S]*?TO authenticated/i,
  )
})

test('allocation automation records unproven output and resolves only after publish succeeds', () => {
  const route = read('app/api/internal/tonight/allocate/route.ts')
  const unproven = route.indexOf("publish.status === 'allocation_unproven'")
  const record = route.indexOf("service_record_tonight_allocator_failure", unproven)
  const publish = route.indexOf('service_publish_tonight_allocation', record)
  const resolve = route.indexOf('service_resolve_tonight_allocator_failure', publish)

  assert.ok(unproven >= 0)
  assert.ok(record > unproven, 'unproven output must be durably recorded')
  assert.ok(publish > record, 'a recovered allocation must publish before resolving the incident')
  assert.ok(resolve > publish, 'publish failure must leave the prior incident open')
  assert.match(route, /failure_ledger_resolution_failed_count:/)
  assert.match(route, /p_expected_round_revision:\s*parsed\.round\.revision/)
  assert.match(route, /recordOutcome === 'stale'/)
  assert.match(route, /status:\s*'allocation_unproven_stale'/)
  assert.match(route, /p_expected_round_revision:\s*parsed\.round\.revision \+ 1/)
  assert.match(route, /resolveOutcome !== 'resolved'[\s\S]*?resolveOutcome !== 'no_failure'/)
  assert.match(route, /p_lower_bound_team_count:\s*publish\.certification\.lower_bound_team_count/)
  assert.match(route, /p_upper_bound_team_count:\s*publish\.certification\.upper_bound_team_count/)
  assert.match(route, /p_applicant_count:\s*parsed\.allocationInput\.applicants\.length/)
})

test('admins receive a sanitized allocator-failure page and a read-only operational warning', () => {
  const route = read('app/api/admin/tonight/allocation-failures/route.ts')
  const types = read('components/tonight/types.ts')
  const adapter = read('components/tonight/live-adapters.ts')
  const consoleSource = read('components/tonight/AdminTonightConsole.tsx')
  const rehearsal = read('components/tonight/rehearsal-fixtures.ts')

  assert.match(route, /allowedRoles: \['admin', 'super_admin'\]/)
  assert.match(route, /admin_list_tonight_allocator_failures/)
  assert.match(route, /p_limit:\s*limit/)
  assert.match(route, /rows\.length > limit/)
  assert.match(route, /attemptedAt:\s*last\.attempted_at/)
  assert.doesNotMatch(route, /phone|email|photo|display_name|appearance/i)
  assert.match(types, /export type AllocatorFailureView/)
  assert.match(types, /allocationFailures:\s*readonly AllocatorFailureView\[\]/)
  assert.match(adapter, /api\/admin\/tonight\/allocation-failures\?/) 
  assert.match(adapter, /allocationFailures:\s*mapAllocatorFailures/)
  assert.match(consoleSource, /팀 편성 자동화 중단/)
  assert.match(consoleSource, /편성은 게시됐고 예외 기록 정리 필요/)
  assert.match(consoleSource, /isPostAllocationRoundStatus\(activeRound\.status\)/)
  assert.match(consoleSource, /운영자는 조회만 가능/)
  assert.doesNotMatch(consoleSource, /retryAllocator|allocation-failures\/retry/)
  assert.match(rehearsal, /errorCode:\s*'allocation_unproven'/)
})
