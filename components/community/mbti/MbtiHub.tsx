'use client'

import { ArrowLeft, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { buildExperienceSubmissions, expandCountDraft, type MbtiCountDraft, type MbtiExperienceDraft } from '@/lib/community/mbti/draft'
import { runMbtiSubmissionAttempt, type MbtiSubmissionPlan } from '@/lib/community/mbti/journey'
import {
  COMMUNITY_MBTI_CONSENT_VERSION,
  MBTI_TYPES,
  type CommunityMbtiGender,
  type MbtiExperienceCreateInput,
  type MbtiOwnerStateDto,
  type MbtiParticipantInput,
  type MbtiType,
  type PartnerMbtiType,
} from '@/lib/community/mbti/types'

import MbtiExperienceEditor from './MbtiExperienceEditor'
import MbtiExperienceReview from './MbtiExperienceReview'
import MbtiJourneyProgress from './MbtiJourneyProgress'
import MbtiResponseManager from './MbtiResponseManager'
import MbtiStats from './MbtiStats'
import MbtiDraftNavigationGuard from './MbtiDraftNavigationGuard'

type Screen = 'self' | 'experiences' | 'review' | 'stats' | 'manage'

const EMPTY_STATE: MbtiOwnerStateDto = {
  participant: null,
  experiences: [],
  nextCursor: null,
  meetingStatsConsent: null,
}

function createSessionId(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `mbti:survey:${suffix}`
}

export default function MbtiHub() {
  const [screen, setScreen] = useState<Screen>('self')
  useEffect(() => { window.scrollTo(0, 0) }, [screen])
  const [ownerState, setOwnerState] = useState<MbtiOwnerStateDto>(EMPTY_STATE)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [selfMbti, setSelfMbti] = useState<MbtiType | null>(null)
  const [selfGender, setSelfGender] = useState<CommunityMbtiGender>('unknown')
  const [counts, setCounts] = useState<MbtiCountDraft>({})
  const [drafts, setDrafts] = useState<MbtiExperienceDraft[]>([])
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const [statsReturn, setStatsReturn] = useState<'self' | 'experiences'>('self')
  const [hasUnsavedDraft, setHasUnsavedDraft] = useState(false)
  const [recoveryLocked, setRecoveryLocked] = useState(false)
  const mutationSession = useRef(createSessionId())
  const draftVersion = useRef(0)
  const pendingSubmission = useRef<MbtiSubmissionPlan | null>(null)
  const participantConfirmed = useRef(false)

  const loadOwnerState = useCallback(async (hydrateDraft = true) => {
    const versionAtRequest = draftVersion.current
    const response = await fetch('/api/community/mbti/me?limit=50', { cache: 'no-store' })
    if (response.status === 401) {
      setAuthenticated(false)
      setOwnerState(EMPTY_STATE)
      setServiceError(null)
      return
    }
    if (!response.ok) throw new Error('내 최신 응답을 다시 불러오지 못했어요.')
    const state = await response.json() as MbtiOwnerStateDto
    setAuthenticated(true)
    setServiceError(null)
    setOwnerState(state)
    if (state.participant && hydrateDraft && draftVersion.current === versionAtRequest) {
      setSelfMbti(state.participant.selfMbti)
      setSelfGender(state.participant.selfGender)
    }
  }, [])

  const loadMoreExperiences = useCallback(async () => {
    const cursor = ownerState.nextCursor
    if (!cursor) return

    const response = await fetch(`/api/community/mbti/experiences?limit=50&cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' })
    if (!response.ok) throw new Error('추가 경험을 불러오지 못했어요.')
    const page = await response.json() as Pick<MbtiOwnerStateDto, 'experiences' | 'nextCursor'>

    setOwnerState((current) => {
      if (current.nextCursor !== cursor) return current
      const knownIds = new Set(current.experiences.map((experience) => experience.experienceId))
      return {
        ...current,
        experiences: [
          ...current.experiences,
          ...page.experiences.filter((experience) => !knownIds.has(experience.experienceId)),
        ],
        nextCursor: page.nextCursor,
      }
    })
  }, [ownerState.nextCursor])

  useEffect(() => {
    void loadOwnerState().catch(() => {
      setAuthenticated(null)
      setServiceError('서비스 연결을 확인하지 못했어요. 저장하기 전 다시 확인해 주세요.')
    })
  }, [loadOwnerState])

  const editDraft = (next: MbtiExperienceDraft[]) => {
    if (pendingSubmission.current) return
    draftVersion.current += 1
    setConsent(false)
    setHasUnsavedDraft(true)
    setDrafts(next)
  }

  const changeCount = (type: PartnerMbtiType, delta: number) => {
    if (pendingSubmission.current) return
    draftVersion.current += 1
    setConsent(false)
    setHasUnsavedDraft(true)
    setCounts((current) => {
      const value = Math.max(0, (current[type] ?? 0) + delta)
      const next = { ...current }
      if (value === 0) delete next[type]
      else next[type] = value
      return next
    })
  }

  const beginReview = (noExperience = false) => {
    setDrafts((current) => noExperience ? [] : expandCountDraft(counts, current))
    setConsent(false)
    setError(null)
    setScreen('review')
  }

  const showStats = (returnTo: 'self' | 'experiences') => {
    setStatsReturn(returnTo)
    setScreen('stats')
  }

  const submit = async () => {
    if (!selfMbti || !consent || submitting) return
    if (authenticated === false) {
      setError('응답을 저장하려면 먼저 로그인해 주세요. 통계는 로그인 없이 볼 수 있어요.')
      return
    }
    if (authenticated !== true) {
      setError('서비스 연결을 아직 확인하지 못해 저장할 수 없어요. 다시 확인해 주세요.')
      return
    }
    setSubmitting(true)
    setError(null)
    const base = `${mutationSession.current}:v${draftVersion.current}`
    const plan = pendingSubmission.current ?? (() => {
      const participant: MbtiParticipantInput = {
        selfMbti,
        selfGender,
        consent: true,
        consentVersion: COMMUNITY_MBTI_CONSENT_VERSION,
        expectedRevision: ownerState.participant?.revision ?? 0,
        clientMutationId: `${base}:participant`,
      }
      const experiences: MbtiExperienceCreateInput[] = buildExperienceSubmissions(drafts, selfMbti, (index) => `${base}:experience:${index}`)
      const next = { participant, experiences }
      pendingSubmission.current = next
      return next
    })()
    try {
      const attempt = await runMbtiSubmissionAttempt(plan, {
        putParticipant: async (input) => {
          const response = await fetch('/api/community/mbti/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              self_mbti: input.selfMbti,
              self_gender: input.selfGender,
              consent: input.consent,
              consent_version: input.consentVersion,
              expected_revision: input.expectedRevision,
              client_mutation_id: input.clientMutationId,
            }),
          })
          return { ok: response.ok, status: response.status }
        },
        postExperience: async (input) => {
          const response = await fetch('/api/community/mbti/experiences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              self_mbti_snapshot: input.selfMbtiSnapshot,
              partner_mbti: input.partnerMbti,
              partner_gender: input.partnerGender,
              relationship_status: input.relationshipStatus,
              entry_mode: input.entryMode,
              reported_count: input.reportedCount,
              score: input.score,
              matched_aspects: input.matchedAspects,
              client_mutation_id: input.clientMutationId,
            }),
          })
          return { ok: response.ok, status: response.status }
        },
      }, participantConfirmed.current)
      participantConfirmed.current = attempt.participantConfirmed
      if (attempt.kind === 'participant_conflict') {
        pendingSubmission.current = null
        participantConfirmed.current = false
        setRecoveryLocked(false)
        setConsent(false)
        try {
          await loadOwnerState(false)
          setError('다른 기기에서 내 응답이 바뀌었어요. 최신 상태를 불러왔고, 지금 입력한 초안은 유지했어요. 내용을 확인한 뒤 동의를 다시 체크해 주세요.')
        } catch {
          setError('다른 기기에서 내 응답이 바뀌었어요. 최신 상태를 다시 불러온 뒤 동의를 다시 체크해 주세요.')
        }
        return
      }
      if (attempt.kind === 'retry_locked') {
        setRecoveryLocked(true)
        setError('저장 요청 일부가 반영됐을 수 있어요. 내용을 바꾸지 말고 같은 내용으로 다시 저장해 주세요. 저장이 끝난 뒤에는 내 응답 관리에서 수정할 수 있어요.')
        return
      }
      await loadOwnerState()
      setCounts({})
      setDrafts([])
      setConsent(false)
      setHasUnsavedDraft(false)
      setRecoveryLocked(false)
      pendingSubmission.current = null
      participantConfirmed.current = false
      setStatsReturn('self')
      setScreen('stats')
    } catch (reason) {
      setRecoveryLocked(true)
      setError(reason instanceof Error ? reason.message : '응답을 저장하지 못했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  const retryService = async () => {
    setError(null)
    try { await loadOwnerState(false) }
    catch { setServiceError('서비스 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); setError('서비스에 연결하지 못했어요. 입력은 이 화면에 유지돼요. 잠시 후 다시 확인해 주세요.') }
  }
  const guarded = (content: ReactNode) => <MbtiDraftNavigationGuard active={hasUnsavedDraft}>{content}</MbtiDraftNavigationGuard>
  if (screen === 'stats') return guarded(<MbtiStats onBack={() => setScreen(statsReturn)} onBackLabel={statsReturn === 'experiences' ? '경험 선택으로 돌아가기' : '내 유형 선택으로 돌아가기'} onManage={() => setScreen('manage')} canManage={authenticated === true && ownerState.participant !== null} />)
  if (screen === 'manage') return guarded(<MbtiResponseManager state={ownerState} onBack={() => setScreen('stats')} onRefresh={() => loadOwnerState(!hasUnsavedDraft)} onLoadMore={loadMoreExperiences} onWithdrawn={() => { setOwnerState(EMPTY_STATE); setSelfMbti(null); setCounts({}); setDrafts([]); setConsent(false); setHasUnsavedDraft(false); setScreen('self') }} />)
  if (screen === 'experiences') return guarded(<MbtiExperienceEditor counts={counts} onIncrement={(type) => changeCount(type, 1)} onDecrement={(type) => changeCount(type, -1)} onBack={() => setScreen('self')} onReview={() => beginReview(false)} onNoExperience={() => beginReview(true)} onStats={() => showStats('experiences')} />)
  if (screen === 'review') return guarded(<MbtiExperienceReview drafts={drafts} selfGender={selfGender} consent={consent} submitting={submitting} recoveryLocked={recoveryLocked} error={error} authenticated={authenticated} onRetryService={retryService} onDraftChange={editDraft} onSelfGenderChange={(value) => { if (pendingSubmission.current) return; draftVersion.current += 1; setConsent(false); setHasUnsavedDraft(true); setSelfGender(value) }} onConsentChange={(value) => { if (!pendingSubmission.current) setConsent(value) }} onBack={() => { if (!pendingSubmission.current) setScreen('experiences') }} onSubmit={() => void submit()} />)

  return guarded(
    <section className="mx-auto w-full max-w-3xl px-4 pb-24 pt-3 sm:px-6 sm:pt-5">
      <header className="flex min-h-11 items-center justify-between gap-3">
        <Link href="/community" className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-boot-soft" aria-label="커뮤니티로 돌아가기"><ArrowLeft /></Link>
        <button type="button" onClick={() => showStats('self')} className="min-h-11 rounded-full px-3 text-sm font-black text-boot-primary">통계 먼저 보기</button>
      </header>
      <MbtiJourneyProgress active={1} />
      <div className="mt-4">
        <span className="inline-flex rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">먼저 내 유형</span>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">내 MBTI는<br /><span className="text-boot-primary">무엇인가요?</span></h1>
        <p className="mt-2 text-sm font-bold leading-5 text-boot-body">기존 프로필 값은 사용하지 않아요. 직접 고르고 마지막에 동의할 때만 저장합니다.</p>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 sm:gap-3" aria-label="내 MBTI 선택">
        {MBTI_TYPES.map((type) => <button key={type} type="button" onClick={() => { draftVersion.current += 1; setConsent(false); setHasUnsavedDraft(true); setSelfMbti(type) }} aria-pressed={selfMbti === type} className={`h-[54px] rounded-xl border text-sm font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary sm:h-[68px] sm:rounded-2xl sm:text-base ${selfMbti === type ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white'}`}>{type}</button>)}
      </div>
      {authenticated === false && <p className="mt-3 rounded-xl bg-boot-info-soft px-3 py-2 text-xs font-bold leading-5 text-boot-info">로그인하지 않았어요. <Link href="/login?next=/community/mbti" className="underline underline-offset-2">로그인하기</Link> 전 초안은 이 탭에만 있고, 로그인하면 이어지지 않아요. 통계는 바로 볼 수 있어요.</p>}
      {serviceError && <div role="alert" className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold leading-5 text-red-700"><span>서비스 연결을 확인하지 못했어요.</span><button type="button" onClick={() => void loadOwnerState().catch(() => setServiceError('서비스 연결을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'))} className="min-h-9 shrink-0 rounded-lg px-2 text-xs font-black underline underline-offset-2">다시 확인</button></div>}
      <button type="button" disabled={!selfMbti} onClick={() => setScreen('experiences')} className="mt-4 min-h-14 w-full rounded-2xl bg-boot-primary px-5 text-base font-black text-white disabled:opacity-40">연애 경험 선택하기</button>
      <button type="button" onClick={() => showStats('self')} className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl border border-boot-primary bg-white text-sm font-black text-boot-primary"><BarChart3 size={18} /> 통계 먼저 보기</button>
    </section>
  )
}
