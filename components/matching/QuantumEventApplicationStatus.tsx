'use client'

import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, Clock3, Home, Loader2, MessageCircle, RotateCw, ShieldCheck, Star, UsersRound, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import MeetingEvidencePanel from '@/components/matching/MeetingEvidencePanel'
import MeetingGuideStory from '@/components/matching/MeetingGuideStory'
import QuantumFriendPartySetup from '@/components/matching/QuantumFriendPartySetup'
import QuantumEventRoomLobby from '@/components/matching/QuantumEventRoomLobby'
import QuantumMeetingMomentWizard from '@/components/matching/QuantumMeetingMomentWizard'
import QuantumRoleGuessing from '@/components/matching/QuantumRoleGuessing'
import QuantumSecretRoleCard from '@/components/matching/QuantumSecretRoleCard'
import {
  isQuantumEventParticipation,
  type QuantumEventParticipation,
} from '@/lib/matching/quantum-event-participation'
import { getQuantumEventById, quantumEventPhotos, type QuantumEventMode, type QuantumPartyType } from '@/lib/matching/quantum-event-catalog'
import {
  parseQuantumProfilePreference,
  type QuantumMeetingMomentDraft,
} from '@/lib/matching/quantum-profile-preferences'
import {
  deriveQuantumEventLifecycleStage,
  isActiveQuantumEventLifecycle,
  isQuantumEventLifecycle,
  type QuantumEventLifecycle,
  type QuantumEventLifecycleStage,
} from '@/lib/matching/quantum-event-lifecycle'
import {
  parseMySecretRole,
  type QuantumMySecretRole,
} from '@/lib/matching/quantum-secret-roles'

type ApplicationState = 'loading' | 'role_review' | 'saved' | 'auth_required' | 'unavailable' | 'ready_to_apply' | 'error'
type PreparationState = 'idle' | 'checking' | 'missing_preference' | 'preference_error' | 'ready'
type OccurrenceScopedParticipation = QuantumEventParticipation & { occurrence_id: string }
type SavedParticipation = OccurrenceScopedParticipation | QuantumEventLifecycle

export default function QuantumEventApplicationStatus({
  eventId,
  party,
}: {
  eventId: string
  party: QuantumPartyType
}) {
  const router = useRouter()
  const [state, setState] = useState<ApplicationState>('loading')
  const [retryKey, setRetryKey] = useState(0)
  const [guideConfirmed, setGuideConfirmed] = useState(false)
  const [friendGroupId, setFriendGroupId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [replacingAnotherEvent, setReplacingAnotherEvent] = useState(false)
  const [savedLifecycle, setSavedLifecycle] = useState<QuantumEventLifecycle | null>(null)
  const [preparationState, setPreparationState] = useState<PreparationState>('idle')
  const [pendingParticipation, setPendingParticipation] = useState<SavedParticipation | null>(null)
  const [pendingSecretRole, setPendingSecretRole] = useState<QuantumMySecretRole | null>(null)

  const verifyApplication = useCallback(async (signal?: AbortSignal) => {
    setState('loading')
    try {
      const response = await fetch('/api/match/event-participation', {
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('application_lookup_failed')
      const payload = await response.json() as {
        participation?: unknown
        availability?: string
      }
      if (payload.availability === 'auth_required') return setState('auth_required')
      if (payload.availability === 'schema_unavailable') return setState('unavailable')

      const lifecycle = isQuantumEventLifecycle(payload.participation)
        ? payload.participation
        : null
      const lifecycleStage = lifecycle
        ? deriveQuantumEventLifecycleStage(lifecycle)
        : null
      const isCurrentLifecycle = lifecycle?.event_id === eventId
        && lifecycle.party_type === party
        && lifecycleStage !== 'cancelled'
      if (lifecycle && isCurrentLifecycle) {
        setFriendGroupId(lifecycle.group_id ?? null)
        setSavedLifecycle(lifecycle)
        setReplacingAnotherEvent(false)
        const roleResponse = await fetch(
          `/api/match/event-secret-role?occurrence_id=${encodeURIComponent(lifecycle.occurrence_id)}`,
          { cache: 'no-store', signal },
        )
        const rolePayload = await roleResponse.json().catch(() => ({})) as {
          secret_role?: unknown
          error?: string
        }
        if (!roleResponse.ok) {
          if (rolePayload.error === 'schema_unavailable') {
            setState('unavailable')
            return
          }
          throw new Error('secret_role_lookup_failed')
        }
        const ownRole = parseMySecretRole(rolePayload.secret_role)
        if (!ownRole || ownRole.occurrenceId !== lifecycle.occurrence_id) {
          throw new Error('secret_role_response_invalid')
        }
        if (!ownRole.applicationConfirmed) {
          setPendingParticipation(lifecycle)
          setPendingSecretRole(ownRole)
          setState('role_review')
          return
        }
        setPendingParticipation(null)
        setPendingSecretRole(null)
        setState('saved')
        return
      }
      const activeLifecycle = lifecycle && isActiveQuantumEventLifecycle(lifecycle)
        ? lifecycle
        : null
      const legacyParticipation = !lifecycle && isQuantumEventParticipation(payload.participation)
        ? payload.participation
        : null
      const activeParticipation = activeLifecycle ?? legacyParticipation
      if (legacyParticipation?.event_id === eventId && legacyParticipation.party_type === party) {
        setFriendGroupId(legacyParticipation.group_id ?? null)
        setSavedLifecycle(null)
        setReplacingAnotherEvent(false)
        setState('saved')
        return
      }
      setSavedLifecycle(null)
      setReplacingAnotherEvent(Boolean(activeParticipation))
      setState('ready_to_apply')
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return
      setState('error')
    }
  }, [eventId, party])

  useEffect(() => {
    setGuideConfirmed(
      window.sessionStorage.getItem(`quantum-meeting-guide:${eventId}`) === 'confirmed',
    )
    const controller = new AbortController()
    void verifyApplication(controller.signal)
    return () => controller.abort()
  }, [eventId, party, retryKey, verifyApplication])

  function completeGuide() {
    window.sessionStorage.setItem(`quantum-meeting-guide:${eventId}`, 'confirmed')
    setGuideConfirmed(true)
  }

  async function startPreparation() {
    if (saving) return
    if (party === 'friends' && !friendGroupId) {
      setNotice('친구가 초대를 수락한 뒤 오늘 카드를 준비할 수 있어요.')
      return
    }

    setPreparationState('checking')
    setNotice('')
    try {
      const preferenceResponse = await fetch('/api/profile/quantum-preferences', { cache: 'no-store' })
      const preferencePayload = await preferenceResponse.json().catch(() => ({})) as {
        preference?: unknown
        error?: string
      }
      if (preferenceResponse.status === 401) {
        setState('auth_required')
        return
      }
      if (!preferenceResponse.ok) {
        setPreparationState('preference_error')
        setNotice(preferencePayload.error === 'schema_unavailable'
          ? '평소 취향 저장 기능을 준비 중이에요. 이 상태에서는 신청하지 않았어요.'
          : '평소 취향을 확인하지 못했어요. 빈 값으로 진행하지 않았어요.')
        return
      }
      if (preferencePayload.preference === null) {
        setPreparationState('missing_preference')
        return
      }
      if (!parseQuantumProfilePreference(preferencePayload.preference)) {
        setPreparationState('preference_error')
        setNotice('평소 취향을 확인하지 못했어요. 빈 값으로 진행하지 않았어요.')
        return
      }
      setPreparationState('ready')
    } catch {
      setPreparationState('preference_error')
      setNotice('참여 준비 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  async function submitApplication(meetingMoment: QuantumMeetingMomentDraft) {
    if (!guideConfirmed || saving || preparationState !== 'ready') return
    if (party === 'friends' && !friendGroupId) {
      setNotice('친구가 초대를 수락한 뒤 신청할 수 있어요.')
      return
    }

    setSaving(true)
    setNotice('신청을 저장하고 있어요. 잠시만 기다려 주세요.')
    try {
      const response = await fetch('/api/match/event-participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          party_type: party,
          meeting_moment: meetingMoment,
          ...(party === 'friends' ? { group_id: friendGroupId } : {}),
        }),
      })
      if (response.status === 401) {
        setState('auth_required')
        return
      }
      const payload = await response.json().catch(() => ({})) as {
        participation?: unknown
        secret_role?: unknown
        role_confirmation_required?: unknown
        application_confirmed?: unknown
        error?: string
      }
      const lifecycle = isQuantumEventLifecycle(payload.participation)
        ? payload.participation
        : null
      const participation = lifecycle ?? (isOccurrenceScopedParticipation(payload.participation)
        ? payload.participation
        : null)
      const ownRole = parseMySecretRole(payload.secret_role)
      if (!response.ok || !participation || !ownRole) {
        if (payload.error === 'schema_unavailable') setState('unavailable')
        if (payload.error === 'pre_match_card_required') {
          const returnHref = `/match/events/${encodeURIComponent(eventId)}?party=${encodeURIComponent(party)}`
          setNotice('사전 카드를 완성하면 바로 이 신청으로 돌아올게요.')
          router.push(`/profile/match-card?redirect=${encodeURIComponent(returnHref)}`)
          return
        }
        if (payload.error === 'profile_preference_required') {
          setPreparationState('missing_preference')
          setNotice('내 취향 카드가 바뀌었어요. 다시 확인하면 이 신청으로 돌아올게요.')
          return
        }
        setNotice(mapParticipationError(payload.error))
        return
      }
      if (ownRole.occurrenceId !== participation.occurrence_id
        || typeof payload.role_confirmation_required !== 'boolean'
        || payload.role_confirmation_required !== !ownRole.roleConfirmed
        || typeof payload.application_confirmed !== 'boolean'
        || payload.application_confirmed !== ownRole.applicationConfirmed) {
        setNotice('신청 결과의 역할 확인 상태가 올바르지 않아요. 다시 확인해 주세요.')
        return
      }
      setFriendGroupId(participation.group_id ?? null)
      setSavedLifecycle(lifecycle)
      setReplacingAnotherEvent(false)
      if (payload.role_confirmation_required) {
        setPendingParticipation(participation)
        setPendingSecretRole(ownRole)
        setNotice('마지막으로 나만의 역할을 확인하면 참여가 확정돼요.')
        setState('role_review')
      } else {
        setPendingParticipation(null)
        setPendingSecretRole(null)
        setState('saved')
      }
    } catch {
      setNotice('신청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  function completeRoleConfirmation(role: QuantumMySecretRole) {
    if (!pendingParticipation
      || role.occurrenceId !== pendingParticipation.occurrence_id
      || !role.roleConfirmed
      || !role.applicationConfirmed) {
      setNotice('현재 신청의 역할 확인 결과를 확인하지 못했어요.')
      return
    }

    setFriendGroupId(pendingParticipation.group_id ?? null)
    setSavedLifecycle(isQuantumEventLifecycle(pendingParticipation) ? pendingParticipation : null)
    setPendingParticipation(null)
    setPendingSecretRole(null)
    setNotice('역할을 확인했고 참여가 확정됐어요.')
    setState('saved')
  }

  async function cancelApplication() {
    if (saving) return
    if (!window.confirm('현재 모집 중인 신청을 취소할까요?')) return

    setSaving(true)
    setNotice('신청을 취소하고 있어요. 잠시만 기다려 주세요.')
    try {
      const response = await fetch('/api/match/event-participation', {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setNotice(mapParticipationError(payload.error))
        return
      }

      setNotice('신청을 취소했어요. 홈으로 이동할게요.')
      router.replace('/')
    } catch {
      setNotice('신청 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  if (state === 'role_review' && pendingParticipation && pendingSecretRole) {
    return (
      <section className="space-y-5 py-6" aria-live="polite" aria-busy={saving}>
        <div className="border-l-2 border-[#E9BE6A] pl-4">
          <p className="text-xs font-black text-[#9B6D24]">참여 전 마지막 확인</p>
          <h2 className="mt-1 text-xl font-black text-boot-ink">나만의 역할을 확인해 주세요</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">다른 참가자에게는 보이지 않아요. 역할을 확인해야 이번 신청이 최종 확정돼요.</p>
        </div>
        <QuantumSecretRoleCard
          occurrenceId={pendingParticipation.occurrence_id}
          initialRole={pendingSecretRole}
          onRoleChanged={setPendingSecretRole}
          onRoleConfirmed={completeRoleConfirmation}
        />
        {notice ? <p className="text-xs font-black leading-5 text-[#A86A20]" role="status">{notice}</p> : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void cancelApplication()}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#E6A49A] bg-white px-4 text-sm font-black text-[#B64335] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <XCircle size={17} aria-hidden="true" />}
          {saving ? '취소 처리 중' : '이 신청 취소'}
        </button>
      </section>
    )
  }

  if (state === 'saved') {
    const savedStage = savedLifecycle
      ? deriveQuantumEventLifecycleStage(savedLifecycle)
      : 'recruiting'

    return (
      <section className="py-6" aria-live="polite" aria-busy={saving}>
        <div className="flex items-start gap-3 border-l-2 border-[#147A70] pl-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-[#147A70]" size={20} />
          <div>
            <h2 className="text-base font-black">신청이 접수됐어요</h2>
            <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">
              {party === 'friends'
                ? '수락한 친구와 한 팀으로 접수됐어요. 인원이 모이면 장소와 시간을 함께 알려드려요.'
                : '실제 신청 현황에 반영됐어요. 인원이 모이면 장소와 확정 시간을 알림으로 알려드려요.'}
            </p>
          </div>
        </div>
        <div className="mt-5 flex items-start gap-3 border-y border-boot-hairline py-4">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-boot-primary" aria-hidden="true" />
          <p className="text-xs font-bold leading-5 text-boot-muted">참여 전 여섯 가지 약속을 모두 확인한 신청입니다.</p>
        </div>
        {savedLifecycle && savedStage === 'recruiting' ? (
          <QuantumEventRoomLobby
            eventId={savedLifecycle.event_id}
            eventMode={savedLifecycle.event_mode as QuantumEventMode}
            roomLabel={savedLifecycle.room_label}
            roomCode={savedLifecycle.room_code}
            myPartySize={savedLifecycle.party_members.length}
          />
        ) : null}
        {savedLifecycle && savedStage !== 'recruiting' ? (
          <QuantumEventSavedStage lifecycle={savedLifecycle} stage={savedStage} />
        ) : null}
        {savedLifecycle ? (
          <div className="mt-5">
            <QuantumSecretRoleCard occurrenceId={savedLifecycle.occurrence_id} />
          </div>
        ) : null}
        {notice ? <p className="mt-4 text-xs font-black leading-5 text-[#E65D4D]" role="status">{notice}</p> : null}
        <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Link href="/" className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-boot-primary px-5 text-base font-black text-white">
            <Home size={18} aria-hidden="true" /> 홈으로 돌아가기
          </Link>
          {savedStage === 'recruiting' ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => void cancelApplication()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-[#E6A49A] bg-white px-5 text-sm font-black text-[#B64335] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <XCircle size={17} aria-hidden="true" />}
              {saving ? '취소 처리 중' : '신청 취소'}
            </button>
          ) : null}
        </div>
      </section>
    )
  }

  if (state === 'loading') return <Status message="신청 상태를 확인하고 있어요." icon={Clock3} />
  if (state === 'auth_required') {
    return (
      <section className="py-6">
        <p className="text-sm font-bold text-boot-muted">로그인한 뒤 신청 상태를 확인할 수 있어요.</p>
        <Link href="/login?redirect=%2Fmatch" className="mt-4 flex min-h-12 items-center justify-center rounded-lg bg-boot-primary px-4 text-sm font-black text-white">로그인</Link>
      </section>
    )
  }
  if (state === 'unavailable') {
    return <Status message="신청 저장 기능의 새 친구팀 계약을 준비 중이에요. 이 상태에서는 접수됐다고 표시하지 않아요." icon={Clock3} />
  }
  if (state === 'error') {
    return (
      <section className="py-6">
        <p className="text-sm font-bold text-boot-muted">신청 상태를 불러오지 못했어요.</p>
        <button type="button" onClick={() => setRetryKey((value) => value + 1)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-boot-hairline bg-white px-4 text-sm font-black text-boot-primary">
          <RotateCw size={17} aria-hidden="true" /> 다시 확인
        </button>
      </section>
    )
  }

  const event = getQuantumEventById(eventId)

  return (
    <section className="py-6">
      {!guideConfirmed ? (
        <div>
          <div className="mb-4 border-l-2 border-[#E65D4D] pl-4">
            <p className="text-xs font-black text-[#E65D4D]">필수 확인</p>
            <h2 className="mt-1 text-base font-black">참여 전 안내를 모두 확인해야 신청할 수 있어요</h2>
          </div>
          <MeetingGuideStory onComplete={completeGuide} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg bg-[#EAF7F5] px-4 py-3">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#147A70]" aria-hidden="true" />
            <p className="text-sm font-black text-[#115F57]">안내 6장을 모두 확인했어요.</p>
          </div>

          {party === 'friends' ? (
            <QuantumFriendPartySetup onReady={setFriendGroupId} />
          ) : null}

          {replacingAnotherEvent ? (
            <p className="text-xs font-bold leading-5 text-[#A34A3D]">현재 신청 중인 다른 약속은 이 활동으로 변경됩니다.</p>
          ) : null}
          {notice ? <p className="text-xs font-black leading-5 text-[#E65D4D]" role="status">{notice}</p> : null}
          {preparationState === 'idle' ? (
            <button
              type="button"
              disabled={saving || (party === 'friends' && !friendGroupId)}
              onClick={() => void startPreparation()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-boot-primary px-5 text-base font-black text-white disabled:cursor-not-allowed disabled:opacity-45"
            >
              오늘 카드 준비하기
            </button>
          ) : null}
          {preparationState === 'checking' ? <Status message="평소 취향을 확인하고 있어요." icon={Loader2} /> : null}
          {preparationState === 'missing_preference' ? (
            <Link href={`/profile/match-card?redirect=${encodeURIComponent(`/match/events/${eventId}?party=${party}`)}`} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-boot-primary px-5 text-base font-black text-white">
              내 취향 카드 작성하기
            </Link>
          ) : null}
          {preparationState === 'preference_error' ? (
            <button type="button" onClick={() => void startPreparation()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-boot-hairline bg-white px-4 text-sm font-black text-boot-primary">
              <RotateCw size={17} aria-hidden="true" /> 준비 상태 다시 확인
            </button>
          ) : null}
          {preparationState === 'ready' && event ? (
            <QuantumMeetingMomentWizard
              activityKind={event.kind}
              onContinue={submitApplication}
              submitting={saving}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

export function QuantumEventSavedStage({
  lifecycle,
  stage,
  devPreview = false,
}: {
  lifecycle: QuantumEventLifecycle
  stage: Exclude<QuantumEventLifecycleStage, 'recruiting'>
  devPreview?: boolean
}) {
  const matchId = lifecycle.match_id
  const event = getQuantumEventById(lifecycle.event_id)
  const eventPhoto = event ? quantumEventPhotos[event.kind] : null
  const privacyCopy = stage === 'completed'
    ? '만남 종료와 자동 친구 연결이 완료되어 친구 메뉴에서 프로필을 확인할 수 있어요.'
    : '만남 종료 전에는 참가자 사진과 상세 프로필을 공개하지 않아요. 채팅에서도 행사 전용 가명만 보여요.'

  return (
    <div className="mt-5 space-y-4">
      <div className="overflow-hidden rounded-lg border border-[#147A70]/20 bg-white shadow-sm">
        {event && eventPhoto ? (
          <div className="relative aspect-[16/9] min-h-48 overflow-hidden bg-[#121821] text-white">
            <Image src={eventPhoto.src} alt={eventPhoto.alt} fill sizes="(max-width: 768px) 100vw, 720px" className="object-cover" priority />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,18,18,0.08)_20%,rgba(6,18,18,0.9)_100%)]" />
            <span className="absolute right-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-sm">활동 예시 · 실제 참가자 사진 아님</span>
            <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
              <p className="text-[11px] font-black text-[#F3B95F]">{stageLabel(stage)}</p>
              <h3 className="mt-1 text-xl font-black">{event.title}</h3>
              <p className="mt-1 text-sm font-bold text-white/85">{stageTitle(stage)}</p>
            </div>
          </div>
        ) : (
          <div className="bg-[#121821] px-4 py-4 text-white">
            <p className="text-[11px] font-black text-[#F3B95F]">{stageLabel(stage)}</p>
            <h3 className="mt-1 text-lg font-black">{stageTitle(stage)}</h3>
          </div>
        )}
        <div className="space-y-3 p-4">
          <div className="flex items-start gap-3 rounded-lg bg-[#EAF7F5] p-3">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#147A70]" aria-hidden="true" />
            <p className="text-sm font-bold leading-6 text-[#315F5B]">{privacyCopy}</p>
          </div>
          <div className="grid gap-2 text-sm font-bold text-boot-body sm:grid-cols-2">
            <p className="flex min-h-11 items-center gap-2 rounded-lg bg-boot-soft px-3">
              <Clock3 size={16} className="text-boot-primary" aria-hidden="true" />
              {formatLifecycleTime(lifecycle.starts_at)}
            </p>
            <p className="flex min-h-11 items-center gap-2 rounded-lg bg-boot-soft px-3">
              <UsersRound size={16} className="text-boot-primary" aria-hidden="true" />
              총 {lifecycle.participant_counts.total}명 · {lifecycle.room_label}
            </p>
          </div>
          {lifecycle.location_name ? (
            <p className="text-sm font-black text-boot-ink">장소 · {lifecycle.location_name}</p>
          ) : null}
          {stage === 'confirmed' ? (
            <p className="text-xs font-bold leading-5 text-boot-muted">
              팀 채팅은 {formatLifecycleTime(lifecycle.chat_opens_at)}부터 열려요.
            </p>
          ) : null}
          {stage === 'chat_open' && matchId ? (
            <Link href={`/match/${encodeURIComponent(matchId)}/chat`} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white">
              <MessageCircle size={17} aria-hidden="true" /> 행사 가명으로 팀 채팅 열기
            </Link>
          ) : null}
          {stage === 'cancelled' ? (
            <Link href="/match" className="flex min-h-12 items-center justify-center rounded-lg bg-boot-primary px-4 text-sm font-black text-white">
              다른 약속 둘러보기
            </Link>
          ) : null}
        </div>
      </div>

      {(stage === 'in_progress' || stage === 'completed') && matchId ? (
        <MeetingEvidencePanel matchId={matchId} devPreview={devPreview} />
      ) : null}

      {stage === 'completed' && matchId ? (
        <QuantumRoleGuessing matchId={matchId} meetingCompleted />
      ) : null}

      {stage === 'completed' && matchId ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href={`/match/${encodeURIComponent(matchId)}/review?event=${encodeURIComponent(lifecycle.event_id)}&party=${encodeURIComponent(lifecycle.party_type)}`} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white">
            <Star size={17} aria-hidden="true" /> 만남 후기 남기기
          </Link>
          <Link href="/friends" className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary">
            <UsersRound size={17} aria-hidden="true" /> 친구 프로필 보기
          </Link>
        </div>
      ) : null}
    </div>
  )
}

function stageLabel(stage: Exclude<QuantumEventLifecycleStage, 'recruiting'>) {
  if (stage === 'confirmed') return '약속 확정'
  if (stage === 'chat_open') return '팀 채팅 오픈'
  if (stage === 'in_progress') return '만남 진행 중'
  if (stage === 'completed') return '만남 완료'
  return '이번 회차 취소'
}

function stageTitle(stage: Exclude<QuantumEventLifecycleStage, 'recruiting'>) {
  if (stage === 'confirmed') return '시간과 장소가 정해졌어요'
  if (stage === 'chat_open') return '도착 위치를 나눠요'
  if (stage === 'in_progress') return '오늘의 활동을 함께 즐겨요'
  if (stage === 'completed') return '사진과 후기를 남겨요'
  return '다음 약속을 다시 골라요'
}

function formatLifecycleTime(value: string) {
  const date = new Date(value)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function Status({ message, icon: Icon }: { message: string; icon: typeof Clock3 }) {
  return (
    <section className="flex items-start gap-3 py-6">
      <Icon aria-hidden="true" className="mt-0.5 shrink-0 text-boot-primary" size={19} />
      <p className="text-sm font-bold leading-6 text-boot-muted">{message}</p>
    </section>
  )
}

function mapParticipationError(error?: string) {
  if (error === 'profile_preference_required') return '내 취향 카드를 먼저 완성해 주세요.'
  if (error === 'pre_match_card_required') return '사전 카드를 먼저 완성해 주세요.'
  if (error === 'pre_match_card_lookup_failed') return '사전 카드 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
  if (error === 'friend_group_required') return '친구가 초대를 수락한 실제 팀이 필요해요.'
  if (error === 'friend_group_not_ready') return '친구 수락 상태를 다시 확인해 주세요.'
  if (error === 'friend_group_leader_required') return '친구 참여는 팀을 만든 사람이 신청해 주세요.'
  if (error === 'friend_group_gender_mismatch') return '친구와 참여하려면 같은 성별 친구로 팀을 만들어 주세요.'
  if (error === 'schema_unavailable') return '친구팀 신청 저장 구조가 아직 원격 DB에 준비되지 않았어요.'
  return '신청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function isOccurrenceScopedParticipation(value: unknown): value is OccurrenceScopedParticipation {
  if (!isQuantumEventParticipation(value) || !isRecord(value)) return false
  return typeof value.occurrence_id === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.occurrence_id)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
