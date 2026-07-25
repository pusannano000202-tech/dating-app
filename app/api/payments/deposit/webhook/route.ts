import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import {
  buildTossRefundRequestKey,
  getTossPayment,
  getTossPaymentByOrderId,
  TossPaymentError,
  verifyTossPartialRefundEvidence,
  type TossPaymentObject,
} from '@/lib/payments/toss'
import { getSupabaseAdminKey } from '@/lib/supabase-admin'
import { getSupabaseUrl } from '@/lib/utils'

interface WebhookDatabase {
  public: {
    Tables: {
      deposits: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      deposit_refund_requests: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      finalize_toss_deposit_payment: {
        Args: {
          p_deposit_id: string
          p_match_id: string
          p_group_id: string
          p_user_id: string
          p_payment_key: string
          p_order_id: string
          p_paid_at: string
        }
        Returns: Array<Record<string, unknown>>
      }
      finalize_refund_request: {
        Args: {
          p_refund_request_id: string
          p_settlement_version: number
          p_provider: string
          p_settlement_key: string
          p_provider_request_key: string
          p_provider_status: string
          p_provider_payment_key: string
          p_provider_order_id: string
          p_settled_refund_amount: number
        }
        Returns: Array<Record<string, unknown>>
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

interface DepositWebhookRow {
  id: string
  match_id: string
  group_id: string
  user_id: string
  status: string
  amount: number
  toss_order_id: string
  toss_payment_key: string | null
  refunded_amount: number | null
  retained_amount: number | null
  notes: string | null
}

interface RefundRequestWebhookRow {
  id: string
  deposit_id: string
  status: 'pending' | 'processed' | 'cancelled'
  requested_refund_amount: number
  settlement_version: number
  provider: string | null
  provider_status: string | null
  settlement_key: string | null
  provider_request_key: string | null
  provider_payment_key: string | null
  provider_order_id: string | null
  settled_refund_amount: number | null
}

export async function POST(req: NextRequest) {
  const provider = resolveDepositPaymentProvider()
  const readiness = getDepositPaymentReadiness(provider)

  if (!readiness.ok) {
    return NextResponse.json({
      error: 'payment_provider_not_configured',
      provider: readiness.provider,
    }, { status: 503 })
  }

  if (provider === 'mock') {
    return NextResponse.json({ provider, received: true, ignored: true })
  }

  const rawBody = await req.text()
  if (!rawBody.trim()) {
    return NextResponse.json({ error: 'empty_webhook_body' }, { status: 400 })
  }

  const event = parseWebhookEvent(rawBody)
  if (!event) {
    return NextResponse.json({ error: 'invalid_webhook_body' }, { status: 400 })
  }

  const serviceRoleKey = getSupabaseAdminKey()
  const supabaseUrl = getSupabaseUrl()
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'server_settlement_not_configured', provider }, { status: 503 })
  }

  try {
    const payment = await verifyPaymentFromWebhook(event)
    const result = await reconcileDepositFromPayment({
      service: createSupabaseServiceClient<WebhookDatabase>(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }),
      payment,
      eventType: event.eventType,
      transmissionId: req.headers.get('tosspayments-webhook-transmission-id') ?? undefined,
    })

    return NextResponse.json({
      provider,
      received: true,
      status: result.status,
      deposit: result.deposit,
      payment: {
        orderId: payment.orderId,
        paymentKey: payment.paymentKey,
        status: payment.status,
      },
    }, { status: result.httpStatus })
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return NextResponse.json({
        error: error.code,
        provider,
        status: 'webhook_requery_failed',
      }, { status: error.status })
    }

    if (error instanceof WebhookReconcileError) {
      return NextResponse.json({
        error: error.code,
        provider,
        status: error.status,
      }, { status: error.httpStatus })
    }

    return NextResponse.json({ error: 'webhook_reconciliation_failed', provider }, { status: 502 })
  }
}

interface TossWebhookEvent {
  eventType: string
  paymentKey?: string
  orderId?: string
}

class WebhookReconcileError extends Error {
  readonly code: string
  readonly status: string
  readonly httpStatus: number

  constructor(code: string, httpStatus: number, status = 'webhook_reconciliation_failed') {
    super(code)
    this.name = 'WebhookReconcileError'
    this.code = code
    this.status = status
    this.httpStatus = httpStatus
  }
}

function parseWebhookEvent(rawBody: string): TossWebhookEvent | null {
  try {
    const json = JSON.parse(rawBody) as Record<string, unknown>
    const data = isRecord(json.data) ? json.data : {}
    const eventType = readString(json.eventType) ?? 'UNKNOWN'
    const paymentKey = readString(data.paymentKey) ?? readString(json.paymentKey)
    const orderId = readString(data.orderId) ?? readString(json.orderId)

    if (!paymentKey && !orderId) return null

    return {
      eventType,
      paymentKey: paymentKey ?? undefined,
      orderId: orderId ?? undefined,
    }
  } catch {
    return null
  }
}

async function verifyPaymentFromWebhook(event: TossWebhookEvent) {
  // Toss general payment webhooks have no signature header.
  // Official guidance is to re-query Payment API with paymentKey/orderId and trust that response.
  if (event.paymentKey) return getTossPayment(event.paymentKey)
  if (event.orderId) return getTossPaymentByOrderId(event.orderId)

  throw new WebhookReconcileError('payment_identifier_required', 400)
}

async function reconcileDepositFromPayment(params: {
  service: SupabaseClient<WebhookDatabase, 'public'>
  payment: TossPaymentObject
  eventType: string
  transmissionId?: string
}) {
  const { payment, service } = params

  if (!payment.orderId) {
    throw new WebhookReconcileError('order_id_required', 400)
  }

  if (payment.totalAmount !== DEPOSIT_AMOUNT) {
    throw new WebhookReconcileError('payment_amount_mismatch', 400, 'payment_verification_failed')
  }

  const reconcileAction = mapTossPaymentStatusToReconcileAction(payment.status)
  if (!reconcileAction) {
    return {
      status: 'ignored_payment_status',
      httpStatus: 200,
      deposit: null,
    }
  }

  const { data: existingDeposit, error: lookupError } = await service
    .from('deposits')
    .select('id,match_id,group_id,user_id,status,amount,toss_order_id,toss_payment_key,refunded_amount,retained_amount,notes')
    .eq('toss_order_id', payment.orderId)
    .maybeSingle()

  if (lookupError) {
    throw new WebhookReconcileError('deposit_lookup_failed', 400)
  }
  if (!existingDeposit) {
    return {
      status: 'ignored_deposit_not_found',
      httpStatus: 200,
      deposit: null,
    }
  }

  const deposit = existingDeposit as DepositWebhookRow
  if (deposit.amount !== DEPOSIT_AMOUNT) {
    throw new WebhookReconcileError('deposit_amount_mismatch', 409, 'payment_verification_failed')
  }
  if (payment.paymentKey !== deposit.toss_payment_key && deposit.toss_payment_key) {
    throw new WebhookReconcileError('payment_key_mismatch', 409, 'payment_verification_failed')
  }
  if (reconcileAction === 'partial_cancellation') {
    return reconcilePartialRefund({
      service,
      payment,
      deposit,
    })
  }
  if (reconcileAction === 'finalize_payment' && deposit.status === 'refunded') {
    return {
      status: 'ignored_already_refunded',
      httpStatus: 200,
      deposit,
    }
  }

  if (reconcileAction === 'finalize_payment') {
    const finalized = await service
      .rpc('finalize_toss_deposit_payment', {
        p_deposit_id: deposit.id,
        p_match_id: deposit.match_id,
        p_group_id: deposit.group_id,
        p_user_id: deposit.user_id,
        p_payment_key: payment.paymentKey,
        p_order_id: payment.orderId,
        p_paid_at: payment.approvedAt ?? new Date().toISOString(),
      })
      .maybeSingle()

    if (finalized.error || !finalized.data) {
      throw new WebhookReconcileError(
        'payment_reconciliation_required',
        502,
        'payment_reconciliation_required',
      )
    }

    return {
      status: 'reconciled',
      httpStatus: 200,
      deposit: finalized.data,
    }
  }

  const refundedAmount = sumSuccessfulCancelAmount(payment.cancels)
  if (refundedAmount !== deposit.amount) {
    throw new WebhookReconcileError(
      'partial_cancellation_requires_reconciliation',
      409,
      'payment_reconciliation_required',
    )
  }
  if (
    deposit.status === 'refunded'
    && deposit.refunded_amount === deposit.amount
    && deposit.retained_amount === 0
    && hasProcessedWebhookTransmission(deposit.notes, params.transmissionId)
  ) {
    return {
      status: 'ignored_duplicate_webhook',
      httpStatus: 200,
      deposit,
    }
  }

  const { data: refundedDeposit, error: refundError } = await service
    .from('deposits')
    .update({
      status: 'refunded',
      toss_payment_key: payment.paymentKey,
      refunded_at: getLatestSuccessfulCancelTime(payment.cancels) ?? new Date().toISOString(),
      refunded_amount: deposit.amount,
      retained_amount: 0,
      notes: [
        deposit.notes,
        buildWebhookNote(params.eventType, payment.status, params.transmissionId),
      ].filter(Boolean).join(' | '),
    })
    .eq('id', deposit.id)
    .eq('match_id', deposit.match_id)
    .eq('group_id', deposit.group_id)
    .eq('user_id', deposit.user_id)
    .eq('toss_order_id', deposit.toss_order_id)
    .in('status', ['pending', 'paid', 'held', 'refunded'])
    .select('id,match_id,group_id,user_id,status,toss_order_id,toss_payment_key,refunded_at,refunded_amount,retained_amount')
    .maybeSingle()

  if (refundError || !refundedDeposit) {
    throw new WebhookReconcileError(
      'payment_reconciliation_required',
      502,
      'payment_reconciliation_required',
    )
  }

  return {
    status: 'reconciled',
    httpStatus: 200,
    deposit: refundedDeposit,
  }
}

async function reconcilePartialRefund(params: {
  service: SupabaseClient<WebhookDatabase, 'public'>
  payment: TossPaymentObject
  deposit: DepositWebhookRow
}) {
  const { service, payment, deposit } = params
  if (
    !deposit.toss_payment_key
    || deposit.toss_payment_key !== payment.paymentKey
    || deposit.toss_order_id !== payment.orderId
  ) {
    throw new WebhookReconcileError(
      'partial_cancellation_requires_reconciliation',
      409,
      'payment_reconciliation_required',
    )
  }

  const { data: requestData, error: requestError } = await service
    .from('deposit_refund_requests')
    .select(
      'id,deposit_id,status,requested_refund_amount,settlement_version,provider,provider_status,settlement_key,provider_request_key,provider_payment_key,provider_order_id,settled_refund_amount',
    )
    .eq('deposit_id', deposit.id)
    .in('status', ['pending', 'processed'])
    .maybeSingle()

  if (requestError || !requestData) {
    throw new WebhookReconcileError(
      'partial_cancellation_requires_reconciliation',
      409,
      'payment_reconciliation_required',
    )
  }

  const refundRequest = requestData as RefundRequestWebhookRow
  const evidence = verifyTossPartialRefundEvidence(payment, {
    requestedRefundAmount: refundRequest.requested_refund_amount,
    depositAmount: deposit.amount,
  })
  if (!evidence.ok) {
    throw new WebhookReconcileError(
      'partial_cancellation_requires_reconciliation',
      409,
      'payment_reconciliation_required',
    )
  }

  const requestKey = buildTossRefundRequestKey({
    refundRequestId: refundRequest.id,
    settlementVersion: refundRequest.settlement_version,
    refundAmount: refundRequest.requested_refund_amount,
  })

  if (refundRequest.status === 'processed') {
    if (
      refundRequest.provider === 'toss'
      && refundRequest.provider_status === payment.status
      && refundRequest.settlement_key === evidence.transactionKey
      && refundRequest.provider_request_key === requestKey
      && refundRequest.provider_payment_key === payment.paymentKey
      && refundRequest.provider_order_id === payment.orderId
      && refundRequest.settled_refund_amount === refundRequest.requested_refund_amount
    ) {
      return {
        status: 'ignored_duplicate_refund_webhook',
        httpStatus: 200,
        deposit,
      }
    }

    throw new WebhookReconcileError(
      'partial_cancellation_requires_reconciliation',
      409,
      'payment_reconciliation_required',
    )
  }

  const finalized = await service
    .rpc('finalize_refund_request', {
      p_refund_request_id: refundRequest.id,
      p_settlement_version: refundRequest.settlement_version,
      p_provider: 'toss',
      p_settlement_key: evidence.transactionKey,
      p_provider_request_key: requestKey,
      p_provider_status: payment.status,
      p_provider_payment_key: payment.paymentKey,
      p_provider_order_id: payment.orderId,
      p_settled_refund_amount: refundRequest.requested_refund_amount,
    })
    .maybeSingle()

  if (finalized.error || !finalized.data) {
    throw new WebhookReconcileError(
      'payment_reconciliation_required',
      502,
      'payment_reconciliation_required',
    )
  }

  return {
    status: 'reconciled_partial_refund',
    httpStatus: 200,
    deposit: finalized.data,
  }
}

function mapTossPaymentStatusToReconcileAction(status: string) {
  if (status === 'DONE') return 'finalize_payment'
  if (status === 'CANCELED') return 'finalize_refund'
  if (status === 'PARTIAL_CANCELED') return 'partial_cancellation'
  return null
}

function buildWebhookNote(eventType: string, paymentStatus: string, transmissionId?: string) {
  return [
    `toss_webhook=${eventType}`,
    `payment_status=${paymentStatus}`,
    transmissionId ? `transmission_id=${transmissionId}` : null,
  ].filter(Boolean).join(' ')
}

function hasProcessedWebhookTransmission(notes: string | null, transmissionId?: string) {
  if (!notes || !transmissionId) return false

  const transmissionToken = `transmission_id=${transmissionId}`
  return notes
    .split(' | ')
    .some((note) => note.split(' ').includes(transmissionToken))
}

function sumSuccessfulCancelAmount(cancels: TossPaymentObject['cancels']) {
  return (cancels ?? [])
    .filter((cancel) => cancel.cancelStatus === 'DONE')
    .reduce((sum, cancel) => sum + (cancel.cancelAmount ?? 0), 0)
}

function getLatestSuccessfulCancelTime(cancels: TossPaymentObject['cancels']) {
  return [...(cancels ?? [])]
    .reverse()
    .find((cancel) => cancel.cancelStatus === 'DONE' && cancel.canceledAt)
    ?.canceledAt ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
