import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { cancelPayment } from '@/lib/payments/toss'

export const runtime = 'nodejs'

export async function POST(req: Request) {
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
    return NextResponse.json({ error: (e as Error).message }, { status: 402 })
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
