'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Loader2, Send, Star } from 'lucide-react'

type IssueKey = 'no_show' | 'profile_mismatch' | 'inappropriate_behavior' | 'good_match'

const ISSUE_LABELS: Record<IssueKey, string> = {
  good_match: '실제 만남이 좋았어요',
  no_show: '상대가 노쇼했어요',
  profile_mismatch: '프로필과 실제가 달랐어요',
  inappropriate_behavior: '부적절한 행동이 있었어요',
}

interface ExistingReview {
  review_id: string
  match_id: string
  overall_score: number
  reported_issues: string[]
  comment: string | null
  created_at: string
}

export default function MatchReviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const matchId = params.id

  const [score, setScore] = useState(0)
  const [issues, setIssues] = useState<Set<IssueKey>>(new Set())
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existing, setExisting] = useState<ExistingReview | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/review`)
      if (res.ok) {
        const data = await res.json() as { reviews: ExistingReview[] }
        if (data.reviews.length > 0) {
          setExisting(data.reviews[0])
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [matchId])

  useEffect(() => { refresh() }, [refresh])

  const canSubmit = useMemo(() => score >= 1 && score <= 5 && !submitting && !existing, [score, submitting, existing])

  function toggleIssue(key: IssueKey) {
    setIssues(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function submit() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          overall_score: score,
          reported_issues: Array.from(issues),
          comment: comment.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      router.push(`/match/${encodeURIComponent(matchId)}`)
    } catch {
      setError('제출에 실패했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  function translateError(code?: string) {
    switch (code) {
      case 'invalid_overall_score':   return '별점은 1~5 사이로 골라주세요.'
      case 'match_not_completed':     return '아직 완료된 매칭이 아니에요.'
      case 'not_match_participant':   return '본인이 참여한 매칭만 평가할 수 있어요.'
      case 'match_not_found':         return '매칭을 찾을 수 없어요.'
      default:                         return code?.startsWith('invalid_reported_issue') ? '잘못된 이슈 항목이에요.' : '제출에 실패했어요. 잠시 후 다시 시도해주세요.'
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
            <h1 className="text-xl font-black">매칭 평가</h1>
            <p className="text-xs text-gray-500 mt-0.5">상대 그룹에 대한 만남 후 평가</p>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" /> 평가 정보를 불러오는 중
          </section>
        ) : existing ? (
          <section className="glass-card rounded-3xl p-5">
            <p className="text-xs text-emerald-300 font-bold mb-2">이미 평가 제출 완료</p>
            <div className="flex items-center gap-1 mb-3">
              {[1,2,3,4,5].map(n => (
                <Star key={n} size={20} className={n <= existing.overall_score ? 'fill-amber-300 text-amber-300' : 'text-gray-700'} />
              ))}
            </div>
            {existing.reported_issues.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {existing.reported_issues.map(k => (
                  <span key={k} className="px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-400/20 text-[11px] text-violet-200">
                    {ISSUE_LABELS[k as IssueKey] ?? k}
                  </span>
                ))}
              </div>
            )}
            {existing.comment && (
              <p className="text-sm text-gray-300 leading-relaxed">{existing.comment}</p>
            )}
            <p className="mt-3 text-[11px] text-gray-600">제출 시각: {new Date(existing.created_at).toLocaleString('ko-KR')}</p>
          </section>
        ) : (
          <>
            <section className="glass-card rounded-3xl p-5 mb-4">
              <p className="text-sm font-bold mb-3">전체 만족도</p>
              <div className="flex items-center gap-2 mb-1">
                {[1,2,3,4,5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setScore(n)}
                    className="p-1.5 rounded-xl hover:bg-amber-500/10"
                  >
                    <Star size={26} className={n <= score ? 'fill-amber-300 text-amber-300' : 'text-gray-700'} />
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-gray-500">1점 매우 불만족 ~ 5점 매우 만족</p>
            </section>

            <section className="glass-card rounded-3xl p-5 mb-4">
              <p className="text-sm font-bold mb-3">상황 (복수 선택 가능)</p>
              <div className="flex flex-col gap-2">
                {(Object.keys(ISSUE_LABELS) as IssueKey[]).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleIssue(k)}
                    className={`text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      issues.has(k)
                        ? 'border-violet-300/40 bg-violet-500/10 text-violet-100'
                        : 'border-white/10 text-gray-300 hover:border-white/20'
                    }`}
                  >
                    {ISSUE_LABELS[k]}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-card rounded-3xl p-5 mb-4">
              <p className="text-sm font-bold mb-3">코멘트 (선택)</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                maxLength={500}
                placeholder="상대 그룹에 대해 남기고 싶은 말이 있으면 자유롭게."
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-violet-300/40"
              />
              <p className="mt-1 text-right text-[11px] text-gray-600">{comment.length} / 500</p>
            </section>

            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="btn-gradient w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
            >
              <Send size={15} />
              평가 제출
            </button>
            <p className="mt-2 text-center text-[11px] text-gray-600">
              제출 후엔 수정할 수 없어요.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
