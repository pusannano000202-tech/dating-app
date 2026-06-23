import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseServiceClient, type SupabaseClient } from '@supabase/supabase-js'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { getDepositPaymentReadiness } from '@/lib/payments/deposit'
import { cancelTossPayment, TossPaymentError } from '@/lib/payments/toss'
import { appFeeToRefundAmount, normalizeAppFeeAmount } from '@/lib/refund/fee-flow'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSupabaseUrl } from '@/lib/utils'

interface RefundRpcResult {
  refund_request_id: string
  requested_refund_amount: number
  deposit_amount: number
  app_revenue: number
}

interface DepositSettlementRow {
  [key: string]: unknown
  id: string
  amount: number
  status: string
  toss_payment_key: string | null
  notes: string | null
}

interface MatchSettlementRow {
  [key: string]: unknown
  group_a_id: string | null
  group_b_id: string | null
}

interface SettlementDatabase {
  public: {
    Tables: {
      matches: {
        Row: MatchSettlementRow
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
        Relationships: []
      }
      deposits: {
        Row: DepositSettlementRow
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJson(req)
  const appFeeAmount = typeof body.app_fee_amount === 'number'
    ? normalizeAppFeeAmount(body.app_fee_amount, DEPOSIT_AMOUNT)
    : null
  const refundAmount = appFeeAmount !== null
    ? appFeeToRefundAmount(appFeeAmount, DEPOSIT_AMOUNT)
    : typeof body.refund_amount === 'number' && body.refund_amount >= 0
      ? Math.floor(body.refund_amount)
      : null
  if (refundAmount === null) {
    return NextResponse.json({ error: 'invalid_refund_amount' }, { status: 400 })
  }
  const zeroReasons = Array.isArray(body.zero_refund_reasons)
    ? body.zero_refund_reasons.filter((s): s is string => typeof s === 'string') : null
  const zeroComment = typeof body.zero_refund_comment === 'string' ? body.zero_refund_comment : null

  const { data, error } = await supabase
    .rpc('submit_refund_request', {
      p_match_id: params.id,
      p_refund_amount: refundAmount,
      p_zero_refund_reasons: zeroReasons,
      p_zero_refund_comment: zeroComment,
    })
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message || 'submit_failed' }, { status: 400 })

  const result = data as RefundRpcResult | null
  const externalRefund = await settleExternalRefund({
    matchId: params.id,
    userId: user.id,
    refundAmount: result?.requested_refund_amount ?? refundAmount,
  })

  return NextResponse.json({ result, external_refund: externalRefund })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}

async function settleExternalRefund(params: {
  matchId: string
  userId: string
  refundAmount: number
}) {
  if (params.refundAmount <= 0) {
    return {
      status: 'not_required',
      reason: 'refund_amount_zero',
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = getSupabaseUrl()
  if (!serviceRoleKey || !supabaseUrl) {
    return {
      status: 'not_checked',
      reason: 'server_settlement_not_configured',
    }
  }

  const service: SupabaseClient<SettlementDatabase, 'public'> = createSupabaseServiceClient<SettlementDatabase>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const deposit = await findRefundedDeposit({
    service,
    matchId: params.matchId,
    userId: params.userId,
  })

  if (!deposit) {
    return {
      status: 'not_checked',
      reason: 'deposit_not_found',
    }
  }

  const paymentKey = deposit.toss_payment_key?.trim() ?? ''
  if (!paymentKey || paymentKey.toUpperCase().startsWith('MOCK_')) {
    return {
      status: 'not_required',
      reason: 'mock_or_missing_payment_key',
    }
  }

  const readiness = getDepositPaymentReadiness('toss')
  if (!readiness.ok) {
    return {
      status: 'pending_provider_configuration',
      provider: 'toss',
    }
  }

  try {
    const payment = await cancelTossPayment({
      paymentKey,
      cancelReason: '정상 만남 후 보증금 환불',
      cancelAmount: params.refundAmount,
      idempotencyKey: `match_refund_${params.matchId}_${params.userId}_${params.refundAmount}`,
    })

    const notes = [
      deposit.notes,
      `external_refund=toss:${payment.status}:amount=${params.refundAmount}`,
    ].filter(Boolean).join(' | ')

    const { error: updateError } = await service
      .from('deposits')
      .update({
        status: 'refunded',
        refunded_at: new Date().toISOString(),
        notes,
      })
      .eq('id', deposit.id)

    if (updateError) {
      return {
        status: 'settled_record_update_failed',
        provider: 'toss',
      }
    }

    return {
      status: 'refunded',
      provider: 'toss',
      amount: params.refundAmount,
      payment_status: payment.status,
    }
  } catch (error) {
    if (error instanceof TossPaymentError) {
      return {
        status: 'failed',
        provider: 'toss',
        error: error.code,
      }
    }

    return {
      status: 'failed',
      provider: 'toss',
      error: 'cancel_failed',
    }
  }
}

async function findRefundedDeposit(params: {
  service: SupabaseClient<SettlementDatabase, 'public'>
  matchId: string
  userId: string
}) {
  const { data: match } = await params.service
    .from('matches')
    .select('group_a_id,group_b_id')
    .eq('id', params.matchId)
    .maybeSingle()

  const groupIds = [
    (match as MatchSettlementRow | null)?.group_a_id,
    (match as MatchSettlementRow | null)?.group_b_id,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  if (groupIds.length === 0) return null

  const { data } = await params.service
    .from('deposits')
    .select('id,amount,status,toss_payment_key,notes')
    .eq('user_id', params.userId)
    .in('group_id', groupIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as DepositSettlementRow | null
}
