import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

test('internal proposal generation derives private allocator input instead of accepting a client plan', () => {
  const route = source('app/api/internal/match/weekly/proposals/route.ts')
  assert.match(route, /isAuthorizedInternalRequest/)
  assert.match(route, /service_get_weekly_allocator_input/)
  assert.match(route, /buildWeeklyAllocationPlan/)
  assert.match(route, /service_create_weekly_allocation_proposal/)
  assert.doesNotMatch(route, /body\.assignment_plan/)
})

test('scoped operators review first and service role performs the atomic execute', () => {
  const route = source('app/api/admin/match/weekly-allocations/route.ts')
  assert.match(route, /allowedRoles:\s*\['admin',\s*'super_admin'\]/)
  assert.match(route, /operator_review_weekly_allocation/)
  assert.match(route, /operator_request_weekly_allocation_execute/)
  assert.match(route, /service_execute_weekly_allocation_batch/)
  assert.match(route, /createPaymentServiceClient/)
})

test('weekly operator screen exposes revisioned review, reject, and execute actions', () => {
  const page = source('app/admin/match/weekly/page.tsx')
  const component = source('components/matching/WeeklyAllocationOperator.tsx')
  assert.match(page, /WeeklyAllocationOperator/)
  assert.match(component, /검토 시작/)
  assert.match(component, /제안 거절/)
  assert.match(component, /원자 배정 실행/)
  assert.match(component, /expected_revision/)
  assert.match(component, /idempotency_key/)
})

test('super-admin weekly screen manages explicit school-scoped operator grants', () => {
  const route = source('app/api/admin/super-admin/match/weekly-allocation-grants/route.ts')
  const page = source('app/admin/super-admin/match/weekly/page.tsx')
  const component = source('components/matching/WeeklyAllocationGrantOperator.tsx')
  assert.match(route, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(route, /requireRecentAuth:\s*true/)
  assert.match(route, /super_admin_get_weekly_allocation_operator_grant/)
  assert.match(route, /super_admin_set_weekly_allocation_operator_grant/)
  assert.match(page, /WeeklyAllocationGrantOperator/)
  assert.match(component, /pnu_self_selected/)
})
