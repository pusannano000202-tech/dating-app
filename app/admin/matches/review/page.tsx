'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Loader2, Check, X } from 'lucide-react'

interface PendingMatch {
  match_id: string
  group_a_id: string
  group_b_id: string
  group_a_gender: 'male' | 'female'
  group_b_gender: 'male' | 'female'
  group_a_size: number
  group_b_size: number
  score: number | null
  score_breakdown: Record<string, number> | null
  is_forced: boolean
  matched_at: string | null
}

export default function MatchReviewQueuePage() {
  const [matches, setMatches] = useState<PendingMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/matches/pending')
      if (!res.ok) { setError('목록을 불러오지 못했어요.'); return }
      const d = await res.json() as { matches: PendingMatch[] }
      setMatches(d.matches ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function review(matchId: string, decision: 'approve' | 'reject') {
    if (busyId) return
    if (decision === 'reject' && !confirm('이 매칭을 거절할까요? 두 그룹은 매칭 풀로 복귀합니다.')) return
    setBusyId(matchId)
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(matchId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (res.ok) {
        setMatches((prev) => prev.filter((m) => m.match_id !== matchId))
      } else {
        setError('처리에 실패했어요.')
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <main className="px-5 pb-10">
      <div className="max-w-3xl mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/admin" className="p-2 glass rounded-xl"><ChevronLeft size={18} /></Link>
          <div>
            <h1 className="text-xl font-black">매칭 리뷰 대기</h1>
            <p className="text-xs text-boot-muted mt-0.5">근거를 보고 승인/거절하세요</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : matches.length === 0 ? (
          <section className="glass rounded-3xl p-6 text-center text-sm text-boot-muted">
            대기 중인 매칭이 없어요.
          </section>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <section key={m.match_id} className="glass-card rounded-3xl p-5 border border-boot-hairline">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">
                      {m.group_a_size}명({m.group_a_gender === 'male' ? '남' : '여'}) ↔ {m.group_b_size}명({m.group_b_gender === 'male' ? '남' : '여'})
                      {m.is_forced && <span className="ml-2 text-[10px] text-amber-700">강제</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-boot-muted">
                      점수 {m.score != null ? (m.score * 100).toFixed(0) : '–'} · {m.matched_at ? new Date(m.matched_at).toLocaleString('ko-KR') : ''}
                    </p>
                  </div>
                  <Link href={`/admin/matches/${encodeURIComponent(m.match_id)}`} className="p-2 glass rounded-xl">
                    <ChevronRight size={16} />
                  </Link>
                </div>

                {m.score_breakdown && (
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-boot-muted">
                    {breakdownRows(m.score_breakdown).map(([label, val]) => (
                      <div key={label} className="rounded-lg bg-white/90 px-2 py-1.5">
                        <span className="text-boot-muted">{label}</span>{' '}
                        <span className="text-boot-body font-medium">{val}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => review(m.match_id, 'approve')}
                    disabled={busyId === m.match_id}
                    className="btn-gradient py-2.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <Check size={16} /> 승인
                  </button>
                  <button
                    type="button"
                    onClick={() => review(m.match_id, 'reject')}
                    disabled={busyId === m.match_id}
                    className="py-2.5 rounded-2xl text-sm font-bold border border-boot-hairline text-boot-body hover:border-red-400/40 hover:text-red-200 flex items-center justify-center gap-1.5 disabled:opacity-40"
                  >
                    <X size={16} /> 거절
                  </button>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

const BREAKDOWN_LABELS: Record<string, string> = {
  appearance: '외모',
  personality: '성격',
  time: '시간',
  scoreBand: '점수대',
  weightAlignment: '가중치',
  ageFit: '나이',
  asymmetryPenalty: '비대칭',
}

function breakdownRows(b: Record<string, number>): [string, string][] {
  return Object.entries(BREAKDOWN_LABELS)
    .filter(([key]) => b[key] != null)
    .map(([key, label]) => [label, b[key].toFixed(2)])
}
