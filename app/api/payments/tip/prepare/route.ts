import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { generateOrderId } from '@/lib/payments/orders'
import { TIP_MIN_KRW, TIP_MAX_KRW } from '@/lib/payments/config'

export async function POST(req: Request) {
  const { match_id, payer_user_id, amount } = await req.json()
  if (!match_id || !payer_user_id || typeof amount !== 'number') {
    return NextResponse.json({ error: 'match_id, payer_user_id, amount required' }, { status: 400 })
  }
  if (amount < TIP_MIN_KRW || amount > TIP_MAX_KRW) {
    return NextResponse.json({ error: `amount must be ${TIP_MIN_KRW}~${TIP_MAX_KRW}` }, { status: 400 })
  }

  const orderId = generateOrderId('tip')
  const supabase = createServiceClient()
  const { error } = await supabase.from('tips').insert({
    match_id, payer_user_id, order_id: orderId, amount, status: 'pending',
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName: 'Destiny 뽀찌',
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  })
}
