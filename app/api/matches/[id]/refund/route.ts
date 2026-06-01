import { NextRequest, NextResponse } from 'next/server'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { appFeeToRefundAmount, normalizeAppFeeAmount } from '@/lib/refund/fee-flow'
import { createSupabaseServerClient } from '@/lib/supabase-server'

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
  return NextResponse.json({ result: data })
}

async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try { return await req.json() as Record<string, unknown> } catch { return {} }
}
