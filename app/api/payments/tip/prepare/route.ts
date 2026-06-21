import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/payments/auth'
import { generateOrderId } from '@/lib/payments/orders'
import { TIP_MIN_KRW, TIP_MAX_KRW } from '@/lib/payments/config'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { match_id, amount } = await req.json()
  if (!match_id || typeof amount !== 'number') {
    return NextResponse.json({ error: 'match_id, amount required' }, { status: 400 })
  }
  if (amount < TIP_MIN_KRW || amount > TIP_MAX_KRW) {
    return NextResponse.json({ error: `amount must be ${TIP_MIN_KRW}~${TIP_MAX_KRW}` }, { status: 400 })
  }
  // payer는 세션 사용자에서 도출(스푸핑 차단).
  const payer_user_id = user.id

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
