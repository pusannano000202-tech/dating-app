'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, HeartCrack, Loader2 } from 'lucide-react'
import { DEPOSIT_AMOUNT } from '@/lib/constants'

type Stage = 'select' | 'beg_3000' | 'beg_2000' | 'beg_1000' | 'too_much' | 'zero_reasons' | 'done'

const ZERO_REASON_OPTIONS = [
  { key: 'no_show',                label: '상대가 안 나옴' },
  { key: 'profile_mismatch',       label: '프로필이 거짓말' },
  { key: 'rude_behavior',          label: '태도가 무례함' },
  { key: 'matching_quality',       label: '매칭 자체가 별로' },
  { key: 'venue_problem',          label: '장소가 안 좋음' },
  { key: 'other',                  label: '기타' },
] as const

export default function RefundPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const matchId = params.id
  const total = DEPOSIT_AMOUNT
  const [refund, setRefund] = useState<number>(total)
  const [stage, setStage] = useState<Stage>('select')
  const [zeroReasons, setZeroReasons] = useState<string[]>([])
  const [zeroComment, setZeroComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ refund: number; appRevenue: number } | null>(null)

  async function submit(finalRefund: number) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refund_amount: finalRefund,
          zero_refund_reasons: finalRefund === 0 ? zeroReasons : null,
          zero_refund_comment: finalRefund === 0 ? zeroComment : null,
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
    if (refund === total) {
      setStage('beg_3000')
    } else if (refund === 0) {
      setStage('zero_reasons')
    } else {
      submit(refund)
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="max-w-md mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href={`/match/${encodeURIComponent(matchId)}`} className="p-2 glass rounded-xl">
            <ChevronLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-black">보증금 환불</h1>
            <p className="text-xs text-gray-500 mt-0.5">얼마를 돌려받으시겠어요?</p>
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

            <label className="text-xs text-gray-500 mb-2 block">돌려받을 금액</label>
            <input
              type="range"
              min={0}
              max={total}
              step={1000}
              value={refund}
              onChange={(e) => setRefund(parseInt(e.target.value, 10))}
              className="w-full accent-violet-500"
            />
            <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
              <span>0원</span>
              <span className="text-2xl font-black text-white">{refund.toLocaleString()} 원</span>
              <span>{total.toLocaleString()}원</span>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[0, Math.floor(total / 2), total].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRefund(v)}
                  className={`py-2 rounded-xl text-xs font-bold border ${
                    refund === v ? 'border-violet-400/50 bg-violet-500/10 text-violet-200' : 'border-white/10 text-gray-400'
                  }`}
                >
                  {v === 0 ? '0원' : v === total ? '전액' : `${v.toLocaleString()}원`}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleSelectClick}
              disabled={busy}
              className="btn-gradient w-full mt-6 py-3 rounded-2xl text-sm font-bold disabled:opacity-40"
            >
              결정했어요
            </button>

            <p className="mt-3 text-[11px] text-gray-600 text-center leading-relaxed">
              0원 선택 시 사유를 묻고, 상대방에게 ‘0원 지불’ 알림이 갑니다.
            </p>
          </section>
        )}

        {/* 구걸 단계: 3000 → 2000 → 1000 → 너무해 */}
        {stage === 'beg_3000' && (
          <BegCard
            line="잠깐만요!! 3,000원만 주시면 안될깡요?? 🥺"
            sub="저희 서버비도 빠듯해요..."
            acceptLabel="그럼 3,000원만 드릴게요"
            rejectLabel="아니, 다 가져갈래요"
            onAccept={() => submit(total - 3000)}
            onReject={() => setStage('beg_2000')}
            busy={busy}
          />
        )}
        {stage === 'beg_2000' && (
          <BegCard
            line="2,000원만!! 진짜요!!"
            sub="진짜로 2,000원만 떼주시면 행복할 거 같아요"
            acceptLabel="좋아요 2,000원"
            rejectLabel="아니!!"
            onAccept={() => submit(total - 2000)}
            onReject={() => setStage('beg_1000')}
            busy={busy}
          />
        )}
        {stage === 'beg_1000' && (
          <BegCard
            line="1,000원만!!!! 1,000원만!!! 😭"
            sub="커피 한 잔 값도 못 받으면 너무하잖아요"
            acceptLabel="1,000원만 드림"
            rejectLabel="진짜 다 가져감"
            onAccept={() => submit(total - 1000)}
            onReject={() => setStage('too_much')}
            busy={busy}
          />
        )}
        {stage === 'too_much' && (
          <section className="glass-card rounded-3xl p-6 text-center">
            <HeartCrack size={48} className="mx-auto mb-3 text-rose-400" />
            <p className="text-lg font-black text-rose-200">너무해!!! 너무해 진짜!!!</p>
            <p className="mt-2 text-xs text-gray-500">
              ...그래도 약속은 약속이니까요. 전액 돌려드릴게요.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setStage('beg_3000')}
                className="flex-1 py-3 rounded-2xl text-sm border border-white/15 text-gray-300"
              >
                다시 생각해볼게요
              </button>
              <button
                type="button"
                onClick={() => submit(total)}
                disabled={busy}
                className="flex-1 py-3 rounded-2xl text-sm bg-rose-500/20 border border-rose-400/30 text-rose-100 font-bold disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin inline" /> : '전액 받기'}
              </button>
            </div>
          </section>
        )}

        {stage === 'zero_reasons' && (
          <section className="glass-card rounded-3xl p-5">
            <p className="text-sm font-bold text-rose-200 mb-1">0원이라니… 어떤 점이 마음에 안 드셨나요?</p>
            <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
              사유를 선택하시면 운영자가 검토합니다. 상대방에게 ‘0원 지불’ 알림이 전송돼요.
            </p>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {ZERO_REASON_OPTIONS.map((opt) => {
                const on = zeroReasons.includes(opt.key)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setZeroReasons((prev) => on ? prev.filter((k) => k !== opt.key) : [...prev, opt.key])}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border text-left ${
                      on ? 'border-rose-400/50 bg-rose-500/10 text-rose-200' : 'border-white/10 text-gray-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <textarea
              value={zeroComment}
              onChange={(e) => setZeroComment(e.target.value)}
              placeholder="자유 코멘트 (선택)"
              rows={3}
              className="w-full glass rounded-2xl px-4 py-3 text-sm placeholder:text-gray-600"
            />

            <div className="mt-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-[11px] text-amber-200 leading-relaxed">
              ⚠️ 상대방에게 “{ /* placeholder */ }님이 데이팅앱에 0원 지불하셨어요” 알림이 갑니다.
              그래도 진행하시겠어요?
            </div>

            <div className="flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setStage('select')}
                className="flex-1 py-3 rounded-2xl text-sm border border-white/15 text-gray-300"
              >
                다시 선택
              </button>
              <button
                type="button"
                onClick={() => submit(0)}
                disabled={busy || zeroReasons.length === 0}
                className="flex-1 py-3 rounded-2xl text-sm bg-rose-500/20 border border-rose-400/30 text-rose-100 font-bold disabled:opacity-40"
              >
                {busy ? <Loader2 size={14} className="animate-spin inline" /> : '0원 확정'}
              </button>
            </div>
          </section>
        )}

        {stage === 'done' && result && (
          <section className="glass-card rounded-3xl p-6 text-center">
            <p className="text-sm text-gray-500 mb-2">환불 처리 완료</p>
            <p className="text-3xl font-black gradient-fate-text mb-1">{result.refund.toLocaleString()} 원</p>
            <p className="text-[11px] text-gray-500 mb-5">
              { result.appRevenue > 0 ? `${result.appRevenue.toLocaleString()}원은 저희에게... 감사합니다 🙏` : '전액 환불 처리됐어요.' }
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

function BegCard({
  line, sub, acceptLabel, rejectLabel, onAccept, onReject, busy,
}: {
  line: string; sub: string; acceptLabel: string; rejectLabel: string
  onAccept: () => void; onReject: () => void; busy: boolean
}) {
  return (
    <section className="glass-card rounded-3xl p-6 text-center">
      <p className="text-lg font-black text-violet-200 leading-snug">{line}</p>
      <p className="mt-2 text-xs text-gray-500">{sub}</p>
      <div className="flex gap-2 mt-5">
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
    </section>
  )
}

function translateError(code?: string): string {
  switch (code) {
    case 'match_not_completed':           return '완료된 매칭이 아니에요.'
    case 'no_show_cannot_refund':         return '노쇼 처리되어 환불할 수 없어요.'
    case 'deposit_not_found_or_already_refunded': return '이미 환불 처리됐거나 보증금이 없어요.'
    case 'refund_exceeds_deposit':        return '보증금보다 많이 받을 수는 없어요.'
    case 'invalid_refund_amount':         return '잘못된 금액이에요.'
    default:                                return '처리에 실패했어요.'
  }
}
