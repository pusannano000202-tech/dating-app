'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, Loader2, ToggleLeft, ToggleRight } from 'lucide-react'

export default function AdminDashboardPage() {
  const [pendingCount, setPendingCount] = useState<number | null>(null)
  const [requiresApproval, setRequiresApproval] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [pendingRes, configRes] = await Promise.all([
        fetch('/api/admin/matches/pending'),
        fetch('/api/admin/config?key=match_requires_approval'),
      ])
      if (pendingRes.ok) {
        const d = await pendingRes.json() as { matches: unknown[] }
        setPendingCount(d.matches?.length ?? 0)
      }
      if (configRes.ok) {
        const d = await configRes.json() as { value: boolean | null }
        setRequiresApproval(d.value === true)
      }
    } catch {
      setError('대시보드를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  async function toggleApproval() {
    if (busy || requiresApproval === null) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'match_requires_approval', value: !requiresApproval }),
      })
      if (res.ok) setRequiresApproval((v) => !v)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-5 pb-10">
      <div className="max-w-3xl mx-auto pt-6">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-boot-primary">Admin Review</p>
        <h1 className="text-2xl font-black mb-1 text-boot-ink">운영자 대시보드</h1>
        <p className="text-xs text-boot-muted mb-6">매칭 품질 통제 · 외모 점수 보정</p>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-boot-muted">
            <Loader2 size={18} className="animate-spin" /> 불러오는 중
          </section>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Link href="/admin/matches/review" className="glass-card rounded-3xl p-5 border border-boot-hairline transition hover:-translate-y-0.5 hover:border-boot-primary/30">
              <ClipboardCheck size={24} className="text-boot-primary mb-3" />
              <p className="text-sm font-black text-boot-ink">매칭 리뷰 대기</p>
              <p className="mt-1 text-3xl font-black gradient-fate-text">{pendingCount ?? '–'}</p>
              <p className="mt-1 text-[11px] font-bold text-boot-muted">승인/거절하러 가기 →</p>
            </Link>

            <section className="glass-card rounded-3xl p-5 border border-boot-hairline">
              <p className="text-sm font-black mb-1 text-boot-ink">매칭 승인 게이트</p>
              <p className="text-[11px] text-boot-muted mb-4 leading-relaxed">
                켜면 모든 신규 매칭이 운영자 승인 전까지 사용자에게 노출되지 않아요.
              </p>
              <button
                type="button"
                onClick={toggleApproval}
                disabled={busy}
                className="flex items-center gap-2 text-sm font-bold disabled:opacity-40"
              >
                {requiresApproval ? (
                  <><ToggleRight size={28} className="text-emerald-600" /> 승인 필요 (ON)</>
                ) : (
                  <><ToggleLeft size={28} className="text-boot-muted" /> 자동 노출 (OFF)</>
                )}
              </button>
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
