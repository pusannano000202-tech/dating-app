import assert from 'node:assert/strict'
import test from 'node:test'

import {
  APP_ORIGIN,
  buildProbePlan,
  parseVerifierInputs,
  validatePartnerSetupRound,
} from '../../scripts/qa/tonight-local-verify.mjs'

const RUNTIME = {
  schema_version: 1,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:56321/',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'local-service-key',
  LOCAL_SUPABASE_DB_CONTAINER: 'supabase_db_quantum-tonight-live-local',
  LOCAL_SUPABASE_DB_NAME: 'postgres',
  LOCAL_SUPABASE_DB_USER: 'postgres',
}

const IDS = {
  round: '00000000-0000-4000-8000-000000000010',
  venue: '00000000-0000-4000-8000-000000000011',
  foreignVenue: '00000000-0000-4000-8000-000000000012',
}

function credentialFixture() {
  return {
    schema_version: 1,
    namespace: 'quantum-tonight-local-v1',
    supabase_url: 'http://127.0.0.1:56321/',
    warning: 'LOCAL_SYNTHETIC_ONLY_NO_REAL_PAYMENT_NO_REMOTE',
    round_id: IDS.round,
    venue_id: IDS.venue,
    service_date: '2026-09-06',
    accounts: ['super-admin', 'admin', 'partner', 'user'].map((label, index) => ({
      label,
      email: `local-${label}@example.invalid`,
      password: `local-password-${index}`,
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    })),
  }
}

test('parseVerifierInputs accepts only the dedicated seeded local stack', () => {
  const parsed = parseVerifierInputs(RUNTIME, credentialFixture())

  assert.equal(parsed.runtime.url.href, 'http://127.0.0.1:56321/')
  assert.equal(parsed.roundId, IDS.round)
  assert.equal(parsed.venueId, IDS.venue)
  assert.equal(parsed.serviceDate, '2026-09-06')
  assert.deepEqual([...parsed.accounts.keys()], ['super-admin', 'admin', 'partner', 'user'])
})

test('parseVerifierInputs refuses credentials from another Supabase origin', () => {
  assert.throws(
    () => parseVerifierInputs(RUNTIME, {
      ...credentialFixture(),
      supabase_url: 'http://127.0.0.1:54321/',
    }),
    /local_verify_credential_target_invalid/,
  )
})

test('buildProbePlan covers anonymous and four roles with GET-only least privilege', () => {
  const plan = buildProbePlan({
    roundId: IDS.round,
    venueId: IDS.venue,
    foreignVenueId: IDS.foreignVenue,
  })
  const actors = ['anonymous', 'user', 'partner', 'admin', 'super-admin']
  const byEndpoint = Map.groupBy(plan, (probe) => probe.name)

  assert.equal(APP_ORIGIN, 'http://localhost:3004')
  assert.equal(plan.length, 36)
  assert.ok(plan.every((probe) => probe.method === 'GET'))
  assert.deepEqual([...new Set(plan.map((probe) => probe.actor))], actors)
  assert.ok([...byEndpoint]
    .filter(([name]) => name !== 'partner-dashboard-foreign')
    .every(([, probes]) => probes.length === actors.length))

  const status = (name, actor) => byEndpoint.get(name).find((probe) => probe.actor === actor).expectedStatus
  assert.equal(status('access-context', 'anonymous'), 401)
  assert.equal(status('access-context', 'partner'), 200)
  assert.equal(status('tonight', 'user'), 200)
  assert.equal(status('tonight', 'admin'), 403)
  assert.equal(status('partner-dashboard', 'partner'), 200)
  assert.equal(status('partner-dashboard', 'super-admin'), 403)
  assert.equal(status('partner-dashboard-owned', 'anonymous'), 401)
  assert.equal(status('partner-dashboard-owned', 'user'), 403)
  assert.equal(status('partner-dashboard-owned', 'partner'), 200)
  assert.equal(status('partner-dashboard-owned', 'admin'), 403)
  assert.equal(status('partner-dashboard-owned', 'super-admin'), 403)
  assert.equal(status('partner-dashboard-foreign', 'partner'), 404)
  assert.equal(status('partner-setup', 'anonymous'), 401)
  assert.equal(status('partner-setup', 'user'), 403)
  assert.equal(status('partner-setup', 'partner'), 200)
  assert.equal(status('partner-setup', 'admin'), 403)
  assert.equal(status('partner-setup', 'super-admin'), 403)
  assert.equal(status('admin-summary', 'admin'), 200)
  assert.equal(status('admin-summary', 'super-admin'), 200)
  assert.equal(status('admin-summary', 'partner'), 403)
  assert.equal(status('admin-config', 'super-admin'), 200)
  assert.equal(status('admin-config', 'admin'), 403)
})

test('partner setup verifier requires the exact seeded PNU schedule without mapper fallbacks', () => {
  const inputs = parseVerifierInputs(RUNTIME, credentialFixture())
  const round = {
    id: IDS.round,
    market_code: 'PNU',
    service_date: '2026-09-06',
    status: 'open',
    signup_close_at: '2026-09-06T09:30:00+00:00',
    capacity_lock_at: '2026-09-06T09:30:00+00:00',
    allocation_publish_at: '2026-09-06T09:32:00+00:00',
    deposit_due_at: '2026-09-06T09:45:00+00:00',
    partner_acceptance_due_at: '2026-09-06T09:50:00+00:00',
    reveal_at: '2026-09-06T09:55:00+00:00',
    arrival_at: '2026-09-06T10:20:00+00:00',
    starts_at: '2026-09-06T10:30:00+00:00',
  }

  assert.doesNotThrow(() => validatePartnerSetupRound(round, inputs))
  assert.throws(
    () => validatePartnerSetupRound({ ...round, deposit_due_at: '' }, inputs),
    /local_verify_partner_setup_schedule_invalid/,
  )
  assert.throws(
    () => validatePartnerSetupRound({ ...round, market_code: 'OTHER' }, inputs),
    /local_verify_partner_setup_schedule_invalid/,
  )
})

test('only the browser-session config probe uses cookies', () => {
  const plan = buildProbePlan({
    roundId: IDS.round,
    venueId: IDS.venue,
    foreignVenueId: IDS.foreignVenue,
  })
  const authenticated = plan.filter((probe) => probe.actor !== 'anonymous')

  assert.ok(authenticated
    .filter((probe) => probe.name === 'admin-config')
    .every((probe) => probe.authMode === 'cookie'))
  assert.ok(authenticated
    .filter((probe) => probe.name !== 'admin-config')
    .every((probe) => probe.authMode === 'bearer'))
})
