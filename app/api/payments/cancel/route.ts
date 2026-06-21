import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isInternalCaller } from '@/lib/payments/auth'
import { cancelPayment, TossError } from '@/lib/payments/toss'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  // 환불은 서버-내부 트리거(만남 인증 성공 등) 전용. 사용자가 직접 부를 수 없다
  // (선환불 후 노쇼 악용 차단). 호출 측은 PAYMENT_INTERNAL_SECRET을 제시한다.
  // TODO(충현): 충현의 만남 인증/노쇼 판정 서버 로직에서 이 시크릿으로 호출하도록 연결.
  if (!isInternalCaller(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { orderId, reason } = await req.json()
  if (!orderId || !orderId.startsWith('deposit_')) {
    return NextResponse.json({ error: 'valid deposit orderId required' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { data: row, error: readErr } = await supabase
    .from('deposits').select('*').eq('order_id', orderId).single()
  if (readErr || !row) {
    return NextResponse.json({ error: 'deposit not found' }, { status: 404 })
  }
  // 멱등: 이미 환불됐으면 성공으로 반환(재시도 안전).
  if (row.status === 'refunded') {
    return NextResponse.json({ status: 'refunded', idempotent: true })
  }
  if (row.status !== 'paid') {
    return NextResponse.json({ error: `cannot refund deposit in status ${row.status}` }, { status: 409 })
  }
  if (!row.payment_key) {
    return NextResponse.json({ error: 'no payment_key on deposit' }, { status: 409 })
  }

  try {
    await cancelPayment(
      { paymentKey: row.payment_key, cancelReason: reason ?? '과팅 성사 환불' },
      { secretKey: process.env.TOSS_SECRET_KEY! },
    )
  } catch (e) {
    // 이미 토스에서 취소된 결제(직전 시도에서 DB update만 실패한 경우 등) → 멱등 진행.
    const code = e instanceof TossError ? e.code : undefined
    const alreadyCanceled = code === 'ALREADY_CANCELED_PAYMENT'
    if (!alreadyCanceled) {
      return NextResponse.json({ error: (e as Error).message }, { status: 402 })
    }
  }

  const { error: updErr } = await supabase
    .from('deposits')
    .update({ status: 'refunded', canceled_at: new Date().toISOString() })
    .eq('order_id', orderId)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // TODO(충현): 노쇼 케이스는 cancel 호출 없이 deposits.status='forfeited'로 두고 패널티 insert.
  return NextResponse.json({ status: 'refunded' })
}
