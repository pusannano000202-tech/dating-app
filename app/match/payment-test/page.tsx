'use client'

import { useEffect, useRef, useState } from 'react'
import { loadTossPayments, ANONYMOUS } from '@tosspayments/tosspayments-sdk'

// 임시 검증 페이지. 충현 인수 후 실제 매칭 플로우에 연결되면 삭제.
type Widgets = Awaited<ReturnType<typeof loadTossPayments>> extends infer T
  ? T extends { widgets: (opts: { customerKey: string }) => infer W }
    ? W
    : never
  : never

export default function PaymentTestPage() {
  const [ready, setReady] = useState(false)
  const [order, setOrder] = useState<{ orderId: string; amount: number; orderName: string } | null>(null)
  const widgetsRef = useRef<Widgets | null>(null)
  // 검증용 더미 식별자 (stub matches/groups에 실제 행을 하나 만들어 두고 그 id 사용)
  const DUMMY = { match_id: '', group_id: '', payer_user_id: '' }

  useEffect(() => {
    if (!order) return
    ;(async () => {
      const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!)
      const widgets = toss.widgets({ customerKey: ANONYMOUS })
      widgetsRef.current = widgets
      await widgets.setAmount({ currency: 'KRW', value: order.amount })
      await widgets.renderPaymentMethods({ selector: '#payment-methods' })
      await widgets.renderAgreement({ selector: '#agreement' })
      setReady(true)
    })()
  }, [order])

  async function prepare() {
    const res = await fetch('/api/payments/deposit/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DUMMY),
    })
    setOrder(await res.json())
  }

  async function pay() {
    if (!widgetsRef.current || !order) return
    await widgetsRef.current.requestPayment({
      orderId: order.orderId,
      orderName: order.orderName,
      successUrl: `${window.location.origin}/match/payment-test/success`,
      failUrl: `${window.location.origin}/match/payment-test`,
    })
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>결제 연결 테스트</h1>
      <p>1) match/group/payer id를 채우고 prepare → 2) 결제하기(카카오페이/토스페이 선택)</p>
      <button onClick={prepare}>① prepare</button>
      <div id="payment-methods" />
      <div id="agreement" />
      {ready && <button onClick={pay}>② 결제하기</button>}
    </div>
  )
}
