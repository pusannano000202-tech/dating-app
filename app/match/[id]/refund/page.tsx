'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Check,
  ChevronLeft,
  Loader2,
  RotateCcw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react'
import { DEPOSIT_AMOUNT } from '@/lib/constants'

type Stage = 'choose' | 'carryover_done' | 'refund_done'

interface CarryoverRow {
  status: 'available' | 'applied' | 'cancelled'
  target_match_id: string | null
}

export default function RefundPage() {
  const params = useParams<{ id: string }>()
  const matchId = params.id
  const [stage, setStage] = useState<Stage>('choose')
  const [busy, setBusy] = useState<'carryover' | 'refund' | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const amountLabel = `${DEPOSIT_AMOUNT.toLocaleString()}원`

  const loadCurrentChoice = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/matches/${encodeURIComponent(matchId)}/deposit-carryover`,
        { cache: 'no-store' },
      )
      if (!response.ok) return
      const data = await response.json() as { carryover: CarryoverRow | null }
      if (data.carryover?.status === 'available' || data.carryover?.status === 'applied') {
        setStage('carryover_done')
      }
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => {
    void loadCurrentChoice()
  }, [loadCurrentChoice])

  async function chooseCarryover() {
    if (busy) return
    setBusy('carryover')
    setError(null)
    try {
      const response = await fetch(
        `/api/matches/${encodeURIComponent(matchId)}/deposit-carryover`,
        { method: 'POST' },
      )
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setError(translateError(data.error))
        return
      }
      setStage('carryover_done')
    } catch {
      setError('연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  async function requestFullRefund() {
    if (busy) return
    setBusy('refund')
    setError(null)
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refund_amount: DEPOSIT_AMOUNT,
          zero_refund_reasons: null,
          zero_refund_comment: null,
        }),
      })
      const data = await response.json().catch(() => ({})) as {
        error?: string
        result?: { requested_refund_amount?: number }
      }
      if (!response.ok) {
        setError(translateError(data.error))
        return
      }
      if (data.result?.requested_refund_amount !== DEPOSIT_AMOUNT) {
        setError('환불 금액 확인이 필요해요. 자동으로 다시 처리하지 않습니다.')
        return
      }
      setStage('refund_done')
    } catch {
      setError('연결이 불안정해요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <main className="min-h-screen booting-paper px-4 pb-28 text-boot-ink md:pb-10">
      <div className="mx-auto w-full max-w-md pt-5">
        <header className="mb-5 flex items-center gap-3">
          <Link
            href={`/match/${encodeURIComponent(matchId)}`}
            aria-label="매칭 상세로 돌아가기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-boot-hairline bg-white"
          >
            <ChevronLeft size={19} />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-black text-boot-primary">만남 완료</p>
            <h1 className="text-xl font-black">보증금은 어떻게 할까요?</h1>
          </div>
        </header>

        <section className="mb-4 rounded-lg border border-boot-hairline bg-white px-4 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <ShieldCheck size={21} />
            </div>
            <div>
              <p className="font-black">보증금 {amountLabel}은 그대로 보장돼요</p>
              <p className="mt-1 text-sm leading-relaxed text-boot-muted">
                다음 매칭에 이어 쓰거나 전액 돌려받을 수 있어요. 앱 후원금은 보증금에서 차감하지 않아요.
              </p>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" />
            보증금 상태 확인 중
          </div>
        ) : stage === 'choose' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={chooseCarryover}
              disabled={busy !== null}
              className="flex w-full items-center gap-4 rounded-lg border-2 border-boot-primary bg-white px-4 py-5 text-left shadow-sm disabled:opacity-50"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-boot-primary/10 text-boot-primary">
                {busy === 'carryover' ? <Loader2 size={24} className="animate-spin" /> : <RotateCcw size={24} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black">다음 매칭에 그대로 사용</span>
                <span className="mt-1 block text-sm leading-relaxed text-boot-muted">
                  다시 결제하지 않고 {amountLabel}이 다음 약속에 자동으로 이어져요.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={requestFullRefund}
              disabled={busy !== null}
              className="flex w-full items-center gap-4 rounded-lg border border-boot-hairline bg-white px-4 py-5 text-left shadow-sm disabled:opacity-50"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                {busy === 'refund' ? <Loader2 size={24} className="animate-spin" /> : <WalletCards size={24} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-black">{amountLabel} 전액 환불</span>
                <span className="mt-1 block text-sm leading-relaxed text-boot-muted">
                  결제했던 수단으로 전액 환불을 요청해요.
                </span>
              </span>
            </button>
          </div>
        ) : (
          <section className="rounded-lg border border-boot-hairline bg-white px-5 py-7 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Check size={28} strokeWidth={3} />
            </span>
            <h2 className="mt-4 text-xl font-black">
              {stage === 'carryover_done' ? '다음 매칭 보증금으로 보관했어요' : '전액 환불을 접수했어요'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-boot-muted">
              {stage === 'carryover_done'
                ? `다음 매칭 결제 단계에서 ${amountLabel}이 자동 적용돼요.`
                : '결제사 처리 결과는 알림에서 확인할 수 있어요.'}
            </p>
            {stage === 'carryover_done' && (
              <button
                type="button"
                onClick={requestFullRefund}
                disabled={busy !== null}
                className="mt-5 w-full rounded-lg border border-boot-hairline bg-white py-3 text-sm font-bold text-boot-body disabled:opacity-50"
              >
                {busy === 'refund' ? '환불 요청 중...' : '아직 사용 전이라면 전액 환불하기'}
              </button>
            )}
            <Link
              href="/match"
              className="mt-3 block w-full rounded-lg bg-boot-primary py-3 text-sm font-black text-white"
            >
              매칭 홈으로
            </Link>
          </section>
        )}

        <p className="mt-5 text-center text-xs leading-relaxed text-boot-muted">
          14일 동안 선택하지 않으면 전액 환불 요청이 자동으로 접수됩니다.
        </p>
      </div>
    </main>
  )
}

function translateError(code?: string) {
  switch (code) {
    case 'match_not_completed':
      return '만남이 완료된 뒤 선택할 수 있어요.'
    case 'not_match_participant':
      return '본인이 참여한 만남의 보증금만 처리할 수 있어요.'
    case 'no_show_cannot_carryover':
    case 'no_show_cannot_refund':
      return '노쇼 처리된 보증금은 이월하거나 환불할 수 없어요.'
    case 'refund_already_requested':
      return '이미 환불 요청이 접수됐어요.'
    case 'deposit_not_available_for_carryover':
    case 'deposit_not_found_or_already_refunded':
      return '처리할 수 있는 보증금을 찾지 못했어요.'
    case 'refund_settlement_pending':
      return '환불 요청은 저장됐고 결제사 처리를 기다리고 있어요.'
    case 'carryover_cancel_failed':
      return '이월 상태를 확인하지 못해 환불을 멈췄어요. 다시 시도해 주세요.'
    default:
      return '보증금 처리에 실패했어요. 잠시 뒤 다시 시도해 주세요.'
  }
}
