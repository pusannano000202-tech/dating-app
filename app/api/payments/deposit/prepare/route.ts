import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/payments/auth'
import { generateOrderId } from '@/lib/payments/orders'
import { DEPOSIT_AMOUNT_KRW } from '@/lib/payments/config'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { match_id, group_id } = await req.json()
  if (!match_id || !group_id) {
    return NextResponse.json({ error: 'match_id, group_id required' }, { status: 400 })
  }
  // payer는 클라이언트 입력이 아니라 세션 사용자에서 도출(스푸핑 차단).
  const payer_user_id = user.id

  const amount = DEPOSIT_AMOUNT_KRW
  const supabase = createServiceClient()

  // 멱등: 같은 (match_id, group_id) pending 주문이 이미 있으면 그걸 반환(중복 행 방지).
  const { data: existing } = await supabase
    .from('deposits')
    .select('order_id, amount')
    .eq('match_id', match_id)
    .eq('group_id', group_id)
    .eq('status', 'pending')
    .maybeSingle()
  if (existing) {
    return NextResponse.json({
      orderId: existing.order_id,
      amount: existing.amount,
      orderName: 'Destiny 과팅 보증금',
      clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
    })
  }

  const orderId = generateOrderId('deposit')
  const { error } = await supabase.from('deposits').insert({
    match_id, group_id, payer_user_id,
    order_id: orderId, amount, status: 'pending',
  })
  if (error) {
    // 부분 유니크 인덱스 위반(동시요청) → 기존 pending 반환
    if (error.code === '23505') {
      const { data: row } = await supabase
        .from('deposits')
        .select('order_id, amount')
        .eq('match_id', match_id)
        .eq('group_id', group_id)
        .eq('status', 'pending')
        .maybeSingle()
      if (row) {
        return NextResponse.json({
          orderId: row.order_id,
          amount: row.amount,
          orderName: 'Destiny 과팅 보증금',
          clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
        })
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orderId,
    amount,
    orderName: 'Destiny 과팅 보증금',
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  })
}
