import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const source = (relative: string) => {
  const path = join(process.cwd(), relative)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

test('partner service route commits attempt evidence before confirming and returns mismatch counts', () => {
  const route = source('app/api/partner/tonight/service/route.ts')
  const attempt = route.indexOf("rpc('partner_record_tonight_service_confirmation_attempt'")
  const confirmation = route.indexOf("rpc('partner_confirm_tonight_service'")

  assert.ok(attempt >= 0 && confirmation > attempt)
  assert.match(route, /attempt\.data[\s\S]*?matches_attendance/i)
  assert.match(route, /attendance_reconciliation_required/i)
  assert.match(route, /partnerVenueId:\s*venueId/i)
})

test('service recovery API is recent-auth super-admin only and revisioned', () => {
  const route = source('app/api/admin/super-admin/tonight/service-recovery/route.ts')

  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.match(route, /super_admin_recover_tonight_service_confirmation/)
  assert.match(route, /p_expected_revision/)
  assert.match(route, /p_idempotency_key/)
  assert.doesNotMatch(route, /reason/i)
})

test('admin exception API includes service recovery evidence but exposes no admin mutation', () => {
  const route = source('app/api/admin/tonight/exceptions/route.ts')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(route, /admin_get_tonight_exception_page/)
  assert.doesNotMatch(route, /admin_get_tonight_active_exceptions|admin_get_tonight_service_exceptions/)
  assert.match(admin, /서비스 확인 누락/)
  assert.match(admin, /조회만/)
  assert.doesNotMatch(admin, /recoverServiceConfirmation|서비스 확인 복구/)
  assert.match(superAdmin, /서비스 확인 복구/)
  assert.match(superAdmin, /adapter\.recoverServiceConfirmation/)
})

test('summary API and both consoles use a bounded fifty-team cursor page', () => {
  const route = source('app/api/admin/tonight/summary/route.ts')
  const types = source('components/tonight/types.ts')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const superAdmin = source('components/tonight/SuperAdminTonightConsole.tsx')

  assert.match(route, /admin_get_tonight_round_summary_page/)
  assert.match(route, /p_limit:\s*50/)
  assert.match(route, /next_after_team_number/)
  assert.match(types, /nextAfterTeamNumber/)
  assert.match(admin, /다음 50팀/)
  assert.match(superAdmin, /다음 50팀/)
})

test('live super-admin fetches sensitive diagnostics only for one explicitly selected team', () => {
  const adapter = source('components/tonight/live-adapters.ts')

  assert.doesNotMatch(adapter, /Promise\.all\(baseAdmin\.teams\.map[\s\S]*?super-admin\/tonight\/diagnostics/)
  assert.match(adapter, /input\?\.teamId[\s\S]*?super-admin\/tonight\/diagnostics\?team_id=/)
  assert.match(adapter, /activeTeamId:\s*currentTeamId \|\| null/)
  assert.match(adapter, /members:\s*activePayload\?\.rows \?\? \[\]/)
})

test('call outcome enum is identical from UI through API and cancelled is history only', () => {
  const types = source('components/tonight/types.ts')
  const admin = source('components/tonight/AdminTonightConsole.tsx')
  const route = source('app/api/admin/tonight/calls/route.ts')

  const canonical = "'answered' | 'no_answer' | 'wrong_number' | 'arriving' | 'cancelled'"
  assert.match(types, new RegExp(canonical.replaceAll('|', '\\|')))
  for (const value of ['answered', 'no_answer', 'wrong_number', 'arriving', 'cancelled']) {
    assert.match(admin, new RegExp(`'${value}'`))
    assert.match(route, new RegExp(`'${value}'`))
  }
  assert.match(admin, /연락 이력만 기록/)
})
