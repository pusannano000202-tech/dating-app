import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migrationsDir = join(process.cwd(), 'supabase', 'migrations')

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf8')
}

function readFunction(
  sql: string,
  schema: 'public' | 'quantum_private',
  name: string,
): string {
  const start = sql.search(
    new RegExp(`CREATE OR REPLACE FUNCTION ${schema}\\.${name}\\b`, 'i'),
  )
  assert.notEqual(start, -1, `missing ${schema}.${name}`)
  const bodyStart = sql.indexOf('AS $$', start)
  const end = sql.indexOf('$$;', bodyStart)
  assert.notEqual(bodyStart, -1, `missing body for ${schema}.${name}`)
  assert.notEqual(end, -1, `missing end for ${schema}.${name}`)
  return sql.slice(start, end + 3)
}

function assertPartnerVenueLease(
  fn: string,
  firstBusinessRowLock: RegExp,
  missingError: 'venue_not_found' | 'tonight_team_not_found',
): void {
  const venueLock = fn.search(
    /pg_catalog\.pg_advisory_xact_lock\([\s\S]*?'venue-partner-venue:'\s*\|\|\s*v_venue_id::TEXT/i,
  )
  const activeMembership = fn.indexOf(
    'FROM public.venue_partner_memberships AS active_partner',
    venueLock,
  )
  const membershipShare = fn.indexOf('FOR SHARE OF active_partner', activeMembership)
  const businessRowLock = fn.slice(membershipShare).search(firstBusinessRowLock)

  assert.ok(venueLock >= 0, 'partner write must take the venue advisory lock')
  assert.ok(
    activeMembership > venueLock,
    'partner write must re-read active membership after taking the venue lock',
  )
  assert.ok(
    membershipShare > activeMembership,
    'partner write must hold the active membership row with FOR SHARE',
  )
  assert.ok(
    businessRowLock >= 0,
    'partner write must acquire its business-row lock after the membership lease',
  )
  assert.match(
    fn.slice(activeMembership, membershipShare + 'FOR SHARE OF active_partner'.length),
    /active_partner\.venue_id = v_venue_id[\s\S]*?active_partner\.user_id = v_caller[\s\S]*?active_partner\.revoked_at IS NULL/i,
  )
  assert.match(
    fn.slice(membershipShare),
    new RegExp(`IF NOT FOUND THEN[\\s\\S]*?${missingError}`, 'i'),
  )
}

test('last-partner obligation guard covers future available open and locked capacity', () => {
  const sql = readMigration('20260903000002_partner_revoke_obligation_guard.sql')
  const fn = readFunction(
    sql,
    'quantum_private',
    'venue_has_live_tonight_obligations',
  )

  assert.match(
    fn,
    /round_row\.service_date >= \([\s\S]*?timezone\('Asia\/Seoul', CURRENT_TIMESTAMP\)::DATE[\s\S]*?\)/i,
  )
  assert.match(fn, /round_row\.status NOT IN \('completed', 'cancelled'\)/i)
  assert.match(
    fn,
    /capacity\.status IN \('open', 'locked'\)[\s\S]*?capacity\.team_capacity > capacity\.reserved_team_count/i,
  )
})

test('capacity, acceptance, confirmation, and attempt serialize with partner revoke', () => {
  const lifecycle = readMigration('20260902201247_tonight_lifecycle_rpcs.sql')
  const capacityOverride = readMigration(
    '20260903000700_tonight_venue_activity_compatibility.sql',
  )
  const serviceRecovery = readMigration(
    '20260903000900_tonight_service_confirmation_recovery.sql',
  )

  for (const capacity of [
    readFunction(lifecycle, 'public', 'partner_set_tonight_capacity'),
    readFunction(capacityOverride, 'public', 'partner_set_tonight_capacity'),
  ]) {
    assertPartnerVenueLease(
      capacity,
      /SELECT \*[\s\S]*?FROM public\.tonight_venue_capacities AS capacity[\s\S]*?FOR UPDATE;/i,
      'venue_not_found',
    )
    assert.ok(
      capacity.indexOf('FROM public.tonight_rounds AS round_row') <
        capacity.indexOf("'venue-partner-venue:' || v_venue_id::TEXT"),
      'capacity and allocation must share the round-before-venue lock order',
    )
  }

  assertPartnerVenueLease(
    readFunction(lifecycle, 'public', 'partner_accept_tonight_team'),
    /SELECT \*[\s\S]*?FROM public\.tonight_teams AS team[\s\S]*?FOR UPDATE;/i,
    'tonight_team_not_found',
  )
  assertPartnerVenueLease(
    readFunction(lifecycle, 'public', 'partner_confirm_tonight_service'),
    /SELECT \*[\s\S]*?FROM public\.tonight_teams AS team[\s\S]*?FOR UPDATE;/i,
    'tonight_team_not_found',
  )
  assertPartnerVenueLease(
    readFunction(
      serviceRecovery,
      'public',
      'partner_record_tonight_service_confirmation_attempt',
    ),
    /SELECT team\.\*[\s\S]*?FROM public\.tonight_teams AS team[\s\S]*?FOR UPDATE OF team;/i,
    'tonight_team_not_found',
  )
})

test('allocator input fails closed when available capacity has no active partner', () => {
  const lifecycle = readMigration('20260902201247_tonight_lifecycle_rpcs.sql')
  const fn = readFunction(
    lifecycle,
    'public',
    'service_get_tonight_allocator_input',
  )

  assert.match(
    fn,
    /capacity\.round_id = p_round_id[\s\S]*?capacity\.status IN \('open', 'locked'\)[\s\S]*?capacity\.team_capacity > capacity\.reserved_team_count[\s\S]*?NOT EXISTS \([\s\S]*?FROM public\.venue_partner_memberships AS active_partner[\s\S]*?active_partner\.venue_id = capacity\.venue_id[\s\S]*?active_partner\.revoked_at IS NULL[\s\S]*?venue_capacity_without_active_partner/i,
  )
  assert.match(
    fn,
    /'capacities'[\s\S]*?FROM public\.tonight_venue_capacities AS capacity[\s\S]*?capacity\.status IN \('open', 'locked'\)[\s\S]*?EXISTS \([\s\S]*?FROM public\.venue_partner_memberships AS active_partner[\s\S]*?active_partner\.venue_id = capacity\.venue_id[\s\S]*?active_partner\.revoked_at IS NULL/i,
  )
})

test('allocation publish revalidates and holds an active venue partner before capacity mutation', () => {
  const lifecycle = readMigration('20260902201247_tonight_lifecycle_rpcs.sql')
  const fallback = readMigration(
    '20260903000600_tonight_ranked_activity_capacity_fallback.sql',
  )

  for (const publish of [
    readFunction(
      lifecycle,
      'quantum_private',
      'publish_tonight_allocation_internal',
    ),
    readFunction(
      fallback,
      'quantum_private',
      'publish_tonight_allocation_internal',
    ),
  ]) {
    const loop = publish.slice(publish.indexOf('FOR v_team_index IN'))
    const venueRead = loop.indexOf('SELECT capacity.venue_id')
    const venueLock = loop.indexOf("'venue-partner-venue:' || v_venue_id::TEXT")
    const activeMembership = loop.indexOf(
      'FROM public.venue_partner_memberships AS active_partner',
      venueLock,
    )
    const membershipShare = loop.indexOf(
      'FOR SHARE OF active_partner',
      activeMembership,
    )
    const capacityLock = loop.indexOf('INTO v_capacity', membershipShare)

    assert.ok(venueRead >= 0, 'publish must discover the assigned venue')
    assert.ok(venueLock > venueRead, 'publish must lock the assigned venue')
    assert.ok(
      activeMembership > venueLock,
      'publish must recheck active partner membership after venue lock',
    )
    assert.ok(
      membershipShare > activeMembership,
      'publish must hold active partner membership for the transaction',
    )
    assert.ok(
      capacityLock > membershipShare,
      'publish must lock capacity only after acquiring the venue lease',
    )
    assert.match(
      loop.slice(activeMembership, capacityLock),
      /active_partner\.venue_id = v_venue_id[\s\S]*?active_partner\.revoked_at IS NULL[\s\S]*?FOR SHARE OF active_partner[\s\S]*?venue_capacity_without_active_partner/i,
    )
  }
})
