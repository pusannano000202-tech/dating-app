'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Heart, HeartCrack, Loader2 } from 'lucide-react'

interface State {
  my_choice: 'continue' | 'end' | null
  total_participants: number
  continue_count: number
  end_count: number
  both_continue: boolean
  any_end: boolean
}

export default function ContinuationPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const matchId = params.id
  const [state, setState] = useState<State | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/continuation`)
      if (!res.ok) {
        setError('상태를 불러오지 못했어요.')
        return
      }
      const data = await res.json() as { state: State | null }
      setState(data.state)
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => { refresh() }, [refresh])

  async function submit(choice: 'continue' | 'end') {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/continuation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
      // 관계 선택은 보증금 처리와 분리한다. 응답 후 각 사용자가 /refund에서
      // 전액 환불 또는 다음 매칭 이월을 직접 선택한다.
    } finally {
      setBusy(false)
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
            <h1 className="text-xl font-black">이 만남, 이어갈까요?</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              다시 만날지 선택한 뒤, 보증금은 각자 환불 또는 다음 매칭 이월을 정해요.
            </p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            상태 불러오는 중
          </section>
        ) : state ? (
          <>
            {state.both_continue && (
              <section className="glass-card rounded-3xl p-6 text-center mb-4">
                <Heart size={40} className="mx-auto mb-3 text-rose-400" />
                <p className="text-lg font-black gradient-fate-text">양쪽 모두 이어가기로 했어요 💜</p>
                <p className="mt-3 text-sm text-gray-300 leading-relaxed">
                  서로 더 만나보고 싶은 상태예요.<br />
                  보증금은 다음 매칭에 이어 쓰거나 전액 환불받을 수 있어요.
                </p>
                <p className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                  서로 계속 만나기로 한 경우에만 정산을 요청합니다.
                </p>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/refund`}
                  className="btn-gradient w-full block py-3 rounded-2xl text-sm font-bold mt-5"
                >
                  보증금 선택하기
                </Link>
              </section>
            )}

            {/* 관계 선택과 보증금 선택은 서로 독립적이다. */}
            {state.any_end && !state.both_continue && (
              <section className="glass-card rounded-3xl p-5 mb-4 border border-emerald-400/15 bg-emerald-500/[0.04]">
                <HeartCrack size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-bold text-center text-gray-200">
                  이 만남은 여기서 마무리됐어요
                </p>
                <p className="mt-2 text-xs text-gray-500 text-center leading-relaxed">
                  보증금은 각자 전액 환불받거나 다음 매칭에 이어 쓸 수 있어요.<br />
                  14일 동안 고르지 않으면 전액 환불 요청이 자동 접수됩니다.
                </p>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/refund`}
                  className="btn-gradient block w-full py-3 rounded-2xl text-sm font-bold text-center mt-4"
                >
                  보증금 선택하기
                </Link>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}/review`}
                  className="block w-full py-3 rounded-2xl text-sm border border-white/15 text-gray-300 hover:border-white/30 text-center mt-2"
                >
                  만남 평가 작성 (선택)
                </Link>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}`}
                  className="block w-full py-3 rounded-2xl text-sm text-center mt-2 text-gray-500"
                >
                  매칭 상세로 돌아가기
                </Link>
              </section>
            )}

            {state.my_choice === null && !state.both_continue && !state.any_end && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <p className="text-sm text-gray-300 mb-2 leading-relaxed">
                  오늘 만남 어땠어요?
                </p>
                <p className="text-[11px] text-gray-500 mb-4 leading-relaxed">
                  • 양쪽 모두 ‘이어갈래요’ → 이어가기 상태만 기록<br />
                  • 한 명이라도 ‘충분’ → 관계 선택 종료, 보증금은 각자 선택
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => submit('continue')}
                    disabled={busy}
                    className="glass-card rounded-2xl p-4 border border-rose-400/20 hover:border-rose-400/50 disabled:opacity-40"
                  >
                    <Heart size={28} className="mx-auto mb-2 text-rose-400" />
                    <p className="text-sm font-bold">이어갈래요</p>
                    <p className="text-[10px] text-gray-500 mt-1">또 만나고 싶음</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => submit('end')}
                    disabled={busy}
                    className="glass-card rounded-2xl p-4 border border-white/10 hover:border-white/20 disabled:opacity-40"
                  >
                    <HeartCrack size={28} className="mx-auto mb-2 text-gray-400" />
                    <p className="text-sm font-bold">한 번이면 충분</p>
                    <p className="text-[10px] text-gray-500 mt-1">환불 요청 후 종료</p>
                  </button>
                </div>

                <p className="mt-4 text-[11px] text-gray-600 text-center leading-relaxed">
                  7일 안에 선택 안 하면 자동으로 ‘충분’ 처리돼요.
                </p>
              </section>
            )}

            {/* 본인은 continue 선택했지만 아직 상대 응답 대기 */}
            {state.my_choice === 'continue' && !state.both_continue && !state.any_end && (
              <section className="glass-card rounded-3xl p-5 mb-4 border border-amber-400/20 bg-amber-500/[0.04]">
                <p className="text-sm font-bold mb-1 text-amber-200">
                  💜 이어갈래요 선택 완료
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  상대 응답 대기 중 — {state.continue_count}/{state.total_participants} 이어가기.
                </p>
                <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
                  양쪽 모두 이어가기를 선택하면 환불/정산 화면이 열려요.<br />
                  한 명이라도 ‘충분’을 누르면 관계 선택만 종료되고, 보증금은 각자 선택합니다.
                </p>
              </section>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}

function translateError(code?: string): string {
  switch (code) {
    case 'match_not_completed':     return '완료된 매칭이 아니에요.'
    case 'no_show_cannot_choose':   return '노쇼 처리된 사용자는 선택할 수 없어요.'
    case 'not_match_participant':   return '본인이 참여한 매칭만 선택할 수 있어요.'
    case 'invalid_choice':          return '잘못된 선택이에요.'
    default:                          return '처리에 실패했어요.'
  }
}
