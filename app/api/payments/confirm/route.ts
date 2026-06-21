import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionUser } from '@/lib/payments/auth'
import { confirmPayment } from '@/lib/payments/toss'
import { assertAmountMatches } from '@/lib/payments/orders'

export const runtime = 'nodejs'

// orderId 접두사로 deposit/tip 테이블을 분기
function tableFor(orderId: string): 'deposits' | 'tips' | null {
  if (orderId.startsWith('deposit_')) return 'deposits'
  if (orderId.startsWith('tip_')) return 'tips'
  return null
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { paymentKey, orderId, amount } = await req.json()
  const table = tableFor(orderId)
  if (!paymentKey || !orderId || typeof amount !== 'number' || !table) {
    return NextResponse.json({ error: 'invalid confirm payload' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error: readErr } = await supabase
    .from(table).select('*').eq('order_id', orderId).single()
  if (readErr || !row) {
    return NextResponse.json({ error: 'order not found' }, { status: 404 })
  }

  // 호출자-주문 바인딩: 주문을 시작한 본인만 confirm 가능(주문 상태 프로빙 차단).
  if (row.payer_user_id !== user.id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // 멱등: 이미 결제 완료면 그대로 성공 반환
  if (row.status === 'paid') {
    return NextResponse.json({ status: 'paid', idempotent: true })
  }

  // 위변조 차단: 서버 저장 금액 ↔ 클라이언트 금액 ↔ 요청 금액
  try {
    assertAmountMatches(row.amount, amount)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  let payment
  try {
    payment = await confirmPayment(
      { paymentKey, orderId, amount },
      { secretKey: process.env.TOSS_SECRET_KEY! },
    )
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
  }

  if (payment.status !== 'DONE') {
    return NextResponse.json({ error: `unexpected payment status: ${payment.status}` }, { status: 402 })
  }
  // 실제 청구 금액 교차검증. totalAmount 부재 시에도 통과시키지 않는다.
  if (typeof payment.totalAmount !== 'number') {
    return NextResponse.json({ error: 'toss response missing totalAmount' }, { status: 402 })
  }
  try {
    assertAmountMatches(row.amount, payment.totalAmount)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }

  const patch =
    table === 'deposits'
      ? { status: 'paid', payment_key: paymentKey, method: payment.method, paid_at: new Date().toISOString() }
      : { status: 'paid', payment_key: paymentKey, paid_at: new Date().toISOString() }

  const { data: updated, error: updErr } = await supabase
    .from(table)
    .update(patch)
    .eq('order_id', orderId)
    .eq('status', 'pending')
    .select()
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }
  if (!updated || updated.length === 0) {
    // 동시 confirm 요청이 먼저 처리됨 — 멱등 성공으로 반환
    return NextResponse.json({ status: 'paid', idempotent: true })
  }

  // TODO(충현): deposits인 경우 같은 match_id의 양 팀이 모두 paid면 matches.status='confirmed'로 전이.
  return NextResponse.json({ status: 'paid', method: payment.method })
}
