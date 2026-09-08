import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  TonightApiInputError,
  asIdempotencyKey,
  asInteger,
  asIsoTimestamp,
  asOptionalString,
  asUuid,
  mapTonightRpcError,
  privateJson,
  validateStrictRecord,
} from '../../lib/server/tonight/api-contract'
import {
  buildTonightDepositIdempotencyKey,
  buildTonightDepositOrderId,
  hashTonightPaymentKey,
} from '../../lib/payments/tonight-deposit-server'
import {
  chooseTonightDepositProviderAction,
  readTonightDepositCancellationContext,
  readTonightDepositCheckoutContext,
  readTonightDepositConfirmationContext,
} from '../../lib/server/tonight/payment-context'
import { getKstServiceDate } from '../../lib/server/tonight/automation-runtime'
import { buildTonightPaymentReturnUrl } from '../../lib/server/tonight/payment-redirect'
import { readTonightSettlementConfig } from '../../lib/server/tonight/settlement-runtime'

const UUID_A = '11111111-1111-4111-8111-111111111111'

test('Tonight deposit checkout context is caller-scoped, allocated, unpaid, and before deadline', () => {
  const context = readTonightDepositCheckoutContext({
    round: {
      id: UUID_A,
      deposit_due_at: '2026-09-03T18:45:00+09:00',
    },
    application: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'allocated',
      deposit: null,
    },
  }, '22222222-2222-4222-8222-222222222222', new Date('2026-09-03T18:40:00+09:00'))
  assert.equal(context.roundId, UUID_A)

  const pendingContext = readTonightDepositCheckoutContext({
    round: {
      id: UUID_A,
      deposit_due_at: '2026-09-03T18:45:00+09:00',
    },
    application: {
      id: '22222222-2222-4222-8222-222222222222',
      status: 'allocated',
      deposit: { status: 'pending' },
    },
  }, '22222222-2222-4222-8222-222222222222', new Date('2026-09-03T18:40:00+09:00'))
  assert.equal(pendingContext.applicationId, '22222222-2222-4222-8222-222222222222')

  assert.throws(
    () => readTonightDepositCheckoutContext({
      round: { id: UUID_A, deposit_due_at: '2026-09-03T18:45:00+09:00' },
      application: { id: '33333333-3333-4333-8333-333333333333', status: 'allocated', deposit: null },
    }, '22222222-2222-4222-8222-222222222222', new Date('2026-09-03T18:40:00+09:00')),
    /tonight_application_not_found/,
  )
  assert.throws(
    () => readTonightDepositCheckoutContext({
      round: { id: UUID_A, deposit_due_at: '2026-09-03T18:45:00+09:00' },
      application: { id: '22222222-2222-4222-8222-222222222222', status: 'allocated', deposit: { status: 'paid' } },
    }, '22222222-2222-4222-8222-222222222222', new Date('2026-09-03T18:40:00+09:00')),
    /deposit_not_payable/,
  )
  assert.throws(
    () => readTonightDepositCheckoutContext({
      round: { id: UUID_A, deposit_due_at: '2026-09-03T18:45:00+09:00' },
      application: { id: '22222222-2222-4222-8222-222222222222', status: 'allocated', deposit: null },
    }, '22222222-2222-4222-8222-222222222222', new Date('2026-09-03T18:45:00+09:00')),
    /deposit_time_gate_closed/,
  )
})

test('Tonight automation derives its service date in KST rather than server UTC', () => {
  assert.equal(getKstServiceDate(new Date('2026-09-02T15:05:00.000Z')), '2026-09-03')
  assert.equal(getKstServiceDate(new Date('2026-09-03T14:59:59.999Z')), '2026-09-03')
  assert.throws(() => getKstServiceDate(new Date('invalid')), /invalid_clock/)
})

test('Tonight payment return URL is pinned to configured origin and ignores a hostile request Host', () => {
  assert.equal(buildTonightPaymentReturnUrl({
    configuredOrigin: 'https://quantum.example',
    requestUrl: 'https://evil.example/api/payments/tonight-deposit/confirm?return_path=%2Ftonight',
    status: 'paid',
  }), 'https://quantum.example/tonight?payment=paid')
  assert.throws(() => buildTonightPaymentReturnUrl({
    configuredOrigin: '',
    requestUrl: 'https://evil.example/api/payments/tonight-deposit/confirm?return_path=%2Ftonight',
    status: 'failed',
  }), /app_origin_required/)
})

test('strict Tonight request bodies reject poison and unknown fields', () => {
  assert.deepEqual(validateStrictRecord({ round_id: UUID_A }, ['round_id']), { round_id: UUID_A })
  assert.throws(
    () => validateStrictRecord({ round_id: UUID_A, user_id: UUID_A }, ['round_id']),
    (error: unknown) => error instanceof TonightApiInputError && error.code === 'unexpected_field',
  )
  assert.throws(
    () => validateStrictRecord(JSON.parse('{"__proto__":{"role":"super_admin"}}'), []),
    (error: unknown) => error instanceof TonightApiInputError && error.code === 'unexpected_field',
  )
  assert.throws(
    () => validateStrictRecord([], []),
    (error: unknown) => error instanceof TonightApiInputError && error.code === 'invalid_body',
  )
})

test('Tonight scalar validators are exact and bounded', () => {
  assert.equal(asUuid(UUID_A, 'round_id'), UUID_A)
  assert.equal(asInteger(5, 'count', { min: 0, max: 5 }), 5)
  assert.equal(asOptionalString(undefined, 'note', { maxLength: 20 }), null)
  assert.equal(asIdempotencyKey('apply_12345678'), 'apply_12345678')

  assert.throws(() => asUuid('not-a-uuid', 'round_id'), TonightApiInputError)
  assert.throws(() => asInteger(5.1, 'count', { min: 0, max: 5 }), TonightApiInputError)
  assert.throws(() => asInteger(6, 'count', { min: 0, max: 5 }), TonightApiInputError)
  assert.throws(() => asIdempotencyKey('short'), TonightApiInputError)
  assert.throws(() => asIdempotencyKey('white space is rejected'), TonightApiInputError)
  assert.equal(
    asIsoTimestamp('2026-09-03T19:30:00+09:00', 'service_completed_at'),
    '2026-09-03T10:30:00.000Z',
  )
  assert.throws(
    () => asIsoTimestamp('2026-09-03T19:30:00', 'service_completed_at'),
    TonightApiInputError,
  )
})

test('Tonight settlement fee is server-owned, bounded, and fail-closed', () => {
  assert.deepEqual(readTonightSettlementConfig({
    TONIGHT_PARTNER_FEE_PER_ATTENDEE: '1000',
  }), { feePerAttendee: 1000 })
  assert.equal(readTonightSettlementConfig({}), null)
  assert.equal(readTonightSettlementConfig({
    TONIGHT_PARTNER_FEE_PER_ATTENDEE: '1000.5',
  }), null)
  assert.equal(readTonightSettlementConfig({
    TONIGHT_PARTNER_FEE_PER_ATTENDEE: '-1',
  }), null)
  assert.equal(readTonightSettlementConfig({
    TONIGHT_PARTNER_FEE_PER_ATTENDEE: '100001',
  }), null)
})

test('RPC failures map to stable public status without leaking database text', () => {
  assert.deepEqual(mapTonightRpcError({ message: 'stale_revision expected=1;actual=2' }), {
    status: 409,
    code: 'stale_revision',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'tonight_applications_closed' }), {
    status: 409,
    code: 'applications_closed',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'venue_snapshot_not_found' }), {
    status: 404,
    code: 'not_found',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'super_admin_required secret table' }), {
    status: 403,
    code: 'forbidden',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'reauthentication_required' }), {
    status: 403,
    code: 'reauthentication_required',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'database host name and raw SQL' }), {
    status: 503,
    code: 'service_unavailable',
  })

  assert.deepEqual(mapTonightRpcError({ message: 'deposit_not_preparable' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'team_not_ready_for_partner_acceptance' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'refund_request_not_retryable' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'refund_not_eligible' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'refund_not_dead_lettered' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'matching_consent_required' }), {
    status: 400,
    code: 'invalid_request',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'venue_capacity_unavailable' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'venue_partner_last_active_has_live_obligations' }), {
    status: 409,
    code: 'conflict',
  })
  assert.deepEqual(mapTonightRpcError({ message: 'venue_partner_obligation_state_unavailable' }), {
    status: 503,
    code: 'service_unavailable',
  })
})

test('all Tonight JSON responses are private and non-cacheable', async () => {
  const response = privateJson({ ok: true }, 201)
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.deepEqual(await response.json(), { ok: true })
})

test('user current route closes applications when it serves a recent terminal journey fallback', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'app/api/tonight/route.ts'), 'utf8')
  assert.match(source, /isTonightRoundApplicationsOpen/)
  assert.match(source, /rpc\('get_tonight_application_gate'\)/)
  assert.match(source, /applications_open:\s*feature\.applicationsOpen\s*&&\s*databaseApplicationsOpen\s*&&\s*isTonightRoundApplicationsOpen\(data\)/)
  assert.match(source, /status === 'completed' \|\| status === 'cancelled'/)
  assert.match(source, /financial_recovery === true/)
})

test('live application closure message explains the race and the safe next action', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'components/tonight/live-adapters.ts'), 'utf8')
  assert.match(source, /applications_closed:\s*'[^']*방금[^']*새로고침[^']*'/)
})

test('Tonight Toss order and persistence identifiers bind application, user, and attempt', () => {
  const userId = '22222222-2222-4222-8222-222222222222'
  const attempt = 'checkout_abcdefgh'
  const orderId = buildTonightDepositOrderId({ applicationId: UUID_A, userId, idempotencyKey: attempt })

  assert.match(orderId, /^tn_[A-Za-z0-9_-]+$/)
  assert.ok(orderId.length <= 64)
  assert.equal(
    buildTonightDepositOrderId({ applicationId: UUID_A, userId, idempotencyKey: attempt }),
    orderId,
  )
  assert.notEqual(
    buildTonightDepositOrderId({ applicationId: UUID_A, userId, idempotencyKey: 'checkout_ijklmnop' }),
    orderId,
  )
  assert.match(hashTonightPaymentKey('provider_payment_key_secret'), /^[a-f0-9]{64}$/)
  assert.equal(
    buildTonightDepositIdempotencyKey('paid', orderId),
    `tonight-paid-${orderId}`,
  )
})

test('Tonight pending order confirms once and a matching paid replay is idempotent', () => {
  const applicationId = UUID_A
  const userId = '22222222-2222-4222-8222-222222222222'
  const orderId = buildTonightDepositOrderId({
    applicationId,
    userId,
    idempotencyKey: 'checkout_abcdefgh',
  })
  const paymentKeyHash = hashTonightPaymentKey('provider_payment_key_secret')
  const common = {
    id: '33333333-3333-4333-8333-333333333333',
    application_id: applicationId,
    user_id: userId,
    amount: 10_000,
    provider_order_id: orderId,
    revision: 1,
  }

  assert.deepEqual(readTonightDepositConfirmationContext(
    { ...common, status: 'pending', provider_payment_key_hash: null },
    { applicationId, userId, orderId, paymentKeyHash },
  ), {
    mode: 'confirm',
    depositId: common.id,
    revision: 1,
  })
  assert.deepEqual(readTonightDepositConfirmationContext(
    { ...common, status: 'paid', provider_payment_key_hash: paymentKeyHash, revision: 2 },
    { applicationId, userId, orderId, paymentKeyHash },
  ), {
    mode: 'already_paid',
    depositId: common.id,
    revision: 2,
  })
  assert.deepEqual(readTonightDepositConfirmationContext(
    { ...common, status: 'reconciliation_required', provider_payment_key_hash: paymentKeyHash, revision: 3 },
    { applicationId, userId, orderId, paymentKeyHash },
  ), {
    mode: 'reconcile',
    depositId: common.id,
    revision: 3,
  })
  assert.deepEqual(readTonightDepositConfirmationContext(
    { ...common, status: 'cancelled', provider_payment_key_hash: null, revision: 4 },
    { applicationId, userId, orderId, paymentKeyHash },
  ), {
    mode: 'recover_cancelled',
    depositId: common.id,
    revision: 4,
  })
  assert.throws(() => readTonightDepositConfirmationContext(
    { ...common, status: 'pending', provider_order_id: `${orderId}_other` },
    { applicationId, userId, orderId, paymentKeyHash },
  ), /deposit_not_payable/)
})

test('Tonight cancellation binds the caller, application, stable order, and unpaid ledger', () => {
  const applicationId = UUID_A
  const userId = '22222222-2222-4222-8222-222222222222'
  const orderId = buildTonightDepositOrderId({
    applicationId,
    userId,
    idempotencyKey: 'checkout_abcdefgh',
  })
  const row = {
    id: '33333333-3333-4333-8333-333333333333',
    application_id: applicationId,
    user_id: userId,
    amount: 10_000,
    provider_order_id: orderId,
    provider_payment_key_hash: null,
    status: 'pending',
    revision: 1,
  }
  assert.deepEqual(readTonightDepositCancellationContext(row, {
    applicationId,
    userId,
    orderId,
  }), {
    depositId: row.id,
    revision: 1,
    alreadyCancelled: false,
  })
  assert.throws(() => readTonightDepositCancellationContext({ ...row, user_id: UUID_A }, {
    applicationId,
    userId,
    orderId,
  }), /deposit_not_payable/)
  assert.throws(() => readTonightDepositCancellationContext({ ...row, status: 'paid' }, {
    applicationId,
    userId,
    orderId,
  }), /deposit_not_payable/)
})

test('Tonight confirmation recovers an owned provider order after the checkout gate closes', () => {
  assert.equal(chooseTonightDepositProviderAction({
    confirmationMode: 'confirm',
    checkoutOpen: true,
  }), 'confirm')
  assert.equal(chooseTonightDepositProviderAction({
    confirmationMode: 'confirm',
    checkoutOpen: false,
  }), 'lookup')
  assert.equal(chooseTonightDepositProviderAction({
    confirmationMode: 'reconcile',
    checkoutOpen: false,
  }), 'lookup')
  assert.equal(chooseTonightDepositProviderAction({
    confirmationMode: 'recover_cancelled',
    checkoutOpen: false,
  }), 'lookup')
  assert.equal(chooseTonightDepositProviderAction({
    confirmationMode: 'already_paid',
    checkoutOpen: false,
  }), 'already_paid')
})

const routeContracts: Array<[string, string, string]> = [
  ['app/api/tonight/route.ts', 'get_my_current_tonight_round', "['user']"],
  ['app/api/tonight/journey/route.ts', 'get_my_tonight_journey', "['user']"],
  ['app/api/tonight/apply/route.ts', 'submit_tonight_solo_application', "['user']"],
  ['app/api/tonight/arrival/route.ts', 'mark_my_tonight_arrival', "['user']"],
  ['app/api/tonight/report/route.ts', 'submit_tonight_incident_report', "['user']"],
  ['app/api/tonight/refund/route.ts', 'request_my_tonight_refund', "['user']"],
  ['app/api/partner/tonight/setup/route.ts', 'partner_get_tonight_setup', "['partner']"],
  ['app/api/partner/tonight/dashboard/route.ts', 'partner_get_tonight_dashboard', "['partner']"],
  ['app/api/partner/tonight/capacity/route.ts', 'partner_set_tonight_capacity', "['partner']"],
  ['app/api/partner/tonight/accept/route.ts', 'partner_accept_tonight_team', "['partner']"],
  ['app/api/partner/tonight/service/route.ts', 'partner_confirm_tonight_service', "['partner']"],
  ['app/api/admin/tonight/rounds/route.ts', 'admin_list_tonight_rounds', "['admin', 'super_admin']"],
  ['app/api/admin/tonight/summary/route.ts', 'admin_get_tonight_round_summary', "['admin', 'super_admin']"],
  ['app/api/admin/tonight/exceptions/route.ts', 'admin_get_tonight_exception_page', "['admin', 'super_admin']"],
  ['app/api/admin/tonight/calls/route.ts', 'admin_record_tonight_call_attempt', "['admin', 'super_admin']"],
  ['app/api/admin/super-admin/tonight/diagnostics/route.ts', 'super_admin_get_tonight_team_diagnostics', "['super_admin']"],
  ['app/api/admin/super-admin/tonight/profile/route.ts', 'admin_get_user_profile', "['super_admin']"],
  ['app/api/admin/super-admin/tonight/appearance/route.ts', 'super_admin_adjust_tonight_appearance_score', "['super_admin']"],
  ['app/api/admin/super-admin/tonight/swap/route.ts', 'super_admin_swap_tonight_friend_bundles', "['super_admin']"],
  ['app/api/admin/super-admin/tonight/attendance/route.ts', 'super_admin_set_tonight_attendance', "['super_admin']"],
  ['app/api/admin/super-admin/tonight/audit/route.ts', 'super_admin_list_tonight_audit_events', "['super_admin']"],
]

test('user, partner, admin, and super-admin Tonight routes enforce live request access', () => {
  for (const [relativePath, rpcName, roles] of routeContracts) {
    const absolutePath = path.join(process.cwd(), relativePath)
    assert.ok(fs.existsSync(absolutePath), `${relativePath} must exist`)
    const source = fs.readFileSync(absolutePath, 'utf8')
    assert.match(source, /requireRequestAccess\(/, `${relativePath} needs the live guard`)
    assert.match(source, /createSupabaseRequestClient\(/, `${relativePath} needs request auth context`)
    assert.ok(source.includes(`allowedRoles: ${roles}`), `${relativePath} needs ${roles}`)
    assert.ok(source.includes(rpcName), `${relativePath} needs ${rpcName}`)
    assert.match(source, /privateJson|requestGuardErrorResponse/, `${relativePath} must disable caching`)
  }
})

test('partner mutation routes bind a concrete owned venue and do not trust body identity', () => {
  for (const relativePath of [
    'app/api/partner/tonight/capacity/route.ts',
    'app/api/partner/tonight/accept/route.ts',
    'app/api/partner/tonight/service/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.match(source, /partnerVenueId:\s*venueId/)
    assert.doesNotMatch(source, /p_user_id\s*:/)
  }
})

test('Tonight payment callbacks never persist or return the raw provider payment key', () => {
  const start = fs.readFileSync(
    path.join(process.cwd(), 'app/api/payments/tonight-deposit/route.ts'),
    'utf8',
  )
  const confirm = fs.readFileSync(
    path.join(process.cwd(), 'app/api/payments/tonight-deposit/confirm/route.ts'),
    'utf8',
  )
  const cancel = fs.readFileSync(
    path.join(process.cwd(), 'app/api/payments/tonight-deposit/cancel/route.ts'),
    'utf8',
  )
  for (const [relativePath, source] of [
    ['start', start],
    ['confirm', confirm],
    ['cancel', cancel],
  ]) {
    assert.match(source, /requireRequestAccess\(/, `${relativePath} needs live user access`)
    assert.match(source, /createSupabaseRequestClient\(/, `${relativePath} needs request auth context`)
    assert.match(source, /allowedRoles:\s*\['user'\]/, `${relativePath} must be user-only`)
    assert.match(source, /privateJson|privateRedirect|requestGuardErrorResponse/, `${relativePath} must disable caching`)
  }
  assert.match(start, /TONIGHT_CARD_PAYMENTS_ENABLED|cardPaymentsEnabled/)
  assert.match(start, /getDepositPaymentReadiness\('toss'\)/)
  assert.match(start, /service_prepare_tonight_deposit/)
  assert.match(start, /preparedOrderId/)
  assert.doesNotMatch(start, /provider\s*===\s*['"]mock['"]|payMockDeposit/)
  assert.match(confirm, /hashTonightPaymentKey\(paymentKey\)/)
  assert.match(confirm, /readTonightDepositConfirmationContext/)
  assert.match(confirm, /p_provider_payment_key_hash:/)
  assert.match(confirm, /isTonightDepositOrderIdForContext\(/)
  assert.match(confirm, /service_record_tonight_deposit_result/)
  assert.match(confirm, /paymentType\s*!==\s*undefined\s*&&\s*query\.paymentType\s*!==\s*'NORMAL'/)
  assert.doesNotMatch(confirm, /NORMAL_PAYMENT/)
  assert.match(confirm, /recordLateRecoveryCheckpoint/)
  assert.ok(
    confirm.indexOf('const confirmationContext = readTonightDepositConfirmationContext')
      < confirm.indexOf('readTonightDepositCheckoutContext(current.data'),
    'the database-owned order must be validated before the checkout deadline is consulted',
  )
  assert.match(confirm, /catch \(error\) \{[\s\S]*TossPaymentError[\s\S]*getTossPaymentByOrderId\(params\.orderId\)/)
  assert.doesNotMatch(confirm, /error\.status\s*<\s*500/)
  assert.doesNotMatch(confirm, /p_provider_payment_key:\s*paymentKey/)
  assert.doesNotMatch(confirm, /privateJson\([^\n]*paymentKey/)
  assert.doesNotMatch(confirm, /console\.(?:log|error|warn)\([^\n]*paymentKey/)
  assert.match(cancel, /service_record_tonight_deposit_result/)
  assert.match(cancel, /readTonightDepositCancellationContext/)
  assert.match(cancel, /isTonightDepositOrderIdForContext/)
  assert.match(cancel, /p_status:\s*'cancelled'/)
  assert.doesNotMatch(cancel, /provider_payment_key(?!_hash)/)
  for (const source of [confirm, cancel]) {
    assert.doesNotMatch(source, /getPublicAppOrigin\(\)\s*\|\|\s*url\.origin/)
    assert.match(source, /if \(!origin\).*service_unavailable/)
  }
})

test('Tonight application requires the exact matching consent contract and passes it to SQL', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/tonight/apply/route.ts'),
    'utf8',
  )
  assert.match(source, /matchingConsentAccepted/)
  assert.match(source, /matchingConsentVersion/)
  assert.match(source, /2026-09-03/)
  assert.match(source, /p_matching_consent_accepted:\s*matchingConsentAccepted/)
  assert.match(source, /p_matching_consent_version:/)
})

test('internal Tonight routes use timing-safe cron auth and service-only clients', () => {
  for (const relativePath of [
    'app/api/internal/tonight/prepare/route.ts',
    'app/api/internal/tonight/allocate/route.ts',
    'app/api/internal/tonight/deposit-gate/route.ts',
    'app/api/internal/tonight/partner-acceptance-gate/route.ts',
    'app/api/internal/tonight/refunds/process/route.ts',
    'app/api/internal/tonight/settlements/process/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.match(source, /isAuthorizedInternalRequest/)
    assert.match(source, /CRON_SECRET/)
    assert.match(source, /createPaymentServiceClient/)
    assert.doesNotMatch(source, /NEXT_PUBLIC_CRON_SECRET/)
  }
  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/prepare' && cron.schedule === '*/15 * * * *'))
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/allocate' && cron.schedule === '* * * * *'))
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/deposit-gate' && cron.schedule === '* * * * *'))
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/partner-acceptance-gate'
      && cron.schedule === '* * * * *'))
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/refunds/process'
      && cron.schedule === '* * * * *'))
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/settlements/process'
      && cron.schedule === '*/5 * * * *'))

  const refunds = fs.readFileSync(
    path.join(process.cwd(), 'app/api/internal/tonight/refunds/process/route.ts'),
    'utf8',
  )
  assert.match(refunds, /service_dead_letter_tonight_refund_request/)
  assert.match(refunds, /settlement\.retryable\s*\?\s*await releaseClaim[\s\S]*?:\s*await deadLetterClaim/)
  assert.match(refunds, /runBoundedBatchDrain/)
  assert.match(refunds, /readTonightRefundWorkerConfig/)
  assert.match(refunds, /remaining_backlog/)
  assert.match(refunds, /dead_letter_count/)
  assert.match(refunds, /backlog_slo_exceeded/)
  assert.match(refunds, /stop_reason/)

  const settlements = fs.readFileSync(
    path.join(process.cwd(), 'app/api/internal/tonight/settlements/process/route.ts'),
    'utf8',
  )
  assert.doesNotMatch(settlements, /service_list_tonight_unsettled_teams/)
  assert.match(settlements, /service_claim_tonight_settlements/)
  assert.match(settlements, /service_release_tonight_settlement/)
  assert.match(settlements, /service_complete_tonight_settlement/)
  assert.match(settlements, /p_lease_id:\s*leaseId/)
  assert.match(settlements, /key:\s*\(value\)\s*=>\s*readJobId/)
  assert.match(settlements, /worker_deadline/)
  assert.match(settlements, /runBoundedWorkerPool/)
  assert.match(settlements, /service_finalize_tonight_settlement/)
  assert.match(settlements, /readTonightSettlementConfig/)
  assert.match(settlements, /readTonightDatabaseWorkerConfig/)
  assert.match(settlements, /runBoundedBatchDrain/)
  assert.match(settlements, /stop_reason/)
  assert.doesNotMatch(settlements, /searchParams.*fee|body.*fee|p_fee_per_attendee:\s*(?:body|query)/)

  const adminExceptions = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/tonight/exceptions/route.ts'),
    'utf8',
  )
  assert.match(adminExceptions, /admin_get_tonight_exception_page/)
  assert.match(adminExceptions, /admin_get_tonight_exception_counts/)
  assert.doesNotMatch(adminExceptions, /admin_get_tonight_(?:active|settlement|deposit_terminal|reconciliation|service)_exceptions/)
})

test('completed Tonight deposits are classified by a bounded service-only worker', () => {
  const relativePath = 'app/api/internal/tonight/deposits/finalize/route.ts'
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  assert.match(source, /isAuthorizedInternalRequest/)
  assert.match(source, /createPaymentServiceClient/)
  assert.match(source, /service_claim_tonight_deposit_dispositions/)
  assert.match(source, /service_release_tonight_deposit_disposition/)
  assert.match(source, /service_complete_tonight_deposit_disposition/)
  assert.match(source, /p_lease_id:\s*leaseId/)
  assert.match(source, /key:\s*\(value\)\s*=>\s*readJobId/)
  assert.match(source, /worker_deadline/)
  assert.match(source, /runBoundedWorkerPool/)
  assert.doesNotMatch(source, /service_list_tonight_unfinalized_deposits/)
  assert.match(source, /service_finalize_tonight_deposit_disposition/)
  assert.match(source, /readTonightDatabaseWorkerConfig/)
  assert.match(source, /runBoundedBatchDrain/)
  assert.match(source, /p_limit:\s*config\.batchSize/)
  assert.match(source, /stop_reason/)
  assert.match(source, /p_expected_attendance_revision:\s*expectedAttendanceRevision/)
  assert.match(source, /tonight-deposit-disposition-\$\{depositId\}-\$\{expectedAttendanceRevision\}/)
  assert.match(source, /failed > 0 \|\| work\.stopReason === 'repeated_claim' \? 503 : 200/)

  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/deposits/finalize'
      && cron.schedule === '* * * * *'))
})

test('prepared Tonight orders have a provider-independent bounded reconciliation worker', () => {
  const relativePath = 'app/api/internal/tonight/deposits/reconcile/route.ts'
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  assert.match(source, /isAuthorizedInternalRequest/)
  assert.match(source, /service_claim_tonight_deposit_reconciliations/)
  assert.match(source, /getTossPaymentByOrderId/)
  assert.match(source, /readTonightReconciliationWorkerConfig/)
  assert.match(source, /runBoundedBatchDrain/)
  assert.match(source, /service_record_tonight_deposit_result/)
  assert.match(source, /p_status:\s*'reconciliation_required'/)
  assert.match(source, /p_status:\s*'paid'/)
  assert.match(source, /service_release_tonight_deposit_reconciliation/)
  assert.match(source, /service_finalize_tonight_deposit_reconciliation/)
  assert.match(source, /evidence\.kind === 'not_found'/)
  assert.match(source, /service_record_tonight_reconciliation_not_found/)
  assert.match(source, /depositStatus/)
  assert.match(source, /p_status:\s*'cancelled'/)
  assert.match(source, /provider_cancelled_state_conflict/)
  assert.match(source, /stop_reason/)
  assert.doesNotMatch(source, /paymentKey\s*:/)

  const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/internal/tonight/deposits/reconcile'
      && cron.schedule === '* * * * *'))
})

test('Tonight prepare preserves curated activity duration in the persisted round', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/internal/tonight/prepare/route.ts'),
    'utf8',
  )
  assert.match(source, /p_activity_duration_minutes:\s*activities\.map\(\(activity\)\s*=>\s*activity\.durationMinutes\)/)
})

test('partner setup discovers the current PNU round when no round id is supplied', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/partner/tonight/setup/route.ts'),
    'utf8',
  )
  assert.match(source, /asOptionalUuid\(url\.searchParams\.get\('round_id'\)/)
  assert.match(source, /partner_get_current_tonight_setup/)
})

test('super-admin access and venue management routes are explicit and reason-free', () => {
  const contracts: Array<[string, RegExp[]]> = [
    ['app/api/admin/super-admin/tonight/access/admin/route.ts', [/grant_admin_revisioned/, /revoke_admin_revisioned/]],
    ['app/api/admin/super-admin/tonight/access/partner/route.ts', [/grant_venue_partner_membership/, /revoke_venue_partner_membership/, /list_venue_partner_memberships/]],
    ['app/api/admin/super-admin/tonight/access/market/route.ts', [/super_admin_grant_tonight_market_membership/, /super_admin_revoke_tonight_market_membership/, /super_admin_list_tonight_market_memberships/]],
    ['app/api/admin/super-admin/tonight/venues/snapshot/route.ts', [/create_venue_snapshot/]],
  ]
  for (const [relativePath, patterns] of contracts) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.match(source, /allowedRoles:\s*\['super_admin'\]/)
    assert.match(source, /requireRecentAuth:\s*true/)
    assert.match(source, /requireRequestAccess\(/)
    assert.match(source, /createSupabaseRequestClient\(/)
    assert.doesNotMatch(source, /body\.(?:reason|notes)/)
    for (const pattern of patterns) assert.match(source, pattern)
  }
})

test('admin grants and revocations use optimistic revision and exact idempotency', () => {
  const source = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/admin/route.ts',
  ), 'utf8')

  assert.match(source, /select\('user_id,role,granted_by,granted_at,revision'\)/)
  assert.match(source, /readStrictJson\(request,\s*\['user_id', 'role', 'expected_revision', 'idempotency_key'\]\)/)
  assert.match(source, /readStrictJson\(request,\s*\['user_id', 'expected_revision', 'idempotency_key'\]\)/)
  assert.match(source, /grant_admin_revisioned/)
  assert.match(source, /revoke_admin_revisioned/)
  assert.equal((source.match(/p_expected_revision/g) ?? []).length, 2)
  assert.equal((source.match(/p_idempotency_key/g) ?? []).length, 2)
})

test('admin role lookup returns a revoked targets tombstone revision for the next CAS', () => {
  const source = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/admin/route.ts',
  ), 'utf8')

  assert.match(source, /assertStrictSearchParams\(request, \['user_id'\]\)/)
  assert.match(source, /asOptionalUuid\(url\.searchParams\.get\('user_id'\), 'user_id'\)/)
  assert.match(source, /super_admin_get_admin_role_state/)
  assert.match(source, /is_active/)
})

test('every super-admin Tonight API requires a recent authenticated session', () => {
  const apiRoot = path.join(process.cwd(), 'app/api/admin/super-admin/tonight')
  const routeFiles: string[] = []
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.name === 'route.ts') routeFiles.push(absolute)
    }
  }
  walk(apiRoot)
  assert.ok(routeFiles.length >= 12)
  for (const routeFile of routeFiles) {
    const source = fs.readFileSync(routeFile, 'utf8')
    assert.match(source, /allowedRoles:\s*\['super_admin'\],\s*requireRecentAuth:\s*true/, routeFile)
  }
})

test('super-admin access lists keep bulk pages bounded and hydrate selected account labels behind the live guard', () => {
  const admin = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/admin/route.ts',
  ), 'utf8')
  const partner = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/partner/route.ts',
  ), 'utf8')
  const market = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/market/route.ts',
  ), 'utf8')
  const partnerDetail = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/partner/detail/route.ts',
  ), 'utf8')
  const marketDetail = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/market/detail/route.ts',
  ), 'utf8')
  const directoryHydrator = fs.readFileSync(path.join(
    process.cwd(),
    'lib/server/tonight/access-directory.ts',
  ), 'utf8')

  assert.match(admin, /display_name/)
  assert.match(admin, /email_hint/)
  for (const source of [partner, market]) {
    assert.match(source, /p_limit:\s*50/)
    assert.match(source, /next_after_membership_id/)
    assert.doesNotMatch(source, /hydrateTonightAccessMemberships/)
  }
  for (const source of [partnerDetail, marketDetail]) {
    assert.match(source, /hydrateTonightAccessMemberships/)
  }
  assert.match(directoryHydrator, /display_name/)
  assert.match(directoryHydrator, /email_hint/)
  assert.match(partnerDetail, /includeVenueName:\s*true/)
})

test('partner membership grants and revocations use optimistic revision and idempotency', () => {
  const source = fs.readFileSync(path.join(
    process.cwd(),
    'app/api/admin/super-admin/tonight/access/partner/route.ts',
  ), 'utf8')

  assert.match(source, /readStrictJson\(request,\s*\[\s*'user_id',\s*'venue_id',\s*'role',\s*'expected_revision',\s*'idempotency_key'/)
  assert.match(source, /readStrictJson\(request,\s*\[\s*'membership_id',\s*'expected_revision',\s*'idempotency_key'/)
  assert.equal((source.match(/p_expected_revision/g) ?? []).length, 2)
  assert.equal((source.match(/p_idempotency_key/g) ?? []).length, 2)
  const deleteHandler = source.slice(source.indexOf('export async function DELETE'))
  assert.match(deleteHandler, /expected_revision[\s\S]*?min:\s*1/)
})

test('super-admin directory keeps the live guard and reads through one caller-bound RPC', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/super-admin/tonight/directory/route.ts'),
    'utf8',
  )
  assert.match(source, /requireRequestAccess\(/)
  assert.match(source, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(source, /createSupabaseRequestClient\(/)
  assert.match(source, /rpc\('super_admin_search_tonight_directory',\s*\{\s*p_query:\s*query,?\s*\}\)/)
  assert.doesNotMatch(source, /createPaymentServiceClient|service_role/i)
  assert.doesNotMatch(source, /\.from\(['"](?:users|profiles|venues)['"]\)/)
  assert.doesNotMatch(source, /authorize_tonight_sensitive_read/)
  assert.match(source, /privateJson/)
  assert.match(source, /query_too_short/)
})

test('super-admin snapshot creation derives safe provider links when clients omit them', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/super-admin/tonight/venues/snapshot/route.ts'),
    'utf8',
  )
  assert.match(source, /buildProviderSearchLinks/)
  assert.match(source, /\.from\('venues'\)/)
  assert.match(source, /naverUrl\s*\?\?\s*providerLinks\.naver\.url/)
  assert.match(source, /kakaoUrl\s*\?\?\s*providerLinks\.kakao\.url/)
})

test('super-admin attendance and audit APIs never accept a manual reason', () => {
  for (const relativePath of [
    'app/api/admin/super-admin/tonight/attendance/route.ts',
    'app/api/admin/super-admin/tonight/audit/route.ts',
  ]) {
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.doesNotMatch(source, /body\.(?:reason|notes)|p_reason|p_notes/)
    assert.match(source, /privateJson/)
  }
  const audit = fs.readFileSync(
    path.join(process.cwd(), 'app/api/admin/super-admin/tonight/audit/route.ts'),
    'utf8',
  )
  assert.match(audit, /sanitizeAuditState/)
  assert.match(audit, /payment_key|secret|token/)
})

test('super-admin refund retry is live-guarded, revisioned, idempotent, and reason-free', () => {
  const relativePath = 'app/api/admin/super-admin/tonight/refunds/retry/route.ts'
  assert.equal(fs.existsSync(path.join(process.cwd(), relativePath)), true)
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

  assert.match(source, /requireRequestAccess\(/)
  assert.match(source, /allowedRoles:\s*\['super_admin'\]/)
  assert.match(source, /createSupabaseRequestClient\(/)
  assert.match(source, /super_admin_retry_tonight_refund/)
  assert.match(source, /p_request_id/)
  assert.match(source, /p_expected_revision/)
  assert.match(source, /p_idempotency_key/)
  assert.match(source, /readStrictJson\(request,\s*\[\s*'requestId',\s*'expectedRevision',\s*'idempotencyKey'[\s\S]*?\]/)
  assert.doesNotMatch(source, /body\.(?:reason|notes)|p_(?:reason|notes)/)
  assert.match(source, /privateJson\(/)
  assert.match(source, /tonightRpcErrorResponse\(/)
})

test('super-admin reconciliation inspection and retry are guarded and expose no provider secret', () => {
  const listPath = 'app/api/admin/super-admin/tonight/reconciliations/route.ts'
  const retryPath = 'app/api/admin/super-admin/tonight/reconciliations/retry/route.ts'
  for (const relativePath of [listPath, retryPath]) {
    assert.equal(fs.existsSync(path.join(process.cwd(), relativePath)), true)
    const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
    assert.match(source, /requireRequestAccess\(/)
    assert.match(source, /allowedRoles:\s*\['super_admin'\]/)
    assert.match(source, /requireRecentAuth:\s*true/)
    assert.match(source, /createSupabaseRequestClient\(/)
    assert.match(source, /privateJson\(/)
    assert.doesNotMatch(source, /paymentKey|provider_payment_key|provider_order_id/)
  }
  const retry = fs.readFileSync(path.join(process.cwd(), retryPath), 'utf8')
  assert.match(retry, /super_admin_retry_tonight_reconciliation/)
  assert.match(retry, /p_job_id/)
  assert.match(retry, /p_expected_revision/)
  assert.match(retry, /p_idempotency_key/)
  assert.doesNotMatch(retry, /body\.(?:reason|notes)|p_(?:reason|notes)/)
})
