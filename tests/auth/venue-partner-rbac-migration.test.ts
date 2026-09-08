import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')
const predecessor = '20260816092918'

function readMigration(): { filename: string; sql: string } {
  const filenames = readdirSync(migrationsDir).filter((entry) =>
    /^\d{14}_venue_partner_rbac\.sql$/.test(entry),
  )

  assert.equal(filenames.length, 1, 'expected one venue partner RBAC migration')
  const [filename] = filenames
  assert.ok(filename.slice(0, 14) > predecessor, 'migration must follow 20260816092918')

  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readObligationGuardMigration(): { filename: string; sql: string } {
  const filename = '20260903000002_partner_revoke_obligation_guard.sql'
  assert.ok(
    filename.slice(0, 14) > '20260902201247',
    'obligation guard must follow the Tonight ledger and lifecycle migrations',
  )
  return { filename, sql: readFileSync(join(migrationsDir, filename), 'utf8') }
}

function readFunction(
  sql: string,
  functionName: string,
  schema: 'public' | 'quantum_private' = 'public',
): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${functionName}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing function ${schema}.${functionName}`)

  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${functionName}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${functionName}`)
  return sql.slice(start, end + 3)
}

test('venue partner membership is historical, active-unique, RLS protected, and server-write-only', () => {
  const { sql } = readMigration()

  assert.match(
    sql,
    /CREATE TABLE public\.venue_partner_memberships\s*\([\s\S]*?user_id UUID NOT NULL REFERENCES public\.users\(id\) ON DELETE RESTRICT[\s\S]*?venue_id UUID NOT NULL REFERENCES public\.venues\(id\) ON DELETE RESTRICT/i,
  )
  assert.match(sql, /role TEXT NOT NULL CHECK \(role IN \('owner', 'staff'\)\)/i)
  assert.match(sql, /revoked_at TIMESTAMPTZ/i)
  assert.match(sql, /revoked_by UUID REFERENCES public\.users\(id\) ON DELETE RESTRICT/i)
  assert.match(sql, /revision INTEGER NOT NULL DEFAULT 1 CHECK \(revision > 0\)/i)
  assert.match(
    sql,
    /CREATE UNIQUE INDEX venue_partner_memberships_one_active_per_user_venue[\s\S]*?ON public\.venue_partner_memberships \(user_id, venue_id\)[\s\S]*?WHERE revoked_at IS NULL/i,
  )
  assert.match(
    sql,
    /CREATE INDEX venue_partner_memberships_active_venue_lookup[\s\S]*?ON public\.venue_partner_memberships \(venue_id, user_id\)[\s\S]*?WHERE revoked_at IS NULL/i,
  )
  assert.match(sql, /ALTER TABLE public\.venue_partner_memberships ENABLE ROW LEVEL SECURITY/i)
  assert.match(
    sql,
    /REVOKE ALL ON TABLE public\.venue_partner_memberships\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(
    sql,
    /GRANT SELECT ON TABLE public\.venue_partner_memberships\s+TO service_role/i,
  )
  assert.doesNotMatch(
    sql,
    /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE|[A-Z, ]*(?:INSERT|UPDATE|DELETE)[A-Z, ]*)\s+ON TABLE public\.venue_partner_memberships/i,
  )
})

test('membership history only allows a one-way revisioned revoke transition', () => {
  const { sql } = readMigration()
  const fn = readFunction(
    sql,
    'guard_venue_partner_membership_transition',
    'quantum_private',
  )

  assert.match(fn, /RETURNS TRIGGER/i)
  assert.match(fn, /TG_OP = 'DELETE'/i)
  assert.match(fn, /venue_partner_membership_delete_forbidden/i)
  assert.match(
    fn,
    /NEW\.user_id IS DISTINCT FROM OLD\.user_id[\s\S]*?NEW\.venue_id IS DISTINCT FROM OLD\.venue_id[\s\S]*?NEW\.role IS DISTINCT FROM OLD\.role[\s\S]*?NEW\.granted_by IS DISTINCT FROM OLD\.granted_by[\s\S]*?NEW\.granted_at IS DISTINCT FROM OLD\.granted_at/i,
  )
  assert.match(fn, /NEW\.revision <> OLD\.revision \+ 1/i)
  assert.match(fn, /OLD\.revoked_at IS NOT NULL/i)
  assert.match(
    sql,
    /CREATE TRIGGER venue_partner_memberships_guard_update[\s\S]*?BEFORE UPDATE ON public\.venue_partner_memberships[\s\S]*?EXECUTE FUNCTION quantum_private\.guard_venue_partner_membership_transition\(\)[\s\S]*?CREATE TRIGGER venue_partner_memberships_guard_delete[\s\S]*?BEFORE DELETE ON public\.venue_partner_memberships[\s\S]*?EXECUTE FUNCTION quantum_private\.guard_venue_partner_membership_transition\(\)/i,
  )
})

test('partner role changes use an immutable private event ledger with exact idempotency', () => {
  const { sql } = readMigration()
  const guardFn = readFunction(
    sql,
    'prevent_venue_partner_membership_event_mutation',
    'quantum_private',
  )
  const writerFn = readFunction(
    sql,
    'write_venue_partner_membership_event',
    'quantum_private',
  )

  assert.match(
    sql,
    /CREATE TABLE quantum_private\.venue_partner_membership_events\s*\([\s\S]*?membership_id UUID NOT NULL\s+REFERENCES public\.venue_partner_memberships\(id\) ON DELETE RESTRICT[\s\S]*?event_type TEXT NOT NULL CHECK \(event_type IN \('grant', 'revoke'\)\)[\s\S]*?actor_id UUID NOT NULL REFERENCES public\.users\(id\) ON DELETE RESTRICT[\s\S]*?occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP[\s\S]*?request_payload JSONB NOT NULL[\s\S]*?before_state JSONB NOT NULL[\s\S]*?after_state JSONB NOT NULL[\s\S]*?membership_revision INTEGER NOT NULL CHECK \(membership_revision > 0\)[\s\S]*?idempotency_key TEXT NOT NULL/i,
  )
  assert.match(
    sql,
    /CREATE UNIQUE INDEX venue_partner_membership_events_actor_idempotency[\s\S]*?ON quantum_private\.venue_partner_membership_events \(actor_id, idempotency_key\)/i,
  )
  assert.match(
    sql,
    /ALTER TABLE quantum_private\.venue_partner_membership_events ENABLE ROW LEVEL SECURITY/i,
  )
  assert.match(
    sql,
    /REVOKE ALL ON TABLE quantum_private\.venue_partner_membership_events\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
  assert.match(guardFn, /RETURNS TRIGGER/i)
  assert.match(guardFn, /venue_partner_membership_events_are_immutable/i)
  assert.match(
    sql,
    /CREATE TRIGGER venue_partner_membership_events_no_update[\s\S]*?BEFORE UPDATE ON quantum_private\.venue_partner_membership_events[\s\S]*?EXECUTE FUNCTION quantum_private\.prevent_venue_partner_membership_event_mutation\(\)[\s\S]*?CREATE TRIGGER venue_partner_membership_events_no_delete[\s\S]*?BEFORE DELETE ON quantum_private\.venue_partner_membership_events[\s\S]*?EXECUTE FUNCTION quantum_private\.prevent_venue_partner_membership_event_mutation\(\)/i,
  )

  assert.match(writerFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(writerFn, /ON CONFLICT \(actor_id, idempotency_key\) DO NOTHING/i)
  assert.match(writerFn, /venue_partner_membership_event_idempotency_conflict/i)
  for (const field of [
    "'membership_id', existing.membership_id",
    "'event_type', existing.event_type",
    "'request_payload', existing.request_payload",
    "'before_state', existing.before_state",
    "'after_state', existing.after_state",
    "'membership_revision', existing.membership_revision",
  ]) {
    assert.ok(writerFn.includes(field), `idempotency signature must include ${field}`)
  }
  assert.match(writerFn, /v_existing_signature <> v_expected_signature/i)
})

test('venue partner checks bind the requested user to auth.uid and read live revocation state', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'is_venue_partner')

  assert.match(
    fn,
    /p_venue_id UUID,\s*p_user_id UUID DEFAULT auth\.uid\(\)[\s\S]*?RETURNS BOOLEAN/i,
  )
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(
    fn,
    /p_user_id IS NULL OR p_user_id <> v_caller[\s\S]*?RETURN FALSE/i,
  )
  assert.match(
    fn,
    /FROM public\.venue_partner_memberships AS membership[\s\S]*?membership\.user_id = v_caller[\s\S]*?membership\.venue_id = p_venue_id[\s\S]*?membership\.revoked_at IS NULL/i,
  )
  assert.doesNotMatch(fn, /auth\.jwt|user_metadata|app_metadata/i)
})

test('access context returns only the effective role and current partner venue ids', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'get_access_context')

  assert.match(
    fn,
    /RETURNS TABLE\s*\(\s*access_role TEXT,\s*partner_venue_ids UUID\[\]\s*\)/i,
  )
  assert.match(fn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(fn, /v_caller UUID := auth\.uid\(\)/i)
  assert.match(
    fn,
    /WHEN v_admin_role = 'super_admin' THEN 'super_admin'[\s\S]*?WHEN v_admin_role = 'admin' THEN 'admin'[\s\S]*?WHEN pg_catalog\.cardinality\(v_partner_venue_ids\) > 0 THEN 'partner'[\s\S]*?ELSE 'user'/i,
  )
  assert.match(
    fn,
    /array_agg\(DISTINCT membership\.venue_id ORDER BY membership\.venue_id\)[\s\S]*?membership\.user_id = v_caller[\s\S]*?membership\.revoked_at IS NULL/i,
  )
  assert.doesNotMatch(fn, /phone|display_name|email|score|auth\.jwt|metadata/i)
})

test('partner self-list is scoped to the caller and exposes only the venue allowlist', () => {
  const { sql } = readMigration()
  const fn = readFunction(sql, 'list_my_partner_venues')

  assert.match(
    fn,
    /RETURNS TABLE\s*\(\s*venue_id UUID,\s*venue_name TEXT,\s*venue_category TEXT,\s*venue_address TEXT,\s*area_label TEXT,\s*membership_role TEXT\s*\)/i,
  )
  assert.match(fn, /membership\.user_id = v_caller/i)
  assert.match(fn, /membership\.revoked_at IS NULL/i)
  assert.doesNotMatch(
    fn,
    /phone|opening_hours|available_timeslots|min_group_size|max_group_size|quality_score|admin_priority|notes|checkin_radius|map_url/i,
  )
})

test('membership administration is super-admin-only and derives actor and time in the database', () => {
  const { sql } = readMigration()
  const grantFn = readFunction(sql, 'grant_venue_partner_membership')
  const revokeFn = readFunction(sql, 'revoke_venue_partner_membership')
  const listFn = readFunction(sql, 'list_venue_partner_memberships')

  assert.match(
    grantFn,
    /\(\s*p_user_id UUID,\s*p_venue_id UUID,\s*p_role TEXT,\s*p_expected_revision INTEGER,\s*p_idempotency_key TEXT\s*\)/i,
  )
  assert.match(grantFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(grantFn, /granted_by[\s\S]*?v_caller/i)
  assert.match(grantFn, /granted_at[\s\S]*?CURRENT_TIMESTAMP/i)
  assert.match(grantFn, /pg_catalog\.pg_advisory_xact_lock/i)
  assert.match(grantFn, /FOR UPDATE/i)
  assert.match(grantFn, /active_partner_role_conflict/i)
  assert.match(grantFn, /venue_partner_membership_revision_conflict/i)
  assert.match(grantFn, /membership\.role = p_role[\s\S]*?RETURN membership\.id/i)
  assert.match(grantFn, /quantum_private\.write_venue_partner_membership_event/i)
  assert.doesNotMatch(grantFn, /ON CONFLICT[\s\S]*?DO UPDATE/i)
  assert.doesNotMatch(grantFn, /UPDATE public\.venue_partner_memberships[\s\S]*?SET role/i)
  assert.doesNotMatch(grantFn, /p_(?:actor|granted_by|granted_at|created_by|created_at)/i)

  assert.match(
    revokeFn,
    /\(\s*p_membership_id UUID,\s*p_expected_revision INTEGER,\s*p_idempotency_key TEXT\s*\)/i,
  )
  assert.match(revokeFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(
    revokeFn,
    /SET revoked_at = CURRENT_TIMESTAMP,\s*revoked_by = v_caller,\s*revision = membership\.revision \+ 1/i,
  )
  assert.match(revokeFn, /venue_partner_membership_revision_conflict/i)
  assert.match(revokeFn, /quantum_private\.write_venue_partner_membership_event/i)
  assert.doesNotMatch(revokeFn, /DELETE FROM/i)
  assert.doesNotMatch(revokeFn, /p_(?:actor|revoked_by|revoked_at|updated_by|updated_at)/i)

  assert.match(listFn, /public\.is_super_admin\(v_caller\)/i)
  assert.match(listFn, /FROM public\.venue_partner_memberships/i)
  assert.doesNotMatch(listFn, /auth\.jwt|metadata/i)

  for (const signature of [
    'is_venue_partner\\(UUID, UUID\\)',
    'get_access_context\\(\\)',
    'list_my_partner_venues\\(\\)',
    'grant_venue_partner_membership\\(UUID, UUID, TEXT, INTEGER, TEXT\\)',
    'revoke_venue_partner_membership\\(UUID, INTEGER, TEXT\\)',
    'list_venue_partner_memberships\\(UUID, BOOLEAN\\)',
    'list_venue_partner_membership_events\\(UUID\\)',
  ]) {
    assert.match(
      sql,
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${signature}\\s+FROM\\s+\\/\\* explicit role boundary \\*\\/\\s+PUBLIC, anon, authenticated[\\s\\S]*?GRANT EXECUTE ON FUNCTION public\\.${signature}\\s+TO authenticated`,
        'i',
      ),
    )
  }
})

test('grant and revoke serialize every membership mutation with the same venue lock', () => {
  const { sql } = readMigration()
  const grantFn = readFunction(sql, 'grant_venue_partner_membership')
  const revokeFn = readFunction(sql, 'revoke_venue_partner_membership')

  for (const fn of [grantFn, revokeFn]) {
    assert.match(fn, /pg_catalog\.pg_advisory_xact_lock/i)
    assert.match(fn, /'venue-partner-venue:' \|\| [a-z_.]+::TEXT/i)
  }
  assert.doesNotMatch(grantFn, /'venue-partner:' \|\| p_user_id::TEXT/i)
  assert.doesNotMatch(revokeFn, /'venue-partner-membership:' \|\| p_membership_id::TEXT/i)
})

test('concurrent revoke retries replay the canonical event after the venue lock', () => {
  const { sql } = readMigration()
  const revokeFn = readFunction(sql, 'revoke_venue_partner_membership')

  const venueLock = revokeFn.indexOf("'venue-partner-venue:' || v_membership_venue_id::TEXT")
  const replayAfterLock = revokeFn.lastIndexOf(
    'event.idempotency_key = pg_catalog.btrim(p_idempotency_key)',
  )
  const rowLock = revokeFn.indexOf('FOR UPDATE;', venueLock)
  const alreadyRevoked = revokeFn.indexOf("RAISE EXCEPTION 'venue_partner_membership_already_revoked'")

  assert.ok(venueLock >= 0, 'revoke must retain the venue transaction lock')
  assert.ok(replayAfterLock > venueLock, 'revoke must recheck replay after waiting for the venue lock')
  assert.ok(rowLock > replayAfterLock, 'canonical replay must resolve before revoked-state rejection')
  assert.ok(alreadyRevoked > rowLock)
  assert.match(
    revokeFn.slice(replayAfterLock, rowLock),
    /IF replay_event\.id IS NOT NULL THEN[\s\S]*?replay_event\.event_type <> 'revoke'[\s\S]*?replay_event\.request_payload <> v_request_payload[\s\S]*?venue_partner_membership_event_idempotency_conflict[\s\S]*?RETURN TRUE/i,
  )
})

test('last active partner cannot be revoked while the venue owns live Tonight obligations', () => {
  const { sql } = readMigration()
  const { sql: obligationGuardSql } = readObligationGuardMigration()
  const revokeFn = readFunction(sql, 'revoke_venue_partner_membership')
  const failClosedBootstrapFn = readFunction(
    sql,
    'venue_has_live_tonight_obligations',
    'quantum_private',
  )
  const obligationFn = readFunction(
    obligationGuardSql,
    'venue_has_live_tonight_obligations',
    'quantum_private',
  )

  assert.match(failClosedBootstrapFn, /venue_partner_obligation_state_unavailable/i)
  assert.doesNotMatch(failClosedBootstrapFn, /FROM public\.tonight_/i)
  assert.match(obligationFn, /RETURNS BOOLEAN/i)
  assert.match(obligationFn, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(obligationFn, /FROM public\.tonight_venue_capacities AS capacity/i)
  assert.match(obligationFn, /JOIN public\.tonight_rounds AS round_row/i)
  assert.match(
    obligationFn,
    /round_row\.service_date >= \([\s\S]*?pg_catalog\.timezone\('Asia\/Seoul', CURRENT_TIMESTAMP\)::DATE[\s\S]*?\)/i,
  )
  assert.match(
    obligationFn,
    /round_row\.status NOT IN \('completed', 'cancelled'\)/i,
  )
  assert.match(obligationFn, /FROM public\.tonight_teams AS team/i)
  assert.match(
    obligationFn,
    /FROM public\.tonight_partner_service_confirmations AS confirmation/i,
  )
  assert.match(obligationFn, /LEFT JOIN public\.tonight_settlements AS settlement/i)
  assert.match(
    obligationFn,
    /capacity\.status = 'locked'\s+OR capacity\.reserved_team_count > 0/i,
  )
  assert.match(
    obligationFn,
    /team\.status IN \(\s*'deposit_pending',\s*'partner_pending',\s*'accepted',\s*'revealed',\s*'in_progress'\s*\)/i,
  )
  assert.match(
    obligationFn,
    /settlement\.id IS NULL\s+OR settlement\.status IN \('ready', 'processing', 'disputed'\)/i,
  )

  assert.match(
    revokeFn,
    /FROM public\.venue_partner_memberships AS other_membership[\s\S]*?other_membership\.venue_id = membership\.venue_id[\s\S]*?other_membership\.id <> membership\.id[\s\S]*?other_membership\.revoked_at IS NULL/i,
  )
  assert.match(
    revokeFn,
    /IF NOT v_has_other_active_partner[\s\S]*?quantum_private\.venue_has_live_tonight_obligations\(membership\.venue_id\)[\s\S]*?venue_partner_last_active_has_live_obligations/i,
  )
  assert.match(
    obligationGuardSql,
    /REVOKE ALL ON FUNCTION quantum_private\.venue_has_live_tonight_obligations\(UUID\)\s+FROM\s+\/\* explicit role boundary \*\/\s+PUBLIC, anon, authenticated, service_role/i,
  )
})
