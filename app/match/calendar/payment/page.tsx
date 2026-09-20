'use client'
import Link from 'next/link'
import {Suspense,useEffect,useRef,useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {createClient} from '@/lib/supabase'
import {calendarEventMonth,calendarOrderId,calendarRecord,calendarTimestamp,calendarUuid,type CalendarAudience} from '@/lib/payments/calendar-contract'
import {calendarRecoveryPath,requestCalendarRefund} from '@/lib/payments/calendar-browser'

function PaymentReturn() {
  const params = useSearchParams()
  const [attempt] = useState(() => {
    const audience = params.get('audience'),eventId = params.get('event'),orderId = params.get('order')
    if (!['single','couple'].includes(audience ?? '') || !calendarUuid(eventId) || !calendarOrderId(orderId)
      || [...params.keys()].some(k => params.getAll(k).length !== 1)
      || params.has('orderId') && params.get('orderId') !== orderId) return null
    const success = params.get('checkout') === 'success'
    return {audience:audience as CalendarAudience,eventId,orderId,paymentKey:success ? params.get('paymentKey') : null,amount:success ? Number(params.get('amount')) : null}
  })
  const [message,setMessage] = useState('보증금과 신청 상태를 확인하고 있어요.'),[busy,setBusy] = useState(true),[retry,setRetry] = useState(0)
  const [refundDue,setRefundDue] = useState(false)
  const [returnMonth,setReturnMonth] = useState(() => /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '') ? params.get('month') : null)
  const expectedOwner = useRef<string|null>(null)
  useEffect(() => {
    window.history.replaceState(window.history.state,'',attempt ? calendarRecoveryPath({...attempt,month:returnMonth}) : '/match/calendar/payment')
    if (!attempt) {setBusy(false);setMessage('결제 복귀 정보를 확인하지 못했어요. 신청한 날짜에서 상태를 확인해 주세요.');return}
    const controller = new AbortController(),client = createClient()
    const subscription = client.auth.onAuthStateChange((_event,session) => {
      if (expectedOwner.current && session?.user.id !== expectedOwner.current) {controller.abort();setBusy(false);setMessage('결제한 계정으로 다시 로그인해 주세요.')}
    }).data.subscription
    setBusy(true)
    void (async () => {
      try {
        const {data:{user},error} = await client.auth.getUser()
        if (error || !user || expectedOwner.current && expectedOwner.current !== user.id) throw new Error('account_changed')
        expectedOwner.current = user.id
        const response = await fetch('/api/payments/calendar/confirm',{method:'POST',credentials:'same-origin',signal:controller.signal,
          headers:{'Content-Type':'application/json','X-Quantum-Owner':user.id},body:JSON.stringify(attempt)})
        const value = calendarRecord(await response.json()),order = calendarRecord(value?.order),application = calendarRecord(value?.application)
        if (!response.ok || value?.accountKey !== user.id || order?.orderId !== attempt.orderId || order?.eventId !== attempt.eventId
          || order?.audience !== attempt.audience || !calendarTimestamp(order?.eventStartsAt)) throw new Error(String(value?.error ?? 'calendar_unavailable'))
        if (!controller.signal.aborted) {
          setReturnMonth(calendarEventMonth(order.eventStartsAt))
          setRefundDue(order?.depositState === 'refund_due')
          setMessage(order?.depositState === 'refunded' ? '이 주문의 보증금이 원래 결제수단으로 반환됐어요.'
            : order?.depositState === 'refund_due' ? '이 주문은 반환 대상이에요. 원래 결제수단으로 보증금 반환을 요청할 수 있어요.'
            : application?.applicationFinalized === true ? '보증금 납부와 날짜 신청이 완료됐어요.' : '내 보증금 납부가 확인됐어요. 파트너의 납부가 끝나면 커플 신청이 완료돼요.')
        }
      } catch {
        if (!controller.signal.aborted) setMessage('결제 결과를 아직 확인하지 못했어요. 새로 결제하지 말고 같은 주문을 다시 확인해 주세요.')
      } finally {if (!controller.signal.aborted) setBusy(false)}
    })()
    return () => {controller.abort();subscription.unsubscribe()}
  // The return month only selects a visible calendar page; payment authority is the
  // server-bound order. Do not re-run a confirmation merely to update that link.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[attempt,retry])
  const refund = async () => {
    if (!attempt || !expectedOwner.current || busy) return
    setBusy(true)
    try {
      const ownerId = expectedOwner.current
      const {data:{user},error} = await createClient().auth.getUser()
      if (error || user?.id !== ownerId) throw new Error('account_changed')
      await requestCalendarRefund({...attempt,ownerId})
      setRefundDue(false);setMessage('이 주문의 보증금이 원래 결제수단으로 반환됐어요.')
    } catch {setMessage('반환 결과를 아직 확인하지 못했어요. 같은 원주문으로 다시 확인하거나 반환을 재시도해 주세요.')}
    finally {setBusy(false)}
  }
  return <main className="mx-auto max-w-md px-5 pb-28 pt-12"><h1 className="text-2xl font-bold">보증금 확인</h1>
    <p className="mt-5 leading-7" role="status">{message}</p>
    {!busy && refundDue && <button type="button" onClick={() => void refund()} className="mt-6 min-h-12 w-full rounded-xl bg-boot-primary p-3 font-semibold text-white">이 주문의 10,000원 반환 요청</button>}
    {!busy && attempt && <button type="button" onClick={() => setRetry(v => v+1)} className="mt-6 min-h-12 w-full rounded-xl bg-boot-primary p-3 font-semibold text-white">같은 주문 다시 확인</button>}
    <Link className="mt-5 flex min-h-12 items-center justify-center text-boot-primary" href={attempt ? `/match/calendar?${new URLSearchParams({audience:attempt.audience,event:attempt.eventId,step:'participation',...(returnMonth ? {month:returnMonth} : {})})}` : '/match'}>신청한 날짜로 돌아가기</Link>
  </main>
}
export default function Page() {return <Suspense fallback={<p className="p-8">결제 결과를 확인하고 있어요.</p>}><PaymentReturn/></Suspense>}
