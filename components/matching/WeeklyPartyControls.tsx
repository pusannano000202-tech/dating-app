'use client'

import { Check, Loader2, UsersRound } from 'lucide-react'
import { useRef, useState } from 'react'

import QuantumFriendPartySetup from '@/components/matching/QuantumFriendPartySetup'
import { resolveMutationAttempt, type MutationAttempt } from '@/lib/matching/continuation-journey-client'

export type WeeklyPartySummary = {
  type: 'solo' | 'friends'
  size: number
  accepted_count: number
  pending_count: number
  my_role: 'owner' | 'member'
  my_consent_status: 'pending' | 'accepted' | 'withdrawn'
  cancellation_kind: 'owner_cancelled' | 'party_member_withdrew' | null
}

export type WeeklyPartyApplication = {
  id: string
  activity_id: string
  week_key: string
  status: 'awaiting_consents' | 'active' | 'assigned' | 'cancelled' | 'expired'
  assigned_window_id: string | null
  assigned_occurrence_id: string | null
  revision: number
  candidate_window_ids: string[]
  party: WeeklyPartySummary
}

type Props = {
  application: WeeklyPartyApplication | null
  partyType: 'solo' | 'friends'
  partyGroupId: string | null
  onPartyTypeChange: (value: 'solo' | 'friends') => void
  onPartyGroupChange: (groupId: string | null) => void
  onDiscovery: (payload: unknown) => boolean
  onNotice: (message: string, canReload?: boolean) => void
}

export default function WeeklyPartyControls({
  application,
  partyType,
  partyGroupId,
  onPartyTypeChange,
  onPartyGroupChange,
  onDiscovery,
  onNotice,
}: Props) {
  const [busy, setBusy] = useState(false)
  const consentAttempt = useRef<MutationAttempt | null>(null)
  const cancelAttempt = useRef<MutationAttempt | null>(null)
  const isLive = application?.status === 'awaiting_consents'
    || application?.status === 'active'
    || application?.status === 'assigned'

  async function sendPartyConsent(decision: 'accept' | 'withdraw') {
    if (!application || busy || application.status === 'assigned') return
    if (decision === 'withdraw' && application.party.type === 'friends'
      && !window.confirm('이 신청을 철회하면 친구들의 동반 신청도 함께 취소돼요. 전체 신청을 취소할까요?')) return

    consentAttempt.current = resolveMutationAttempt(
      consentAttempt.current,
      `weekly-party-${decision}:${application.id}:${application.revision}`,
    )
    setBusy(true)
    onNotice('')
    try {
      const response = await fetch('/api/match/weekly-availability/party-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: application.id,
          decision,
          expected_revision: application.revision,
          idempotency_key: consentAttempt.current.key,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !onDiscovery(payload)) throw new Error('party_consent_failed')
      onNotice(decision === 'accept'
        ? '동반 신청을 수락했어요. 전원이 수락하면 한 팀으로 배정을 기다려요.'
        : '동반 신청 전체를 취소했어요.')
    } catch {
      onNotice('동반 신청 상태가 바뀌었거나 처리하지 못했어요. 다시 불러와 주세요.', true)
    } finally {
      setBusy(false)
    }
  }

  async function cancelSoloApplication() {
    if (!application || busy || application.party.type !== 'solo') return
    cancelAttempt.current = resolveMutationAttempt(
      cancelAttempt.current,
      `weekly-cancel:${application.id}:${application.revision}`,
    )
    setBusy(true)
    onNotice('')
    try {
      const response = await fetch('/api/match/weekly-availability', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          application_id: application.id,
          expected_revision: application.revision,
          idempotency_key: cancelAttempt.current.key,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !onDiscovery(payload)) throw new Error('cancel_failed')
      onNotice('아직 배정되지 않은 신청을 취소했어요.')
    } catch {
      onNotice('이미 일정이 확정됐거나 상태가 바뀌었어요. 다시 불러와 주세요.', true)
    } finally {
      setBusy(false)
    }
  }

  if (isLive && application) {
    if (application.status === 'assigned') {
      return <p className="rounded-xl bg-white/65 px-3 py-2 text-xs font-bold text-[#315F5B]">확정된 일정은 여기서 취소할 수 없어요.</p>
    }

    if (application.party.type === 'friends') {
      const pendingMine = application.party.my_consent_status === 'pending'
      return (
        <section className="rounded-2xl border border-[#147A70]/20 bg-[#EAF7F5] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-[#147A70]"><UsersRound size={19} /></span>
            <div>
              <p className="font-black text-[#115F57]">친구 {application.party.size}명 동반 신청</p>
              <p className="mt-1 text-xs font-bold leading-5 text-[#315F5B]">전원 수락 후에만 같은 날짜·같은 팀으로 배정됩니다. 현재 수락 {application.party.accepted_count}/{application.party.size}명입니다.</p>
            </div>
          </div>
          {pendingMine ? (
            <button type="button" onClick={() => void sendPartyConsent('accept')} disabled={busy} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#147A70] px-4 text-sm font-black text-white disabled:opacity-50">
              {busy ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} 이 동반 신청 수락
            </button>
          ) : (
            <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs font-black text-[#115F57]">내 수락 완료 · 남은 수락 {application.party.pending_count}명</p>
          )}
          <button type="button" onClick={() => void sendPartyConsent('withdraw')} disabled={busy} className="mt-2 min-h-11 w-full rounded-xl border border-[#147A70]/25 bg-white px-4 text-xs font-black text-[#115F57] disabled:opacity-50">
            철회하면 친구들의 동반 신청도 함께 취소
          </button>
        </section>
      )
    }

    return (
      <button type="button" onClick={() => void cancelSoloApplication()} disabled={busy} className="min-h-12 w-full rounded-2xl border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary disabled:opacity-50">
        {busy ? '취소 확인 중…' : '아직 배정 전인 신청 취소'}
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-boot-hairline bg-boot-soft/45 p-4">
      {application?.status === 'cancelled' ? (
        <p className="mb-4 rounded-xl bg-white px-3 py-3 text-xs font-bold leading-5 text-boot-muted">
          {application.party.type === 'friends' ? '이 동반 신청은 전체 취소됐어요. 새 신청을 다시 만들 수 있어요.' : '이 신청은 취소됐어요. 새 신청을 다시 만들 수 있어요.'}
        </p>
      ) : application?.status === 'expired' ? (
        <p className="mb-4 rounded-xl bg-white px-3 py-3 text-xs font-bold leading-5 text-boot-muted">지난 신청은 만료됐어요. 이번 주 가능한 날짜로 다시 신청할 수 있어요.</p>
      ) : null}
      <p className="text-[11px] font-black text-boot-primary">1. 신청 인원</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={partyType === 'solo'} onClick={() => { onPartyTypeChange('solo'); onPartyGroupChange(null) }} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${partyType === 'solo' ? 'border-boot-primary bg-white text-boot-primary' : 'border-boot-hairline bg-white/60 text-boot-muted'}`}>나 혼자 신청</button>
        <button type="button" aria-pressed={partyType === 'friends'} onClick={() => onPartyTypeChange('friends')} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${partyType === 'friends' ? 'border-boot-primary bg-white text-boot-primary' : 'border-boot-hairline bg-white/60 text-boot-muted'}`}>친구 포함 2~3명</button>
      </div>
      {partyType === 'friends' ? (
        <div className="mt-3">
          <p className="mb-3 text-xs font-bold leading-5 text-boot-muted">수락된 친구 그룹을 고르면 신청 뒤에도 구성원 전원이 한 번씩 수락해야 해요. 전원 수락 전에는 배정되지 않습니다.</p>
          <QuantumFriendPartySetup onReady={(groupId) => onPartyGroupChange(groupId)} />
          {partyGroupId ? <p className="mt-2 text-xs font-black text-[#147A70]">동반 신청 준비 완료</p> : null}
        </div>
      ) : null}
    </section>
  )
}
