'use client'

import { CreditCard, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  chooseContinuationFeeProvider,
  type ContinuationFeePurpose,
  type ContinuationFeeProvider,
} from '@/lib/payments/continuation-fee'
import { requestTossPaymentWindow, type TossBrowserPaymentRequest } from '@/lib/payments/toss-browser'

type Props = {
  transitionId: string
  purpose: ContinuationFeePurpose
  targetUserId?: string | null
  returnPath: string
  disabled?: boolean
  onComplete?: () => void | Promise<void>
}

type Availability = {
  tossSandbox: boolean
  localSimulator: boolean
}

type PrepareResponse = {
  order?: { order_id?: string }
  checkout?: TossBrowserPaymentRequest | null
  error?: string
}

type ConfirmResponse = {
  result?: { recovery_required?: boolean; status?: string; no_charge?: boolean }
}

export default function ContinuationFeeCheckout({
  transitionId,
  purpose,
  targetUserId = null,
  returnPath,
  disabled = false,
  onComplete,
}: Props) {
  const [availability, setAvailability] = useState<Availability | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const choice = useMemo(() => availability
    ? chooseContinuationFeeProvider(availability)
    : null, [availability])

  useEffect(() => {
    let alive = true
    void fetch('/api/payments/continuation/availability', { cache: 'no-store' })
      .then(async (response) => {
        const value = await response.json().catch(() => null) as Record<string, unknown> | null
        if (!response.ok || !value) throw new Error('availability_failed')
        if (alive) setAvailability({
          tossSandbox: value.toss_sandbox_available === true,
          localSimulator: value.local_simulator_available === true,
        })
      })
      .catch(() => { if (alive) setAvailability({ tossSandbox: false, localSimulator: false }) })
    if (typeof window !== 'undefined') {
      const payment = new URLSearchParams(window.location.search).get('continuation_payment')
      if (payment === 'paid') setNotice('결제 검증이 완료됐어요.')
      else if (payment === 'recovery_required') setNotice('결제 결과를 확인 중이에요. 중복 결제하지 말고 잠시 기다려 주세요.')
      else if (payment === 'cancelled') setNotice('결제를 취소했어요. 실제 청구 여부는 서버가 다시 확인합니다.')
      else if (payment === 'failed') setNotice('결제를 완료하지 못했어요. 주문 상태를 다시 확인해 주세요.')
    }
    return () => { alive = false }
  }, [])

  async function startCheckout(provider: ContinuationFeeProvider) {
    if (busy) return
    setBusy(true)
    setNotice('')
    let preparedOrderId: string | null = null
    try {
      const prepared = await fetch('/api/payments/continuation/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transition_id: transitionId,
          purpose,
          target_user_id: targetUserId,
          provider,
          idempotency_key: crypto.randomUUID(),
          return_path: returnPath,
        }),
      })
      const payload = await prepared.json().catch(() => null) as PrepareResponse | null
      preparedOrderId = payload?.order?.order_id ?? null
      if (purpose === 'friend_request' && prepared.status === 409 && payload?.error === 'not_ready') {
        setNotice('지금은 이 친구 요청 이용권을 새로 만들 수 없어요. 상태를 새로 확인했어요.')
        await onComplete?.()
        return
      }
      if (!prepared.ok || !preparedOrderId) throw new Error('prepare_failed')
      if (provider === 'local_verified_simulator') {
        const confirmed = await fetch('/api/payments/continuation/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: preparedOrderId, idempotency_key: crypto.randomUUID() }),
        })
        const confirmedPayload = await confirmed.json().catch(() => null) as ConfirmResponse | null
        if (!confirmed.ok) throw new Error('confirm_failed')
        if (confirmedPayload?.result?.recovery_required === true) {
          setNotice('친구 요청 상태가 바뀌어 새 이용권을 처리하지 않았어요. 실제 청구는 발생하지 않았습니다.')
          await onComplete?.()
          return
        }
        if (purpose === 'friend_request' && (
          confirmedPayload?.result?.status === 'cancelled'
          || confirmedPayload?.result?.no_charge === true
        )) {
          setNotice('친구 요청 상태가 바뀌어 새 이용권을 처리하지 않았어요. 실제 청구는 발생하지 않았습니다.')
          await onComplete?.()
          return
        }
        setNotice('로컬 검증이 완료됐어요. 실제 청구는 발생하지 않았습니다.')
        await onComplete?.()
        return
      }
      if (!payload?.checkout) throw new Error('checkout_missing')
      await requestTossPaymentWindow(payload.checkout)
    } catch {
      if (preparedOrderId) {
        await cancelPreparedOrder(preparedOrderId)
      }
      setNotice('결제를 시작하지 못했어요. 준비된 주문은 취소하고 서버가 청구 여부를 확인합니다.')
    } finally {
      setBusy(false)
    }
  }

  const title = purpose === 'friend_request' ? '친구 요청 이용권' : '다음 회차 이용료'
  if (availability === null) {
    return <div className="flex min-h-14 items-center justify-center rounded-2xl bg-boot-soft text-boot-muted"><Loader2 className="animate-spin" size={18} /><span className="ml-2 text-xs font-black">결제 가능 여부 확인 중</span></div>
  }
  if (!choice?.available) {
    return <div className="rounded-2xl border border-boot-hairline bg-boot-soft p-4"><p className="text-sm font-black text-boot-ink">{title} · 1,000원</p><p className="mt-1 text-xs font-bold leading-5 text-boot-muted">현재 사용할 수 있는 결제 수단이 없어요. 결제 설정이 준비된 뒤 다시 시도해 주세요.</p></div>
  }
  return <div className="rounded-2xl border border-boot-primary/15 bg-boot-soft p-4"><div className="flex gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-boot-primary" size={19} /><div><p className="text-sm font-black text-boot-ink">{title} · 1,000원</p><p className="mt-1 text-xs font-bold leading-5 text-boot-muted">{choice.localOnly ? '로컬 검증 시뮬레이터 · 실제 청구 없음' : '토스 테스트 결제창에서 승인한 뒤 서버가 결제 결과를 직접 검증합니다.'}</p></div></div><button type="button" disabled={disabled || busy} onClick={() => void startCheckout(choice.provider)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45">{busy ? <Loader2 className="animate-spin" size={17} /> : <CreditCard size={17} />}{choice.localOnly ? '로컬 검증 완료하기' : '토스 테스트 결제하기'}</button>{notice ? <p role="status" className="mt-3 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}</div>
}

async function cancelPreparedOrder(orderId: string) {
  try {
    await fetch('/api/payments/continuation/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: orderId, idempotency_key: crypto.randomUUID() }),
    })
  } catch {
    // Expiry and the leased recovery worker remain the fail-closed fallback.
  }
}
