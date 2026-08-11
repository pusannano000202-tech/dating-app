import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedInternalRequest } from '@/lib/auth/internal-request'
import { createPaymentServiceClient } from '@/lib/payments/deposit-server'
import {
  settleRefundWithProvider,
  type PreparedRefundResult,
  type RefundDepositRow,
} from '@/lib/payments/refund-settlement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
const MAX_REFUNDS_PER_INVOCATION = 5

interface ClaimedRefundRow {
  refund_request_id: string
  deposit_id: string
  match_id: string
  user_id: string
  requested_refund_amount: number
  deposit_amount: number | null
  settlement_version: number
  deposit_status: string | null
  toss_payment_key: string | null
  toss_order_id: string | null
}

type PaymentServiceClient = NonNullable<ReturnType<typeof createPaymentServiceClient>>

export async function GET(req: NextRequest) {
  return processRefundQueue(req, process.env.CRON_SECRET, 'cron_secret_not_configured')
}

export async function POST(req: NextRequest) {
  return processRefundQueue(
    req,
    process.env.PAYMENT_INTERNAL_SECRET,
    'payment_internal_secret_not_configured',
  )
}

async function processRefundQueue(
  req: NextRequest,
  secret: string | undefined,
  missingSecretError: string,
) {
  if (!secret) {
    return NextResponse.json({ error: missingSecretError }, { status: 503 })
  }
  if (!isAuthorizedInternalRequest(req.headers.get('authorization'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createPaymentServiceClient()
  if (!service) {
    return NextResponse.json({ error: 'server_settlement_not_configured' }, { status: 503 })
  }

  const expired = await service.rpc('expire_refund_requests')
  if (expired.error) {
    return NextResponse.json({ error: 'refund_expiry_queue_failed' }, { status: 500 })
  }

  const body = await readJson(req)
  const requestedLimit = typeof body.limit === 'number' && Number.isFinite(body.limit)
    ? Math.floor(body.limit)
    : MAX_REFUNDS_PER_INVOCATION
  const limit = Math.min(MAX_REFUNDS_PER_INVOCATION, Math.max(1, requestedLimit))
  const leaseId = randomUUID()

  const claimed = await service.rpc('claim_pending_refund_requests', {
    p_lease_id: leaseId,
    p_limit: limit,
    p_lease_seconds: 120,
  })
  if (claimed.error) {
    return NextResponse.json({ error: 'refund_claim_failed' }, { status: 500 })
  }

  const results = []
  const rows = (claimed.data ?? []) as ClaimedRefundRow[]
  for (const row of rows) {
    results.push(await processClaimedRefund(service, leaseId, row))
  }

  return NextResponse.json({
    queued: typeof expired.data === 'number' ? expired.data : 0,
    claimed: results.length,
    processed: results.filter((result) => result.status === 'processed').length,
    retrying: results.filter((result) => result.status === 'retrying').length,
    results,
  })
}

async function processClaimedRefund(
  service: PaymentServiceClient,
  leaseId: string,
  row: ClaimedRefundRow,
) {
  if (row.deposit_amount === null || row.deposit_status === null) {
    return releaseForRetry(service, leaseId, row.refund_request_id, 'deposit_not_found', 3600)
  }

  const request: PreparedRefundResult = {
    refund_request_id: row.refund_request_id,
    deposit_id: row.deposit_id,
    requested_refund_amount: row.requested_refund_amount,
    deposit_amount: row.deposit_amount,
    app_revenue: row.deposit_amount - row.requested_refund_amount,
    request_status: 'pending',
    settlement_version: row.settlement_version,
    settlement_provider: null,
    settlement_provider_status: null,
    settled_refund_amount: null,
  }
  const deposit: RefundDepositRow = {
    id: row.deposit_id,
    match_id: row.match_id,
    user_id: row.user_id,
    amount: row.deposit_amount,
    status: row.deposit_status,
    toss_payment_key: row.toss_payment_key,
    toss_order_id: row.toss_order_id,
  }

  const settlement = await settleRefundWithProvider({ request, deposit })
  if (!settlement.ok) {
    return releaseForRetry(
      service,
      leaseId,
      row.refund_request_id,
      settlement.error,
      retryDelaySeconds(settlement.status),
    )
  }

  const finalized = await service.rpc('finalize_refund_request', {
    p_refund_request_id: row.refund_request_id,
    p_settlement_version: row.settlement_version,
    p_provider: settlement.value.provider,
    p_settlement_key: settlement.value.reference,
    p_provider_request_key: settlement.value.requestKey,
    p_provider_status: settlement.value.status,
    p_provider_payment_key: settlement.value.paymentKey,
    p_provider_order_id: settlement.value.orderId,
    p_settled_refund_amount: settlement.value.settledAmount,
  }).maybeSingle()

  if (finalized.error || !finalized.data) {
    return releaseForRetry(service, leaseId, row.refund_request_id, 'refund_finalize_failed', 300)
  }

  return { refund_request_id: row.refund_request_id, status: 'processed' as const }
}

async function releaseForRetry(
  service: PaymentServiceClient,
  leaseId: string,
  refundRequestId: string,
  error: string,
  retryAfterSeconds: number,
) {
  const released = await service.rpc('release_refund_request_lease', {
    p_refund_request_id: refundRequestId,
    p_lease_id: leaseId,
    p_error: error,
    p_retry_after_seconds: retryAfterSeconds,
  })

  return {
    refund_request_id: refundRequestId,
    status: 'retrying' as const,
    reason: error,
    lease_released: !released.error && released.data === true,
  }
}

function retryDelaySeconds(status: number) {
  if (status === 503 || status >= 500) return 300
  if (status === 409) return 3600
  return 900
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    return await req.json() as Record<string, unknown>
  } catch {
    return {}
  }
}
