'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { DEPOSIT_AMOUNT, FREE_BETA_ENABLED } from '@/lib/constants'
import {
  appFeeToRefundAmount,
  getAppFeeFlowDecision,
  MIN_PRIVATE_APP_FEE,
} from '@/lib/refund/fee-flow'
import { createClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/utils'
import SanjiCharacter, { type SanjiMood } from '@/components/SanjiCharacter'

type Stage = 'select' | 'beg_3000' | 'confirm_low_fee' | 'confirm_zero' | 'notify_zero' | 'done'
type UserGender = 'male' | 'female' | null

export default function RefundPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const matchId = params.id
  const total = DEPOSIT_AMOUNT
  const [appFee, setAppFee] = useState<number>(MIN_PRIVATE_APP_FEE)
  const [pendingAppFee, setPendingAppFee] = useState<number>(MIN_PRIVATE_APP_FEE)
  const [stage, setStage] = useState<Stage>('select')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userGender, setUserGender] = useState<UserGender>(null)
  const [result, setResult] = useState<{ refund: number; appRevenue: number } | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('gender')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.gender === 'male' || data?.gender === 'female') {
            setUserGender(data.gender)
          }
        })
    }).catch(() => undefined)
  }, [])

  if (FREE_BETA_ENABLED) {
    return (
      <main className="min-h-screen px-5 pb-10">
        <div className="max-w-md mx-auto pt-6">
          <header className="mb-6 flex items-center gap-3">
            <Link href={`/match/${encodeURIComponent(matchId)}`} className="p-2 glass rounded-xl">
              <ChevronLeft size={18} />
            </Link>
            <div>
              <h1 className="text-xl font-black">무료 베타 진행 중</h1>
              <p className="text-xs text-gray-500 mt-0.5">지금은 매칭비 정산을 받지 않아요</p>
            </div>
          </header>

          <section className="glass-card rounded-3xl p-6 text-center">
            <p className="text-lg font-black gradient-fate-text">정산할 금액이 없어요</p>
            <p className="mt-3 text-sm leading-relaxed text-gray-500">
              사용자 확보를 우선하기 위해 무료 베타 기간에는 보증금, 환불, 앱 매칭비 선택을 모두 비활성화합니다.
            </p>
            <Link
              href={`/match/${encodeURIComponent(matchId)}`}
              className="btn-gradient mt-5 block w-full rounded-2xl py-3 text-sm font-bold"
            >
              매칭 상세로 돌아가기
            </Link>
          </section>
        </div>
      </main>
    )
  }

  async function submit(finalAppFee: number) {
    if (busy) return
    setBusy(true)
    setError(null)
    const normalizedAppFee = Math.max(0, Math.min(total, Math.floor(finalAppFee)))
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_fee_amount: normalizedAppFee,
          zero_refund_reasons: null,
          zero_refund_comment: null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      const data = await res.json() as { result: { requested_refund_amount: number; app_revenue: number } }
      setResult({ refund: data.result.requested_refund_amount, appRevenue: data.result.app_revenue })
      setStage('done')
    } catch {
      setError('처리에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  function handleSelectClick() {
    const decision = getAppFeeFlowDecision(appFee)
    setPendingAppFee(decision.normalizedAppFee)
    if (decision.kind === 'submit') {
      submit(decision.normalizedAppFee)
      return
    }
    setStage('beg_3000')
  }

  function handleBegReject() {
    if (pendingAppFee === 0) {
      setStage('confirm_zero')
    } else {
      setStage('confirm_low_fee')
    }
  }

  const refundAmount = appFeeToRefundAmount(appFee, total)

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href={`/match/${encodeURIComponent(matchId)}`} className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-black">매칭비 정산</h1>
            <p className="text-xs text-gray-500 mt-0.5">보증금 중 앱에게 줄 금액을 선택해주세요</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {stage === 'select' && (
          <section className="glass-card rounded-3xl p-5">
            <p className="text-xs text-gray-500 mb-2">보증금 총액</p>
            <p className="text-3xl font-black text-violet-200 mb-6">{total.toLocaleString()} 원</p>

            <label className="text-xs text-gray-500 mb-2 block">앱에게 줄 매칭비</label>
            <input
              type="range"
              min={0}
              max={total}
              step={1000}
              value={appFee}
              onChange={(e) => setAppFee(parseInt(e.target.value, 10))}
              className="w-full accent-violet-500"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>0원</span>
              <span className="text-2xl font-black text-white">{appFee.toLocaleString()} 원</span>
              <span>{total.toLocaleString()}원</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, 1000, 2000, 3000, 5000, 10000].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAppFee(value)}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    appFee === value
                      ? 'border-violet-400/50 bg-violet-500/10 text-violet-200'
                      : 'border-white/10 text-gray-400'
                  }`}
                >
                  {value.toLocaleString()}원
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">환불 받을 금액</span>
                <span className="font-black text-white">{refundAmount.toLocaleString()}원</span>
              </div>
              <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                {MIN_PRIVATE_APP_FEE.toLocaleString()}원 이상이면 조용히 정산돼요. 0원을 선택하면 최종 확인 후 상대방에게 0원 지불 알림이 갑니다.
              </p>
            </div>

            <button
              type="button"
              onClick={handleSelectClick}
              disabled={busy}
              className="btn-gradient w-full mt-6 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
            >
              결정했어요
            </button>
          </section>
        )}

        {stage === 'beg_3000' && (
          <SanjiCard
            mood="pleading"
            speech="잠깐만요!! 3,000원만 주면 안돼요?! 🥺"
            sub="여기부터는 상대에게 매칭비 금액 알림 없이 조용히 정산돼요."
            acceptLabel="3,000원 줄게요"
            rejectLabel={pendingAppFee === 0 ? '그래도 0원' : `${pendingAppFee.toLocaleString()}원만 줄래요`}
            onAccept={() => submit(MIN_PRIVATE_APP_FEE)}
            onReject={handleBegReject}
            busy={busy}
          />
        )}

        {stage === 'confirm_low_fee' && (
          <ConfirmCard
            title={`${pendingAppFee.toLocaleString()}원으로 진행할까요?`}
            body={`3,000원부터는 상대방에게 매칭비로 얼마를 지불했는지 알림이 안 갑니다. 그래도 ${pendingAppFee.toLocaleString()}원으로 정산할까요?`}
            primaryLabel={`${pendingAppFee.toLocaleString()}원으로 정산`}
            secondaryLabel="3,000원 줄게요"
            onPrimary={() => submit(pendingAppFee)}
            onSecondary={() => submit(MIN_PRIVATE_APP_FEE)}
            busy={busy}
          />
        )}

        {stage === 'confirm_zero' && (
          <ConfirmCard
            title="그래도 0원 주겠습니까?"
            body="0원을 선택하면 상대방이 서운할 수 있어요. 아래처럼 보일 수 있다는 걸 먼저 확인해주세요."
            primaryLabel="그래도 0원"
            secondaryLabel="3,000원 줄게요"
            onPrimary={() => setStage('notify_zero')}
            onSecondary={() => submit(MIN_PRIVATE_APP_FEE)}
            busy={busy}
          >
            <ReactionComic userGender={userGender} />
          </ConfirmCard>
        )}

        {stage === 'notify_zero' && (
          <ConfirmCard
            title="0원 알림이 상대방에게 갑니다"
            body="상대방에게 매칭비로 0원을 지불했다는 사실이 알림으로 갑니다. 그래도 0원을 지불하겠습니까?"
            primaryLabel="0원으로 확정"
            secondaryLabel="3,000원 줄게요"
            danger
            onPrimary={() => submit(0)}
            onSecondary={() => submit(MIN_PRIVATE_APP_FEE)}
            busy={busy}
          >
            <ReactionComic userGender={userGender} />
          </ConfirmCard>
        )}

        {stage === 'done' && result && (
          <section className="glass-card rounded-3xl p-6 text-center">
            <p className="text-sm text-gray-400 mb-1">정산 완료</p>
            <p className="text-3xl font-black gradient-fate-text mb-1">
              {result.refund.toLocaleString()} 원 환불
            </p>
            <p className="text-[11px] text-violet-300 mb-5">
              앱 매칭비 {result.appRevenue.toLocaleString()}원
            </p>
            <Link
              href={`/match/${encodeURIComponent(matchId)}`}
              className="btn-gradient w-full block py-3 rounded-2xl text-sm font-bold"
            >
              매칭 상세로
            </Link>
            <button
              type="button"
              onClick={() => router.push('/notifications')}
              className="w-full mt-2 py-3 rounded-2xl text-sm border border-white/10 text-gray-300"
            >
              알림 확인
            </button>
          </section>
        )}
      </div>
    </main>
  )
}

function SanjiCard({
  mood,
  speech,
  sub,
  acceptLabel,
  rejectLabel,
  onAccept,
  onReject,
  busy,
}: {
  mood: SanjiMood
  speech: string
  sub: string
  acceptLabel: string
  rejectLabel: string
  onAccept: () => void
  onReject: () => void
  busy: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative mx-auto w-full max-w-[300px] z-10">
        <div className="glass-card rounded-3xl px-5 py-4 text-center shadow-lg">
          <p className="text-base font-black text-violet-100 leading-snug">{speech}</p>
          <p className="mt-2 text-xs text-gray-400 leading-relaxed">{sub}</p>
        </div>
        <div className="flex justify-center mt-[-1px]">
          <svg width="28" height="14" viewBox="0 0 28 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <polygon
              points="0,0 28,0 14,14"
              fill="rgba(255,255,255,0.055)"
              stroke="rgba(255,255,255,0.09)"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      <div className="mt-[-8px]">
        <SanjiCharacter mood={mood} />
      </div>

      <div className="flex gap-2 mt-3 w-full max-w-[320px]">
        <button
          type="button"
          onClick={onReject}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl text-sm border border-white/15 text-gray-300 disabled:opacity-40"
        >
          {rejectLabel}
        </button>
        <button
          type="button"
          onClick={onAccept}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl text-sm bg-violet-500/20 border border-violet-400/30 text-violet-100 font-bold disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin inline" /> : acceptLabel}
        </button>
      </div>
    </div>
  )
}

function ConfirmCard({
  title,
  body,
  primaryLabel,
  secondaryLabel,
  danger,
  onPrimary,
  onSecondary,
  busy,
  children,
}: {
  title: string
  body: string
  primaryLabel: string
  secondaryLabel: string
  danger?: boolean
  onPrimary: () => void
  onSecondary: () => void
  busy: boolean
  children?: React.ReactNode
}) {
  return (
    <section className="glass-card rounded-3xl p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-2 text-sm text-gray-400 leading-relaxed">{body}</p>
      {children}
      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={onSecondary}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl text-sm border border-white/15 text-gray-300 disabled:opacity-40"
        >
          {secondaryLabel}
        </button>
        <button
          type="button"
          onClick={onPrimary}
          disabled={busy}
          className={`flex-1 py-3 rounded-2xl text-sm font-bold disabled:opacity-40 ${
            danger
              ? 'bg-rose-500/20 border border-rose-400/30 text-rose-100'
              : 'bg-violet-500/20 border border-violet-400/30 text-violet-100'
          }`}
        >
          {busy ? <Loader2 size={14} className="animate-spin inline" /> : primaryLabel}
        </button>
      </div>
    </section>
  )
}

function ReactionComic({ userGender }: { userGender: UserGender }) {
  const counterpart = userGender === 'female' ? '남자' : userGender === 'male' ? '여자' : '상대'
  const face = userGender === 'female' ? '😤' : userGender === 'male' ? '😒' : '😶'
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="rounded-2xl bg-white text-slate-950 px-4 py-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-4xl">
            {face}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-black text-slate-500">상대방 반응 미리보기</p>
            <p className="mt-1 text-sm font-black">{counterpart}가 살짝 삐진 장면</p>
            <p className="mt-1 text-xs text-slate-500">아... 매칭비 0원...?</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function translateError(code?: string): string {
  switch (code) {
    case 'match_not_completed':                    return '완료된 매칭이 아니에요.'
    case 'no_show_cannot_refund':                  return '노쇼 처리되어 환불할 수 없어요.'
    case 'deposit_not_found_or_already_refunded':  return '이미 환불 처리됐거나 보증금이 없어요.'
    case 'refund_exceeds_deposit':                 return '보증금보다 많이 받을 수는 없어요.'
    case 'invalid_refund_amount':                  return '잘못된 금액이에요.'
    case 'both_continue_required':                 return '양쪽 모두 이어가기를 선택한 뒤에만 매칭비를 정산할 수 있어요.'
    case 'already_auto_refunded':                  return '한 명이라도 종료를 선택해 이미 전액 환불 처리됐어요.'
    default:                                       return '처리에 실패했어요.'
  }
}
