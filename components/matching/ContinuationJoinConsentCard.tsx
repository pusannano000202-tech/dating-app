'use client'

import { Loader2, ShieldCheck, UserPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

type JoinProposal = {
  proposal_id: string
  series_id: string
  target_program_day: number
  status: 'awaiting_consents' | 'accepted' | 'applied' | 'rejected' | 'review_required'
  fee_scope: 'first_join_occurrence_waived'
  expires_at: string
  revision: number
  is_candidate: boolean
  own_decision: 'accept' | 'reject' | null
  candidate_label: string
}

export default function ContinuationJoinConsentCard({ seriesId }: { seriesId?: string }) {
  const [proposals, setProposals] = useState<JoinProposal[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/match/series/join-proposals', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isProposalList(payload)) throw new Error('load_failed')
      setProposals(seriesId ? payload.proposals.filter((proposal) => proposal.series_id === seriesId) : payload.proposals)
    } catch {
      setNotice('합류 동의 상태를 불러오지 못했어요.')
    }
  }, [seriesId])

  useEffect(() => { void load() }, [load])

  async function decide(proposal: JoinProposal, decision: 'accept' | 'reject') {
    if (busy || proposal.status !== 'awaiting_consents') return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/match/series/join-proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: proposal.proposal_id,
          decision,
          expected_revision: proposal.revision,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isProposalList(payload)) throw new Error('consent_failed')
      setProposals(seriesId ? payload.proposals.filter((item) => item.series_id === seriesId) : payload.proposals)
      setNotice(decision === 'accept' ? '내 합류 동의를 저장했어요. 모두가 동의하기 전에는 합류가 확정되지 않아요.' : '합류하지 않겠다는 선택을 저장했어요.')
    } catch {
      setNotice('상태가 바뀌었거나 동의 시간이 끝났어요. 다시 확인해 주세요.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!proposals.length && !notice) return null
  return (
    <section className="rounded-3xl border border-[#147A70]/20 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><UserPlus className="text-[#147A70]" /><h2 className="font-black">새 참가자 합류 동의</h2></div>
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-[#f3eee2] p-4"><ShieldCheck className="mt-0.5 shrink-0 text-[#147A70]" size={18} /><p className="text-xs font-bold leading-5 text-[#52615d]">기존 참석자와 신규 참가자 모두가 명시적으로 동의해야 합니다. 다른 사람의 선택은 공개하지 않으며, 신규 참가자는 합류 전 회차의 비공개 콘텐츠를 볼 수 없습니다.</p></div>
      <div className="mt-4 space-y-3">
        {proposals.map((proposal) => <article key={proposal.proposal_id} className="rounded-2xl border border-black/10 p-4"><p className="text-sm font-black">Day {proposal.target_program_day}부터 {proposal.candidate_label} 합류</p><p className="mt-1 text-xs font-bold text-[#52615d]">신규 참가자의 합류 첫 회차 이용료는 면제되며, 이후 계속 만남부터 같은 이용료 규칙이 적용됩니다. · {formatExpiry(proposal.expires_at)}까지</p>{proposal.status === 'awaiting_consents' ? <div className="mt-3 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void decide(proposal, 'accept')} className="min-h-11 rounded-2xl bg-[#147A70] text-sm font-black text-white disabled:opacity-45">{busy ? <Loader2 className="mr-1 inline animate-spin" size={15} /> : null}합류 동의</button><button type="button" disabled={busy} onClick={() => void decide(proposal, 'reject')} className="min-h-11 rounded-2xl border border-black/10 text-sm font-black disabled:opacity-45">동의하지 않음</button></div> : <p className="mt-3 rounded-xl bg-[#f7f4ec] px-3 py-2 text-xs font-black text-[#52615d]">{proposalStatus(proposal)}</p>}</article>)}
      </div>
      {notice ? <p role="status" className="mt-3 text-xs font-bold leading-5 text-[#52615d]">{notice}</p> : null}
    </section>
  )
}

function isProposalList(value: unknown): value is { proposals: JoinProposal[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proposals = (value as { proposals?: unknown }).proposals
  return Array.isArray(proposals) && proposals.every((item) => item && typeof item === 'object' && typeof (item as JoinProposal).proposal_id === 'string' && typeof (item as JoinProposal).revision === 'number')
}

function proposalStatus(proposal: JoinProposal) {
  if (proposal.status === 'accepted') return '모든 동의가 모였습니다. 다음 회차를 열 때 합류합니다.'
  if (proposal.status === 'applied') return '다음 회차부터 합류가 적용됐습니다.'
  if (proposal.status === 'rejected') return '한 명 이상이 동의하지 않아 합류하지 않습니다.'
  return '출석 또는 명단이 바뀌어 운영자 재검토가 필요합니다.'
}

function formatExpiry(value: string) {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date) : '동의 마감'
}
