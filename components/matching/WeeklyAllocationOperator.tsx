'use client'

import { ClipboardCheck, Loader2, Play, Search, XCircle } from 'lucide-react'
import { FormEvent, useState } from 'react'

type Proposal = {
  proposal_id: string
  school_scope_key: string
  week_key: string
  window_id: string
  window_revision: number
  status: 'proposed' | 'in_review' | 'executing' | 'completed' | 'rejected' | 'stale' | 'failed'
  revision: number
  activity_id: string
  starts_at: string
  ends_at: string
  location_name: string | null
  room_count: number
  people_count: number
  error_code: string | null
}

export default function WeeklyAllocationOperator() {
  const [proposalId, setProposalId] = useState('')
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function load(event?: FormEvent) {
    event?.preventDefault()
    if (!proposalId.trim() || busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(
        `/api/admin/match/weekly-allocations?proposal_id=${encodeURIComponent(proposalId.trim())}`,
        { cache: 'no-store' },
      )
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isProposal(payload)) throw new Error('load_failed')
      setProposal(payload)
    } catch {
      setProposal(null)
      setNotice('제안을 불러오지 못했습니다. 제안 번호와 학교별 운영 권한을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function command(action: 'review' | 'reject' | 'execute') {
    if (!proposal || busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/match/weekly-allocations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          proposal_id: proposal.proposal_id,
          expected_revision: proposal.revision,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error('command_failed')
      setNotice(action === 'review'
        ? '검토 상태로 전환했습니다. 집계와 회차를 다시 확인한 뒤 실행하세요.'
        : action === 'reject'
          ? '제안을 거절했습니다. 어떤 배정도 생성되지 않았습니다.'
          : isFailureReceipt(payload)
            ? '배정은 원자적으로 취소됐습니다. 최신 모집 창과 신청 상태를 다시 확인해 주세요.'
            : '원자 배정을 완료했습니다. 모든 방이 함께 생성됐습니다.')
      await load()
    } catch {
      setNotice('명령을 처리하지 못했습니다. 최신 revision과 부여된 권한을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="px-5 pb-12">
      <div className="mx-auto max-w-3xl pt-7">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-boot-primary">Weekly allocation</p>
        <h1 className="mt-2 text-2xl font-black text-boot-ink">주간 배정 검토·실행</h1>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
          자동 생성된 제안은 검토와 실행을 분리합니다. 실행은 모든 방이 성공할 때만 한 번에 반영됩니다.
        </p>

        <form onSubmit={load} className="mt-6 flex gap-2 rounded-3xl border border-boot-hairline bg-white p-4">
          <label className="min-w-0 flex-1 text-xs font-black text-boot-muted">
            제안 번호
            <input value={proposalId} onChange={(event) => setProposalId(event.target.value)}
              placeholder="UUID" className="mt-2 min-h-12 w-full rounded-xl border border-boot-hairline px-3 text-sm text-boot-ink" />
          </label>
          <button type="submit" disabled={busy || !proposalId.trim()}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45">
            {busy ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />} 조회
          </button>
        </form>

        {proposal ? (
          <section className="mt-5 rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-black text-boot-ink">{proposal.activity_id}</h2>
              <span className="rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">
                {statusLabel(proposal.status)} · revision {proposal.revision}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Metric label="일정" value={formatDate(proposal.starts_at)} />
              <Metric label="장소" value={proposal.location_name ?? '미정'} />
              <Metric label="배정 제안" value={`${proposal.room_count}개 방 · ${proposal.people_count}명`} />
              <Metric label="학교 범위" value={proposal.school_scope_key} />
            </dl>
            {proposal.error_code ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">실패 코드 · {proposal.error_code}</p> : null}
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => void command('review')} disabled={busy || proposal.status !== 'proposed'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-boot-primary px-3 text-sm font-black text-white disabled:opacity-35">
                <ClipboardCheck size={17} /> 검토 시작
              </button>
              <button type="button" onClick={() => void command('reject')} disabled={busy || proposal.status !== 'proposed'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-rose-200 px-3 text-sm font-black text-rose-700 disabled:opacity-35">
                <XCircle size={17} /> 제안 거절
              </button>
              <button type="button" onClick={() => void command('execute')} disabled={busy || proposal.status !== 'in_review'}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#147A70] px-3 text-sm font-black text-white disabled:opacity-35">
                <Play size={17} /> 원자 배정 실행
              </button>
            </div>
          </section>
        ) : null}

        {notice ? <p role="status" className="mt-4 rounded-2xl bg-boot-soft p-4 text-sm font-bold text-boot-muted">{notice}</p> : null}
      </div>
    </main>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-boot-soft p-3"><dt className="text-xs font-black text-boot-muted">{label}</dt><dd className="mt-1 font-black text-boot-ink">{value}</dd></div>
}

function isProposal(value: unknown): value is Proposal {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<Proposal>
  return typeof row.proposal_id === 'string'
    && typeof row.school_scope_key === 'string'
    && typeof row.activity_id === 'string'
    && typeof row.starts_at === 'string'
    && Number.isInteger(row.room_count)
    && Number.isInteger(row.people_count)
    && Number.isInteger(row.revision)
    && ['proposed', 'in_review', 'executing', 'completed', 'rejected', 'stale', 'failed'].includes(row.status ?? '')
}

function isFailureReceipt(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && ['failed', 'stale'].includes(String((value as Record<string, unknown>).status ?? '')))
}

function statusLabel(status: Proposal['status']): string {
  return ({ proposed: '검토 전', in_review: '검토 중', executing: '실행 중', completed: '완료', rejected: '거절', stale: '재생성 필요', failed: '실패' })[status]
}

function formatDate(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : '잘못된 일정'
}
