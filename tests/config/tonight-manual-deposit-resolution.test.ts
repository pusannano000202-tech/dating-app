import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { mergeSuperAdminManualDepositExceptions } from '../../components/tonight/manual-deposit-exceptions'
import { isTonightNoShowForfeitPolicyApproved } from '../../lib/server/tonight/deposit-resolution-policy'

const read = (relativePath: string) => fs.existsSync(path.join(process.cwd(), relativePath))
  ? fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  : ''

test('no-show forfeiture policy is exact and fail-closed', () => {
  assert.equal(isTonightNoShowForfeitPolicyApproved({}), false)
  assert.equal(isTonightNoShowForfeitPolicyApproved({ TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED: 'false' }), false)
  assert.equal(isTonightNoShowForfeitPolicyApproved({ TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED: 'TRUE' }), false)
  assert.equal(isTonightNoShowForfeitPolicyApproved({ TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED: 'true' }), true)
})

test('manual deposit API is recent-authenticated, strict, revisioned, and caller bound', () => {
  const route = read('app/api/admin/super-admin/tonight/deposits/manual-review/route.ts')
  assert.match(route, /allowedRoles: \['super_admin'\]/)
  assert.match(route, /requireRecentAuth: true/)
  assert.match(route, /createSupabaseRequestClient\(request\)/)
  assert.doesNotMatch(route, /createPaymentServiceClient\(\)/)
  assert.match(route, /\[\s*'depositId', 'decision', 'expectedRevision', 'idempotencyKey',?\s*\]/)
  assert.doesNotMatch(route, /reason/i)
  assert.match(route, /\^\(\?:refund\|forfeit\)\$/)
  assert.match(route, /isTonightNoShowForfeitPolicyApproved/)
  assert.match(route, /super_admin_resolve_tonight_manual_deposit/)
  assert.doesNotMatch(route, /p_actor_user_id|p_forfeit_policy_approved/)
  assert.match(route, /p_expected_revision:/)
  assert.match(route, /p_idempotency_key:/)
  assert.match(route, /privateJson/)
})

test('manual deposit mutation route cannot bulk-read identities and the legacy RPC is retired', () => {
  const route = read('app/api/admin/super-admin/tonight/deposits/manual-review/route.ts')
  const retirement = read(
    'supabase/migrations/20260903033000_tonight_retire_manual_deposit_bulk_read.sql',
  )

  assert.doesNotMatch(route, /export async function GET/)
  assert.doesNotMatch(route, /super_admin_list_tonight_manual_deposits/)
  assert.match(
    retirement,
    /REVOKE ALL ON FUNCTION public\.super_admin_list_tonight_manual_deposits\(UUID\)/i,
  )
  assert.match(
    retirement,
    /DROP FUNCTION IF EXISTS public\.super_admin_list_tonight_manual_deposits\(UUID\)/i,
  )
})

test('card checkout and deployment readiness both require an approved no-show policy', () => {
  const start = read('app/api/payments/tonight-deposit/route.ts')
  const checker = read('scripts/check-deploy-readiness.mjs')
  for (const envPath of ['.env.example', '.env.local.example']) {
    assert.match(read(envPath), /^TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED=false$/m)
  }
  assert.match(start, /isTonightNoShowForfeitPolicyApproved/)
  assert.match(checker, /TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED/)
  assert.match(checker, /TONIGHT_CARD_PAYMENTS_ENABLED/)
  assert.match(checker, /case 'TONIGHT_NO_SHOW_FORFEIT_POLICY_APPROVED'/)
})

test('super-admin console resolves manual deposits while the ordinary admin remains read-only', () => {
  const types = read('components/tonight/types.ts')
  const adapter = read('components/tonight/live-adapters.ts')
  const superAdmin = read('components/tonight/SuperAdminTonightConsole.tsx')
  const ordinaryAdmin = read('components/tonight/AdminTonightConsole.tsx')

  assert.match(types, /manualDepositId/)
  assert.match(types, /manualDepositRevision/)
  assert.match(types, /resolveManualDeposit/)
  assert.match(adapter, /\/api\/admin\/super-admin\/tonight\/deposits\/manual-review/)
  assert.match(adapter, /decision: input\.decision/)
  assert.match(adapter, /expectedRevision: input\.expectedRevision/)
  assert.match(superAdmin, /보증금 전액 환불/)
  assert.match(superAdmin, /보증금 몰수 확정/)
  assert.match(superAdmin, /최고관리자 종결/)
  assert.doesNotMatch(ordinaryAdmin, /resolveManualDeposit|보증금 몰수 확정|보증금 전액 환불/)
})

test('manual deposit exception mapping preserves only authoritative revisioned actions', () => {
  const mapped = mergeSuperAdminManualDepositExceptions([], [{
    deposit_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    deposit_revision: 4,
    team_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    team_code: 'PNU-BAR-04',
    subject_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    subject_display_name: '테스트 참가자',
    subject_phone: '010-0000-0000',
    attendance_status: 'no_show',
    attendance_revision: 2,
  }], false)
  assert.equal(mapped.length, 1)
  assert.equal(mapped[0]?.manualDepositId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  assert.equal(mapped[0]?.manualDepositRevision, 4)
  assert.equal(mapped[0]?.manualForfeitPolicyApproved, false)
  assert.throws(
    () => mergeSuperAdminManualDepositExceptions([], [{
      deposit_id: 'missing-revision',
      team_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      attendance_status: 'no_show',
    }], true),
    /수동 보증금 응답/,
  )
  assert.throws(
    () => mergeSuperAdminManualDepositExceptions([], null, true),
    /수동 보증금 응답/,
  )
})
