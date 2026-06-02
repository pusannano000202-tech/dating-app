'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Check, X } from 'lucide-react'

interface Member {
  user_id: string
  display_name: string | null
  age: number | null
  gender: string | null
  school: string | null
  department: string | null
  appearance_type: string | null
  effective_score: number | null
  score_source: string | null
  primary_photo_url: string | null
}

interface Review {
  match_id: string
  status: string
  approval_status: string
  is_forced: boolean
  score: number | null
  score_breakdown: Record<string, number> | null
  matched_at: string | null
  reviewed_at: string | null
  review_reason: string | null
  group_a_members: Member[]
  group_b_members: Member[]
}

export default function AdminMatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [review, setReview] = useState<Review | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(id)}`)
      if (!res.ok) { setError('불러오지 못했어요.'); return }
      const d = await res.json() as { review: Review | null }
      setReview(d.review)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { refresh() }, [refresh])

  async function decide(decision: 'approve' | 'reject') {
    if (busy) return
    const addExcluded = decision === 'reject'
      ? confirm('이 두 그룹을 앞으로도 매칭 금지(excluded_pairs)할까요?')
      : false
    if (decision === 'reject' && !confirm('거절하면 두 그룹은 풀로 복귀합니다. 진행할까요?')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/matches/${encodeURIComponent(id)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, add_excluded: addExcluded }),
      })
      if (res.ok) router.push('/admin/matches/review')
      else setError('처리에 실패했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-5 pb-10">
      <div className="max-w-3xl mx-auto pt-6">
        <header className="mb-6 flex items-center gap-3">
          <Link href="/admin/matches/review" className="p-2 glass rounded-xl"><ChevronLeft size={18} /></Link>
          <h1 className="text-xl font-black">매칭 상세 · 근거</h1>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : review ? (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold">
                  종합 점수 <span className="gradient-fate-text text-lg">{review.score != null ? (review.score * 100).toFixed(0) : '–'}</span>
                  {review.is_forced && <span className="ml-2 text-[10px] text-amber-300">강제매칭</span>}
                </p>
                <span className="text-[11px] text-gray-500">{review.approval_status}</span>
              </div>
              {review.score_breakdown && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                  {Object.entries(review.score_breakdown).map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-white/[0.04] px-2 py-1.5">
                      <span className="text-gray-500">{k}</span>{' '}
                      <span className="text-gray-200 font-medium">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <GroupBlock title="그룹 A" members={review.group_a_members} />
            <GroupBlock title="그룹 B" members={review.group_b_members} />

            {review.approval_status === 'pending_review' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => decide('approve')} disabled={busy}
                  className="btn-gradient py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <Check size={16} /> 승인
                </button>
                <button type="button" onClick={() => decide('reject')} disabled={busy}
                  className="py-3 rounded-2xl text-sm font-bold border border-white/15 text-gray-300 hover:border-red-400/40 hover:text-red-200 flex items-center justify-center gap-1.5 disabled:opacity-40">
                  <X size={16} /> 거절
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>
    </main>
  )
}

function GroupBlock({ title, members }: { title: string; members: Member[] }) {
  return (
    <section className="glass-card rounded-3xl p-5 mb-4 border border-white/[0.06]">
      <p className="text-xs font-bold text-gray-400 mb-3">{title} · {members?.length ?? 0}명</p>
      <div className="space-y-3">
        {(members ?? []).map((m) => (
          <Link
            key={m.user_id}
            href={`/admin/users/${encodeURIComponent(m.user_id)}`}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-3 hover:bg-white/[0.06]"
          >
            <div className="h-12 w-12 rounded-xl overflow-hidden bg-white/[0.06] shrink-0">
              {m.primary_photo_url
                ? /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={m.primary_photo_url} alt="" className="h-full w-full object-cover" />
                : <div className="h-full w-full flex items-center justify-center text-gray-600 text-xs">無</div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">
                {m.display_name ?? '이름없음'} · {m.age ?? '?'}세
              </p>
              <p className="text-[11px] text-gray-500 truncate">{m.school ?? ''} {m.department ?? ''}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black">{m.effective_score != null ? Math.round(m.effective_score) : '–'}</p>
              <p className="text-[10px] text-gray-600">{m.score_source ?? ''}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
