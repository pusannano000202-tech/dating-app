import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateOrderId } from '@/lib/payments/orders'
import { DEPOSIT_AMOUNT_KRW } from '@/lib/payments/config'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const { match_id, group_id, payer_user_id } = await req.json()
  if (!match_id || !group_id || !payer_user_id) {
    return NextResponse.json({ error: 'match_id, group_id, payer_user_id required' }, { status: 400 })
  }

  const orderId = generateOrderId('deposit')
  const amount = DEPOSIT_AMOUNT_KRW
  const supabase = createServiceClient()

  const { error } = await supabase.from('deposits').insert({
    match_id, group_id, payer_user_id,
    order_id: orderId, amount, status: 'pending',
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName: 'Destiny 과팅 보증금',
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  })
}
