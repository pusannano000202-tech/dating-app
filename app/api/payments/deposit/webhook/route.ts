import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import {
  getDepositPaymentReadiness,
  resolveDepositPaymentProvider,
} from '@/lib/payments/deposit'
import {
  getTossPayment,
  getTossPaymentByOrderId,
  TossPaymentError,
  type TossPaymentObject,
} from '@/lib/payments/toss'
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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

interface DepositWebhookRow {
  id: string
  status: string
  notes: string | null
}

export async function POST(req: NextRequest) {
  const provider = resolveDepositPaymentProvider(req.nextUrl.searchParams.get('provider'))
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

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
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

  const nextStatus = mapTossPaymentStatusToDepositStatus(payment.status)
  if (!nextStatus) {
    return {
      status: 'ignored_payment_status',
      httpStatus: 200,
      deposit: null,
    }
  }

  const { data: existingDeposit, error: lookupError } = await service
    .from('deposits')
    .select('id,status,notes')
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
  if (nextStatus === 'paid' && deposit.status === 'refunded') {
    return {
      status: 'ignored_already_refunded',
      httpStatus: 200,
      deposit,
    }
  }

  const updates: Record<string, unknown> = {
    status: nextStatus,
    toss_payment_key: payment.paymentKey,
    notes: [
      deposit.notes,
      buildWebhookNote(params.eventType, payment.status, params.transmissionId),
    ].filter(Boolean).join(' | '),
  }

  if (nextStatus === 'paid') {
    updates.paid_at = payment.approvedAt ?? new Date().toISOString()
  }
  if (nextStatus === 'refunded') {
    updates.refunded_at = new Date().toISOString()
  }

  const { data, error } = await service
    .from('deposits')
    .update(updates)
    .eq('id', deposit.id)
    .in('status', ['pending', 'paid', 'held', 'refunded'])
    .select('id,status,toss_order_id,toss_payment_key,paid_at,refunded_at')
    .maybeSingle()

  if (error) {
    throw new WebhookReconcileError('deposit_reconcile_failed', 400)
  }
  if (!data) {
    throw new WebhookReconcileError('deposit_reconcile_race', 409)
  }

  return {
    status: 'reconciled',
    httpStatus: 200,
    deposit: data,
  }
}

function mapTossPaymentStatusToDepositStatus(status: string) {
  if (status === 'DONE') return 'paid'
  if (status === 'CANCELED' || status === 'PARTIAL_CANCELED') return 'refunded'
  return null
}

function buildWebhookNote(eventType: string, paymentStatus: string, transmissionId?: string) {
  return [
    `toss_webhook=${eventType}`,
    `payment_status=${paymentStatus}`,
    transmissionId ? `transmission_id=${transmissionId}` : null,
  ].filter(Boolean).join(' ')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
