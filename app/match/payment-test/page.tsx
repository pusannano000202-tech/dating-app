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
  const [error, setError] = useState<string>('')
  const widgetsRef = useRef<Widgets | null>(null)
  // stub matches/groups에 만든 실제 행의 id를 입력칸에 붙여넣어 검증한다.
  const [matchId, setMatchId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [payerId, setPayerId] = useState('')

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
    setError('')
    const res = await fetch('/api/payments/deposit/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ match_id: matchId, group_id: groupId, payer_user_id: payerId }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(`prepare 실패 (${res.status}): ${data.error ?? JSON.stringify(data)}`)
      return
    }
    setOrder(data)
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

  const inputStyle = { display: 'block', width: 360, margin: '4px 0', padding: 6 }
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>결제 연결 테스트</h1>
      <p>1) 아래 3개 id를 채우고 ① prepare → ② 결제하기(카카오페이/토스페이 선택)</p>
      <input style={inputStyle} placeholder="match_id (matches.id)" value={matchId} onChange={(e) => setMatchId(e.target.value)} />
      <input style={inputStyle} placeholder="group_id (groups.id)" value={groupId} onChange={(e) => setGroupId(e.target.value)} />
      <input style={inputStyle} placeholder="payer_user_id (아무 UUID)" value={payerId} onChange={(e) => setPayerId(e.target.value)} />
      <button type="button" onClick={() => setPayerId(crypto.randomUUID())}>payer_user_id 랜덤 생성</button>
      <hr style={{ margin: '16px 0' }} />
      <button onClick={prepare}>① prepare</button>
      {error && <pre style={{ color: 'crimson' }}>{error}</pre>}
      {order && <p>주문 생성됨: {order.orderId} / {order.amount}원</p>}
      <div id="payment-methods" />
      <div id="agreement" />
      {ready && <button onClick={pay}>② 결제하기</button>}
    </div>
  )
}
