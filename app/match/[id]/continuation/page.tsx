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
      if (choice === 'end') {
        // 환불 선택 흐름으로 진입
        router.push(`/match/${encodeURIComponent(matchId)}/refund`)
      }
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
            <p className="text-xs text-gray-500 mt-0.5">양쪽 모두 ‘이어간다’ 선택 시 보증금 전액 자동 환불</p>
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
                <p className="text-lg font-black gradient-fate-text">양쪽 모두 이어가기로 했어요</p>
                <p className="mt-2 text-xs text-gray-500">
                  보증금 전액 자동 환불 + 핸드폰은 약속 시간 이후 자동 공개돼요.
                </p>
                <Link
                  href={`/match/${encodeURIComponent(matchId)}`}
                  className="btn-gradient w-full block py-3 rounded-2xl text-sm font-bold mt-5"
                >
                  매칭 상세로 돌아가기
                </Link>
              </section>
            )}

            {state.my_choice === null && !state.both_continue && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                  오늘 만남 어땠어요?<br />
                  계속 이어갈 의사가 있다면 양쪽 모두 ‘이어갈래요’를 선택해주세요.
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
                    <p className="text-[10px] text-gray-500 mt-1">평가 + 환불 선택</p>
                  </button>
                </div>

                <p className="mt-4 text-[11px] text-gray-600 text-center leading-relaxed">
                  7일 안에 선택 안 하면 자동으로 ‘충분’ 처리돼요.
                </p>
              </section>
            )}

            {state.my_choice && !state.both_continue && (
              <section className="glass-card rounded-3xl p-5 mb-4">
                <p className="text-sm font-bold mb-2">
                  내 선택: {state.my_choice === 'continue' ? '이어갈래요 💜' : '한 번이면 충분'}
                </p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  현재 양쪽 그룹 응답 — {state.continue_count}/{state.total_participants} 이어가기,
                  {' '}{state.end_count} 종료.
                </p>
                {state.any_end && state.my_choice === 'end' && (
                  <Link
                    href={`/match/${encodeURIComponent(matchId)}/refund`}
                    className="btn-gradient w-full block mt-4 py-3 rounded-2xl text-sm font-bold"
                  >
                    보증금 환불 선택하러 가기
                  </Link>
                )}
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
