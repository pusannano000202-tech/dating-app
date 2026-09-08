'use client'

import { Loader2, RefreshCw, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type SeriesOption = {
  series_id: string
  source_kind: string
  activity_kind: string
  status: string
  revision: number
  latest_program_day: number | null
  latest_occurrence_status: string | null
  active_transition: boolean
}

type Candidate = { user_id: string; display_name: string }
type Proposal = { proposal_id: string; candidate_label: string; target_program_day: number; status: string; expires_at: string; revision: number }

export default function ContinuationJoinOperator() {
  const [series, setSeries] = useState<SeriesOption[]>([])
  const [selected, setSelected] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [candidateId, setCandidateId] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async (seriesId?: string) => {
    setBusy(true)
    try {
      const query = seriesId ? `?series_id=${encodeURIComponent(seriesId)}` : ''
      const response = await fetch(`/api/admin/super-admin/match/continuation-joins${query}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isOptions(payload)) throw new Error('load_failed')
      if (!seriesId) setSeries(payload.series)
      else {
        setSeries((current) => current.map((item) => payload.series.find((fresh) => fresh.series_id === item.series_id) ?? item))
        setCandidates(payload.candidates)
        setProposals(payload.proposals)
      }
    } catch {
      setNotice('합류 운영 정보를 불러오지 못했습니다. 최근 관리자 인증을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function chooseSeries(value: string) {
    setSelected(value)
    setCandidateId('')
    setCandidates([])
    if (value) await load(value)
  }

  async function propose() {
    const current = series.find((item) => item.series_id === selected)
    if (!current || !candidateId || busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/super-admin/match/continuation-joins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          series_id: current.series_id,
          action: 'propose',
          candidate_user_id: candidateId,
          expected_series_revision: current.revision,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      if (!response.ok) throw new Error('propose_failed')
      setNotice('24시간 합류 동의를 열었습니다. 기존 실제 참석자와 신규 참가자 전원이 동의해야 적용됩니다.')
      setCandidateId('')
      await load(current.series_id)
    } catch {
      setNotice('제안하지 못했습니다. 실제 출석 확정, 인원·성별 구성, 활성 전환, 최신 revision을 확인해 주세요.')
      await load(current.series_id)
    } finally {
      setBusy(false)
    }
  }

  async function cancel(proposal: Proposal) {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/super-admin/match/continuation-joins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel', proposal_id: proposal.proposal_id,
          expected_revision: proposal.revision, idempotency_key: crypto.randomUUID(),
        }),
      })
      if (!response.ok) throw new Error('cancel_failed')
      setNotice('합류 제안을 취소했습니다. 기존 명단과 다음 회차 상태는 바뀌지 않았습니다.')
      await load(selected)
    } catch {
      setNotice('제안 상태가 바뀌어 취소하지 못했습니다. 최신 상태를 확인해 주세요.')
      await load(selected)
    } finally {
      setBusy(false)
    }
  }

  const current = series.find((item) => item.series_id === selected)
  return <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17211f]"><div className="mx-auto max-w-3xl space-y-6"><header className="rounded-3xl bg-[#13211f] px-6 py-7 text-white"><p className="text-[11px] font-black tracking-[0.18em] text-[#F3B95F]">EXPLICIT CONSENT</p><h1 className="mt-2 text-2xl font-black">계속 만나기 합류 운영</h1><p className="mt-2 text-sm font-bold leading-6 text-white/70">실제 출석이 확정된 다음 회차에만 제안하며, 모든 당사자의 개별 동의 전에는 명단이 바뀌지 않습니다.</p></header><section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"><label><span className="mb-2 block text-xs font-black text-[#52615d]">진행 중인 시리즈</span><select value={selected} onChange={(event) => void chooseSeries(event.target.value)} className={inputClass}><option value="">시리즈 선택</option>{series.map((item) => <option key={item.series_id} value={item.series_id}>{item.activity_kind} · Day {item.latest_program_day ?? '-'} · rev {item.revision}</option>)}</select></label>{current ? <div className="mt-4 rounded-2xl bg-[#f3eee2] p-4 text-xs font-bold leading-5 text-[#52615d]"><p>최근 회차: Day {current.latest_program_day ?? '-'} · {current.latest_occurrence_status ?? '없음'}</p><p>활성 선택 단계: {current.active_transition ? '있음 — 합류 제안 불가' : '없음'}</p></div> : null}<label className="mt-4 block"><span className="mb-2 block text-xs font-black text-[#52615d]">매칭 준비가 완료된 신규 참가자</span><select value={candidateId} disabled={!selected || busy} onChange={(event) => setCandidateId(event.target.value)} className={inputClass}><option value="">참가자 선택</option>{candidates.map((candidate) => <option key={candidate.user_id} value={candidate.user_id}>{candidate.display_name} · {candidate.user_id.slice(0, 8)}</option>)}</select></label><button type="button" disabled={!current || !candidateId || current.active_transition || busy} onClick={() => void propose()} className="mt-5 min-h-12 w-full rounded-2xl bg-[#147A70] px-4 text-sm font-black text-white disabled:opacity-45">{busy ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : <UserPlus className="mr-2 inline" size={16} />}전원 동의 요청 열기</button><button type="button" disabled={busy} onClick={() => void load(selected || undefined)} className="mt-2 min-h-11 w-full rounded-2xl border border-black/10 text-xs font-black"><RefreshCw className="mr-1 inline" size={14} />최신 상태 확인</button>{notice ? <p role="status" className="mt-4 text-xs font-bold leading-5 text-[#52615d]">{notice}</p> : null}</section>{proposals.length ? <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"><h2 className="font-black">열린 합류 제안</h2><div className="mt-3 space-y-2">{proposals.map((proposal) => <article key={proposal.proposal_id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#f3eee2] p-4"><div><p className="text-sm font-black">{proposal.candidate_label} · Day {proposal.target_program_day}</p><p className="mt-1 text-xs font-bold text-[#52615d]">{proposal.status} · rev {proposal.revision}</p></div><button type="button" disabled={busy} onClick={() => void cancel(proposal)} className="min-h-10 shrink-0 rounded-xl border border-black/10 bg-white px-3 text-xs font-black">제안 취소</button></article>)}</div></section> : null}</div></main>
}

const inputClass = 'min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 text-sm font-bold outline-none focus:border-[#147A70] disabled:bg-black/5'

function isOptions(value: unknown): value is { series: SeriesOption[]; candidates: Candidate[]; proposals: Proposal[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as { series?: unknown; candidates?: unknown; proposals?: unknown }
  return Array.isArray(row.series) && Array.isArray(row.candidates) && Array.isArray(row.proposals)
}
