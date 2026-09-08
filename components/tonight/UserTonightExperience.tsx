'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  Check,
  Flag,
  Link2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react'

import PlaceLinks from '@/components/places/PlaceLinks'
import PlaceMap from '@/components/places/PlaceMap'
import {
  TONIGHT_DEPOSIT_POLICY_HASH,
  TONIGHT_DEPOSIT_POLICY_ITEMS,
  TONIGHT_DEPOSIT_POLICY_VERSION,
} from '@/lib/payments/tonight-deposit-policy'

import ActivityRanker from './ActivityRanker'
import TonightActivityExplorer from './TonightActivityExplorer'
import {
  activityExplorerFingerprint,
  canProgressTonightActivityExplorer,
  classifyFreshActivityExplorerSubmission,
  guardFreshActivityExplorerAction,
  inspectActivityExplorerDraft,
  isExactlyThreeUniqueActivityIds,
  reconcileActivityExplorerState,
} from './activity-explorer-state'
import {
  canBeginTonightDeposit,
  canRequestTonightRefund,
  tonightFinancialNextAction,
} from './user-action-policy'
import {
  ErrorPanel,
  LoadingPanel,
  PEACH_PANEL,
  PrimaryButton,
  RehearsalBanner,
  StatusPill,
  TonightPageShell,
  formatKoreanTime,
} from './TonightUi'
import type { TonightUiMode, UserTonightAdapter, UserTonightData } from './types'
import TonightNotificationControl from './TonightNotificationControl'
import FriendInviteSharePanel from './FriendInviteSharePanel'
import TonightContinuationEntry from './TonightContinuationEntry'

type BusyAction = 'apply' | 'deposit' | 'arrival' | 'arrivalHelp' | 'report' | 'refund' | null

const ACTIVITY_EXPLORER_DRAFT_PREFIX = 'quantum:tonight:g1:activity-draft:'

function activityExplorerDraftKey(mode: TonightUiMode, ownerScope?: string | null): string | null {
  if (ownerScope) return `${ACTIVITY_EXPLORER_DRAFT_PREFIX}${ownerScope}`
  return mode === 'rehearsal' ? `${ACTIVITY_EXPLORER_DRAFT_PREFIX}rehearsal` : null
}

function loadActivityExplorerDraft(key: string | null, data: UserTonightData) {
  if (!key || typeof window === 'undefined') return { draft: null, stale: false }
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? inspectActivityExplorerDraft(JSON.parse(raw), data) : { draft: null, stale: false }
  } catch {
    return { draft: null, stale: false }
  }
}

function clearActivityExplorerDraft(key: string | null) {
  if (!key || typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(key)
  } catch {
    // A blocked session storage must never interrupt the existing application flow.
  }
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.'
}

function applicationStatusLabel(status: string): string {
  return ({
    submitted: '신청 완료',
    applied: '신청 완료',
    waitlisted: '통합 대기 중',
    allocated: '팀 편성 완료',
    confirmed: '참가 확정',
    cancelled: '참가 취소',
    withdrawn: '신청 철회',
    completed: '모임 완료',
  } as Record<string, string>)[status] ?? '처리 상태 확인 중'
}

function depositStatusLabel(status: string): string {
  return ({
    pending: '결제 대기',
    checkout_ready: '결제창 준비',
    paid: '결제 완료',
    held: '보증금 보관 중',
    refund_requested: '환불 요청 접수',
    refunded: '환불 완료',
    forfeited: '보증금 몰수 · 환불되지 않음',
    reconciliation_required: '결제 확인 필요',
    cancelled: '결제 취소',
  } as Record<string, string>)[status] ?? '상태 확인 중'
}

function refundStatusLabel(status: string): string {
  return ({
    requested: '요청 접수',
    approved: '환불 승인',
    processing: '환불 처리 중',
    completed: '환불 완료',
    failed: '처리 지연 · 운영자 확인 중',
    rejected: '검토 후 반려',
  } as Record<string, string>)[status] ?? '상태 확인 중'
}

function Timeline({ data }: { data: UserTonightData }) {
  const steps = [
    { at: data.round.signupCloseAt, label: '신청 마감', detail: '활동 순위 제출' },
    { at: data.round.allocationPublishAt, label: '팀 편성', detail: '팀 인원·활동 안내' },
    { at: data.round.depositDueAt, label: '보증금 마감', detail: '18:45까지 결제' },
    { at: data.round.revealAt, label: '장소 공개', detail: '업장·팀 번호 확인' },
    { at: data.round.arrivalAt, label: '도착 확인', detail: '19:20부터 체크인' },
    { at: data.round.startsAt, label: '모임 시작', detail: '19:30 시작' },
  ]

  return (
    <section className={`${PEACH_PANEL} p-4 sm:p-5`} aria-labelledby="tonight-timeline-title">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-5 w-5 text-[#b94b3f]" aria-hidden />
        <h2 id="tonight-timeline-title" className="font-black">오늘 진행 순서</h2>
      </div>
      <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {steps.map((step, index) => (
          <li key={step.label} className="rounded-2xl bg-[#fff8f4] px-3 py-3">
            <p className="text-xs font-black text-[#b94b3f]">{formatKoreanTime(step.at)}</p>
            <p className="mt-1 text-sm font-black">{step.label}</p>
            <p className="mt-1 text-[11px] font-semibold leading-4 text-[#8b7e78]">{step.detail}</p>
            <span className="sr-only">{index + 1}단계</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function UserTonightExperience({
  mode,
  adapter,
  ownerScope,
  isOwnerCurrent,
}: {
  mode: TonightUiMode
  adapter: UserTonightAdapter
  ownerScope?: string | null
  isOwnerCurrent?: () => boolean
}) {
  const [data, setData] = useState<UserTonightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [rankedIds, setRankedIds] = useState<readonly string[]>([])
  const [explorerStage, setExplorerStage] = useState<'browse' | 'rank'>('browse')
  const [activeActivityIndex, setActiveActivityIndex] = useState(0)
  const [restoreBrowseFocus, setRestoreBrowseFocus] = useState(false)
  const [matchingConsentAccepted, setMatchingConsentAccepted] = useState(false)
  const [depositPolicyAccepted, setDepositPolicyAccepted] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [showArrivalHelp, setShowArrivalHelp] = useState(false)
  const [reportCategory, setReportCategory] = useState('safety')
  const [reportDescription, setReportDescription] = useState('')
  const rankHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const explorerHeadingRef = useRef<HTMLHeadingElement | null>(null)
  const explorerStateRef = useRef<{ fingerprint: string | null; rankedIds: readonly string[] }>({
    fingerprint: null,
    rankedIds: [],
  })
  const lifecycleGenerationRef = useRef(0)
  const draftKey = activityExplorerDraftKey(mode, ownerScope)

  useEffect(() => {
    const generation = lifecycleGenerationRef.current + 1
    lifecycleGenerationRef.current = generation
    return () => {
      if (lifecycleGenerationRef.current === generation) lifecycleGenerationRef.current += 1
    }
  }, [])

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setLoadError(null)
    try {
      const next = await adapter.load()
      setData(next)
      if (next.application?.choices.length === 3) {
        const applicationRanks = next.application.choices
          .slice()
          .sort((a, b) => a.rank - b.rank)
          .map((choice) => choice.activityId)
        explorerStateRef.current = {
          fingerprint: activityExplorerFingerprint(next),
          rankedIds: applicationRanks,
        }
        setRankedIds(applicationRanks)
      } else {
        const storedDraft = explorerStateRef.current.fingerprint === null
          ? loadActivityExplorerDraft(draftKey, next)
          : { draft: null, stale: false }
        const restoredDraft = storedDraft.draft
        const hadPriorSnapshot = explorerStateRef.current.fingerprint !== null || restoredDraft !== null || storedDraft.stale
        const reconciled = reconcileActivityExplorerState({
          next,
          previousFingerprint: restoredDraft?.fingerprint ?? explorerStateRef.current.fingerprint,
          previousRankedIds: restoredDraft?.rankedIds ?? explorerStateRef.current.rankedIds,
        })
        explorerStateRef.current = {
          fingerprint: reconciled.fingerprint,
          rankedIds: reconciled.rankedIds,
        }
        setRankedIds(reconciled.rankedIds)
        if (reconciled.reset && hadPriorSnapshot) {
          setMatchingConsentAccepted(false)
          setActiveActivityIndex(0)
          setNotice('오늘 회차 정보가 바뀌었어요. 활동과 순위를 다시 확인해 주세요.')
        }
      }
    } catch (error) {
      if (!silent) setLoadError(actionErrorMessage(error))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [adapter, draftKey])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!data || data.application || !draftKey || !isExactlyThreeUniqueActivityIds(rankedIds, data.activities)) return
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify({
        version: 1,
        fingerprint: activityExplorerFingerprint(data),
        rankedIds,
      }))
    } catch {
      // Session-only restoration is an enhancement; application remains safe without it.
    }
  }, [data, draftKey, rankedIds])

  useEffect(() => {
    if (explorerStage === 'rank') rankHeadingRef.current?.focus()
    if (explorerStage === 'browse' && restoreBrowseFocus) {
      explorerHeadingRef.current?.focus()
      setRestoreBrowseFocus(false)
    }
  }, [explorerStage, restoreBrowseFocus])

  const rankedActivities = useMemo(() => rankedIds, [rankedIds])

  const runAction = async (name: Exclude<BusyAction, null>, action: () => Promise<void>) => {
    setBusy(name)
    setActionError(null)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      setActionError(actionErrorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const submitApplication = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!data || !isExactlyThreeUniqueActivityIds(rankedActivities, data.activities) || !matchingConsentAccepted) return
    const submissionGeneration = lifecycleGenerationRef.current
    const isCurrentSubmission = () => (
      lifecycleGenerationRef.current === submissionGeneration
      && (isOwnerCurrent?.() ?? true)
    )
    void runAction('apply', async () => {
      await guardFreshActivityExplorerAction(
        () => adapter.load(),
        isCurrentSubmission,
        async (latest) => {
          const freshState = classifyFreshActivityExplorerSubmission({
            next: latest,
            expectedFingerprint: activityExplorerFingerprint(data),
            rankedIds: rankedActivities,
            hasExistingApplication: latest.application !== null,
          })
          if (freshState === 'existing_application' && latest.application) {
            const serverRankedIds = latest.application.choices
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((choice) => choice.activityId)
            explorerStateRef.current = {
              fingerprint: activityExplorerFingerprint(latest),
              rankedIds: serverRankedIds,
            }
            clearActivityExplorerDraft(draftKey)
            setData(latest)
            setRankedIds(serverRankedIds)
            setMatchingConsentAccepted(false)
            setNotice('이미 신청이 접수되어 최신 신청 상태를 보여드려요.')
            return
          }
          if (freshState === 'invalidated' || !isExactlyThreeUniqueActivityIds(rankedActivities, latest.activities)) {
            const reconciled = reconcileActivityExplorerState({
              next: latest,
              previousFingerprint: activityExplorerFingerprint(data),
              previousRankedIds: rankedActivities,
            })
            explorerStateRef.current = { fingerprint: reconciled.fingerprint, rankedIds: reconciled.rankedIds }
            setData(latest)
            setRankedIds(reconciled.rankedIds)
            setMatchingConsentAccepted(false)
            setActiveActivityIndex(0)
            setExplorerStage('browse')
            setNotice(canProgressTonightActivityExplorer(latest)
              ? '오늘 회차 정보가 바뀌었어요. 활동과 순위를 다시 확인해 주세요.'
              : '신청이 마감됐어요. 최신 회차 상태를 확인해 주세요.')
            return
          }
          if (!isCurrentSubmission()) return
          const next = await adapter.apply({
            roundId: latest.round.id,
            rankedActivityIds: rankedActivities as [string, string, string],
            matchingConsentAccepted: true,
            matchingConsentVersion: '2026-09-03',
          })
          if (!isCurrentSubmission()) return
          clearActivityExplorerDraft(draftKey)
          setData(next)
          setNotice('신청이 접수됐어요. 18:32에 팀 조합을 안내할게요.')
        },
      )
    })
  }

  if (loading) return <TonightPageShell eyebrow="PNU TONIGHT" title="오늘 밤, 같이 해볼래요?" description="부산대 인증자끼리 한 풀에서 만나고, 팀이 함께할 활동을 정해요."><LoadingPanel /></TonightPageShell>
  if (loadError || !data) {
    return (
      <TonightPageShell eyebrow="PNU TONIGHT" title="오늘 밤, 같이 해볼래요?" description="부산대 인증자만 참여하는 당일 5~6인 모임이에요.">
        <ErrorPanel message={loadError ?? '오늘 회차가 아직 준비되지 않았어요.'} onRetry={() => void load()} />
      </TonightPageShell>
    )
  }

  if (!isExactlyThreeUniqueActivityIds(data.activities.map((activity) => activity.id), data.activities)) {
    return (
      <TonightPageShell eyebrow="PNU TONIGHT" title="오늘 활동 정보를 다시 확인해 주세요" description="활동 세 가지를 안전하게 확인하지 못했어요.">
        <ErrorPanel message="오늘 활동 정보를 불러오지 못했어요. 다시 시도해 주세요." onRetry={() => void load()} />
      </TonightPageShell>
    )
  }

  const application = data.application
  const journey = data.journey
  const financialState = {
    applicationStatus: application?.status ?? null,
    roundStatus: data.round.status,
    teamStatus: journey?.teamStatus ?? null,
    depositStatus: application?.deposit?.status ?? null,
    refundStatus: application?.deposit?.refundStatus ?? null,
  }
  const canDeposit = Boolean(journey?.teamId && canBeginTonightDeposit(financialState))
  const canRefund = Boolean(journey?.teamId && canRequestTonightRefund(financialState))
  const financialNextAction = tonightFinancialNextAction(financialState)
  const terminalRound = ['completed', 'cancelled'].includes(data.round.status)
  const refundReadOnlyTitle = application?.deposit?.refundStatus
    || ['held', 'refund_requested', 'refunded', 'forfeited', 'reconciliation_required', 'cancelled'].includes(application?.deposit?.status ?? '')
    || ['completed', 'cancelled'].includes(data.round.status)
    ? financialNextAction
    : '현재 단계의 환불은 운영자 검토로 처리돼요'
  const canArrive = Boolean(
    journey?.teamId
      && journey.attendanceRevision !== null
      && journey.canMarkArrival,
  )

  if (!application) {
    const canProgress = canProgressTonightActivityExplorer(data)
    return (
      <main className="min-h-screen overflow-x-hidden bg-[#fff9f6] pb-24 text-[#292321] lg:pb-10">
        <div className="mx-auto w-full max-w-[1152px] px-4 py-5 sm:px-6 sm:py-8">
          {mode === 'rehearsal' && <RehearsalBanner />}
          {actionError && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {actionError}
            </div>
          )}
          {notice && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900" role="status" aria-live="polite">
              <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {notice}
            </div>
          )}

          {explorerStage === 'browse' ? (
            <TonightActivityExplorer
              activities={data.activities}
              activeIndex={activeActivityIndex}
              onActiveIndexChange={setActiveActivityIndex}
              onContinue={() => setExplorerStage('rank')}
              headingRef={explorerHeadingRef}
              disabled={!canProgress || busy !== null}
            />
          ) : (
            <form onSubmit={submitApplication} className="mx-auto max-w-[752px] space-y-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black tracking-[0.14em] text-[#b94b3f]">PNU TONIGHT · 순위 확인</p>
                  <h1 ref={rankHeadingRef} tabIndex={-1} className="mt-1 text-[28px] font-black tracking-[-0.05em] outline-none sm:text-4xl">세 활동을 1·2·3순위로 정해 주세요</h1>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">신청 전까지는 언제든 다시 둘러보고 순서를 바꿀 수 있어요.</p>
                </div>
                <StatusPill tone={canProgress ? 'good' : 'warn'}>{canProgress ? '지금 신청 가능' : '오늘 신청 마감'}</StatusPill>
              </header>
              <button type="button" onClick={() => { setRestoreBrowseFocus(true); setExplorerStage('browse') }} className="min-h-11 rounded-2xl border border-[#ead9d2] bg-white px-4 text-sm font-black text-[#665c58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f]">활동 다시 둘러보기</button>
              <section className={`${PEACH_PANEL} p-4 sm:p-6`}>
                <ActivityRanker
                  activities={data.activities}
                  rankedIds={rankedIds}
                  onChange={(ids) => {
                    explorerStateRef.current = { ...explorerStateRef.current, rankedIds: ids }
                    setRankedIds(ids)
                  }}
                  disabled={!canProgress || busy !== null}
                />
              </section>
              <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
                <p className="mb-4 text-sm font-semibold leading-6 text-[#665c58]">신청 뒤 일회용 링크를 최대 2개 만들어 친구를 안전하게 초대할 수 있어요.</p>
                <label className="flex cursor-pointer items-start gap-3 rounded-2xl bg-[#fff5f1] p-4 text-sm font-bold leading-6 text-[#4d4541]">
                  <input
                    type="checkbox"
                    checked={matchingConsentAccepted}
                    onChange={(event) => setMatchingConsentAccepted(event.target.checked)}
                    required
                    disabled={!canProgress || busy !== null}
                    className="mt-1 h-5 w-5 shrink-0 accent-[#b94b3f]"
                  />
                  <span>
                    나이와 비공개 외모 점수가 팀 균형 편성에 내부적으로 사용되며, 점수는 다른 참가자에게 공개되지 않습니다.
                    <span className="mt-1 block text-xs font-semibold text-[#8b7e78]">세 활동 모두 참여 가능하며 최종 활동은 팀 순위 합산으로 결정됩니다.</span>
                  </span>
                </label>
                <PrimaryButton type="submit" className="mt-5 sm:w-full" disabled={!canProgress || !matchingConsentAccepted || busy !== null}>
                  {busy === 'apply' ? '신청하는 중…' : '이 순서로 오늘밤 신청'}
                </PrimaryButton>
              </section>
            </form>
          )}

          <details className="mx-auto mt-5 max-w-[752px] rounded-2xl border border-[#ead9d2] bg-white px-4 py-3">
            <summary className="cursor-pointer text-sm font-black text-[#665c58]">오늘 진행 순서 보기</summary>
            <div className="mt-4"><Timeline data={data} /></div>
          </details>
          <div className="mx-auto mt-3 flex max-w-[752px] justify-end">
            <button type="button" onClick={() => void load()} disabled={loading || busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-[#665c58] hover:bg-white disabled:opacity-40">
              <RefreshCw className="h-4 w-4" aria-hidden />
              다시 불러오기
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <TonightPageShell
      eyebrow="PNU TONIGHT · 부산대 인증자 전용"
      title={terminalRound ? '지난 회차 보증금 상태를 확인해요' : application ? '오늘 만남이 준비되고 있어요' : '오늘 밤, 무엇을 같이 해볼까요?'}
      description={terminalRound
        ? '처리가 끝날 때까지 지난 회차의 결제·환불 진행 상태를 이 화면에서 놓치지 않게 안내합니다.'
        : application
        ? '한 화면에서 팀 편성, 보증금, 장소 공개, 도착까지 다음 행동만 차례대로 안내할게요.'
        : '사진을 눌러 하고 싶은 순서를 정해 주세요. 기본은 남 3명 · 여 2명이고, 여성 친구 3명이 함께 신청한 경우에만 남 3명 · 여 3명으로 편성돼요.'}
    >
      {mode === 'rehearsal' && <RehearsalBanner />}
      <section className={`${PEACH_PANEL} mb-4 p-4 sm:p-5`} aria-labelledby="tonight-participation-title">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#b94b3f]" aria-hidden />
          <h2 id="tonight-participation-title" className="font-black">
            현재 신청 총 {data.participationSummary.totalPeople}명
          </h2>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <p className="rounded-xl bg-[#fff5f1] px-2 py-3 text-xs font-bold text-[#6f625d]">
            남성 <strong className="mt-1 block text-lg text-[#292321]">{data.participationSummary.genderBreakdown.malePeople}명</strong>
          </p>
          <p className="rounded-xl bg-[#fff5f1] px-2 py-3 text-xs font-bold text-[#6f625d]">
            여성 <strong className="mt-1 block text-lg text-[#292321]">{data.participationSummary.genderBreakdown.femalePeople}명</strong>
          </p>
          <p className="rounded-xl bg-[#fff5f1] px-2 py-3 text-xs font-bold text-[#6f625d]">
            기타·미확인 <strong className="mt-1 block text-lg text-[#292321]">{data.participationSummary.genderBreakdown.otherOrUnspecifiedPeople}명</strong>
          </p>
        </div>
        <p className="mt-3 text-xs font-semibold leading-5 text-[#8b7e78]">
          유효한 신청자 전체 기준이며, 가입 시 등록한 성별 분류를 그대로 합산해요. 취소한 신청은 제외됩니다.
        </p>
      </section>
      {mode === 'live' && application && (
        <TonightNotificationControl audience="participant" onRefresh={() => load(true)} />
      )}
      <Timeline data={data} />
      {mode === 'live' && data.round.status === 'completed' && journey?.teamId && (
        <TonightContinuationEntry key={journey.teamId} teamId={journey.teamId} isOwnerCurrent={isOwnerCurrent} />
      )}
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => void load()} disabled={loading || busy !== null} className="inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-black text-[#665c58] hover:bg-white disabled:opacity-40">
          <RefreshCw className="h-4 w-4" aria-hidden />
          다시 불러오기
        </button>
      </div>

      {actionError && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {actionError}
        </div>
      )}
      {notice && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900" role="status" aria-live="polite">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(330px,0.9fr)]">
          <div className="space-y-5">
            <section className={`${PEACH_PANEL} overflow-hidden`}>
              <div className="bg-[#292321] px-5 py-6 text-white sm:px-6">
                <p className="text-xs font-black tracking-[0.12em] text-[#ffcbbb]">지금 해야 할 일</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                  {journey?.canRevealExactVenue && !['completed', 'cancelled'].includes(data.round.status)
                    ? '팀 번호와 장소를 확인해 주세요'
                    : financialNextAction}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/70">
                  {journey?.activityTitle ? `활동 후보 · ${journey.activityTitle}` : '팀의 1순위 활동을 합산해 안내해요.'}
                </p>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-[#fff5f1] p-4">
                    <p className="text-xs font-black text-[#8b7e78]">신청 상태</p>
                    <p className="mt-1 font-black">{applicationStatusLabel(application.status)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#fff5f1] p-4">
                    <p className="text-xs font-black text-[#8b7e78]">보증금</p>
                    <p className="mt-1 font-black">
                      {application.deposit
                        ? `${application.deposit.amount.toLocaleString('ko-KR')}원 · ${depositStatusLabel(application.deposit.status)}`
                        : '결제 전'}
                    </p>
                    {application.deposit?.refundStatus && (
                      <p className="mt-1 text-xs font-bold text-[#b94b3f]">환불 · {refundStatusLabel(application.deposit.refundStatus)}</p>
                    )}
                  </div>
                </div>

                {application.bundle && (
                  <div className="flex items-center justify-between rounded-2xl border border-[#ead9d2] px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-sm font-black"><Link2 className="h-4 w-4 text-[#b94b3f]" aria-hidden />친구 동행 묶음</span>
                    <span className="text-sm font-black text-[#b94b3f]">{application.bundle.memberCount}명 함께</span>
                  </div>
                )}

                {canDeposit && application && (
                  <div className="space-y-3 rounded-2xl border border-[#ead9d2] bg-[#fffaf7] p-4">
                    <div>
                      <p className="text-sm font-black">결제 전 보증금 정책 확인</p>
                      <ul className="mt-2 space-y-1.5 text-xs font-semibold leading-5 text-[#6f625d]">
                        {TONIGHT_DEPOSIT_POLICY_ITEMS.map((item) => <li key={item}>· {item}</li>)}
                      </ul>
                    </div>
                    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-[#fff0ea] p-3 text-sm font-bold leading-5 text-[#4d4541]">
                      <input
                        type="checkbox"
                        checked={depositPolicyAccepted}
                        onChange={(event) => setDepositPolicyAccepted(event.target.checked)}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-[#b94b3f]"
                      />
                      <span>보증금 정책을 확인했으며 결제에 동의합니다.</span>
                    </label>
                    <PrimaryButton
                      disabled={!depositPolicyAccepted || busy !== null}
                      className="sm:w-full"
                      onClick={() => void runAction('deposit', async () => {
                        await adapter.beginDeposit({
                          applicationId: application.id,
                          depositPolicyAccepted: true,
                          depositPolicyVersion: TONIGHT_DEPOSIT_POLICY_VERSION,
                          depositPolicyHash: TONIGHT_DEPOSIT_POLICY_HASH,
                        })
                        setNotice(mode === 'rehearsal' ? '체험 결제가 완료된 상태로 바뀌었어요.' : '결제창을 열었어요.')
                        if (mode === 'rehearsal') setData(await adapter.load())
                      })}
                    >
                      <Banknote className="h-4 w-4" aria-hidden />
                      {busy === 'deposit' ? '결제 준비 중…' : '보증금 10,000원 결제하고 자리 확정'}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            </section>

            {application.bundle && (
              <FriendInviteSharePanel
                roundId={data.round.id}
                memberCount={application.bundle.memberCount}
                mode={mode}
                disabled={!data.applicationsOpen || application.bundle.status !== 'forming'}
              />
            )}

            <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fce9e4] text-[#b94b3f]">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="font-black">{journey?.canRevealExactVenue ? '공개된 팀 번호·업장·주소는 같은 원장에서 읽어요' : '18:55 전에는 정확한 팀·업장·주소를 숨겨요'}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">
                    {journey?.canRevealExactVenue
                      ? '사용자·업장·운영자가 같은 고유 팀 번호와 장소를 확인해 현장 혼선을 막습니다.'
                      : '배정 인원 전원의 보증금과 업장 수락이 모두 끝난 뒤 한 번에 공개해 현장 혼선을 막습니다.'}
                  </p>
                </div>
              </div>

              {journey?.canRevealExactVenue && journey.teamCode && journey.place ? (
                <div className="mt-5 space-y-4">
                  <div className="rounded-[24px] bg-[#292321] p-5 text-white">
                    <p className="text-xs font-black tracking-[0.12em] text-[#ffcbbb]">현장에서 이렇게 말해 주세요</p>
                    <p className="mt-2 text-3xl font-black tracking-[-0.05em]">{journey.teamCode}</p>
                    <p className="mt-2 text-sm font-semibold text-white/70">업장 직원에게 이 고유 팀 번호를 보여주세요.</p>
                  </div>
                  {journey.place.coordinates ? (
                    <PlaceMap place={journey.place} />
                  ) : (
                    <div className="rounded-2xl border border-[#ead9d2] p-4">
                      <p className="font-black">{journey.place.displayName}</p>
                      <p className="mt-1 text-sm font-semibold text-[#8b7e78]">{journey.place.address?.road ?? journey.place.areaLabel}</p>
                      <PlaceLinks place={journey.place} className="mt-3" />
                    </div>
                  )}
                  <PrimaryButton
                    disabled={!canArrive || busy !== null}
                    className="sm:w-full"
                    onClick={() => {
                      if (!journey.teamId || journey.attendanceRevision === null) return
                      void runAction('arrival', async () => {
                        const next = await adapter.markArrival({
                          teamId: journey.teamId!,
                          expectedRevision: journey.attendanceRevision!,
                        })
                        setData(next)
                        setNotice('도착 상태가 업장과 운영자에게 전달됐어요.')
                      })
                    }}
                  >
                    <MapPin className="h-4 w-4" aria-hidden />
                    {busy === 'arrival'
                      ? '도착 처리 중…'
                      : journey.attendanceStatus === 'arrived'
                        ? '도착 확인 완료'
                        : journey.canMarkArrival
                          ? '도착했어요'
                          : '19:20부터 도착 확인'}
                  </PrimaryButton>
                  <div className="rounded-[24px] border border-[#ead9d2] bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">현장에서 못 찾겠어요</p>
                        <p className="mt-1 text-sm font-semibold leading-5 text-[#8b7e78]">연락처를 공유하지 않고 팀 번호로 업장과 운영자에게 도움을 요청해요.</p>
                      </div>
                      {!data.arrivalHelpRequest && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => setShowArrivalHelp((current) => !current)}
                          className="min-h-11 shrink-0 rounded-2xl border border-[#d85c4d] px-4 text-sm font-black text-[#b94b3f] disabled:opacity-50"
                        >
                          못 찾겠어요
                        </button>
                      )}
                    </div>

                    {data.arrivalHelpRequest ? (
                      <div className="mt-4 rounded-2xl bg-[#fff7f3] p-4" aria-live="polite">
                        <p className="text-sm font-black text-[#b94b3f]">도움 요청 접수 · {journey.teamCode}</p>
                        <p className="mt-2 text-sm font-bold leading-6">{data.arrivalHelpRequest.nextAction}</p>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void runAction('arrivalHelp', async () => {
                            const next = await adapter.cancelArrivalHelp({
                              requestId: data.arrivalHelpRequest!.requestId,
                              expectedRevision: data.arrivalHelpRequest!.revision,
                            })
                            setData(next)
                            setShowArrivalHelp(false)
                            setNotice('도움 요청을 종료했어요.')
                          })}
                          className="mt-3 min-h-11 w-full rounded-2xl bg-white px-4 text-sm font-black text-[#5b514d] shadow-sm disabled:opacity-50"
                        >
                          {busy === 'arrivalHelp' ? '처리 중…' : '이제 찾았어요'}
                        </button>
                      </div>
                    ) : showArrivalHelp ? (
                      <div className="mt-4 grid gap-2" role="group" aria-label="현장 도움 종류 선택">
                        {([
                          ['entrance', '입구를 못 찾겠어요'],
                          ['team', '우리 팀을 못 찾겠어요'],
                          ['venue', '정확한 업장을 못 찾겠어요'],
                        ] as const).map(([category, label]) => (
                          <button
                            key={category}
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void runAction('arrivalHelp', async () => {
                              const next = await adapter.requestArrivalHelp({ teamId: journey.teamId!, category })
                              setData(next)
                              setShowArrivalHelp(false)
                              setNotice('업장과 운영자에게 도움 요청을 보냈어요.')
                            })}
                            className="min-h-14 rounded-2xl border border-[#ead9d2] bg-[#fffaf7] px-4 text-left text-sm font-black hover:border-[#d85c4d] disabled:opacity-50"
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-[#d8c3ba] bg-[#fffaf7] p-6 text-center">
                  <MapPin className="mx-auto h-7 w-7 text-[#b94b3f]" aria-hidden />
                  <p className="mt-3 font-black">팀 번호와 장소는 {formatKoreanTime(data.round.revealAt)}에 공개돼요</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-[#8b7e78]">공개 전에는 후보 장소나 임시 팀 번호를 보여주지 않아요.</p>
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-5">
            <section className={`${PEACH_PANEL} p-5`}>
              <h2 className="font-black">문제가 생겼나요?</h2>
              <p className="mt-1 text-sm font-semibold leading-5 text-[#8b7e78]">신고와 환불 요청은 서로 분리해 처리하고 진행 상태를 남겨요.</p>
              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  disabled={!journey?.teamId || busy !== null}
                  aria-describedby="tonight-report-unavailable"
                  onClick={() => setShowReport((value) => !value)}
                  className="flex min-h-11 items-center justify-between rounded-xl border border-[#ead9d2] px-4 text-sm font-black hover:bg-[#fff7f3] disabled:cursor-not-allowed disabled:bg-[#f8f3f0] disabled:text-[#9b8f89] disabled:hover:bg-[#f8f3f0]"
                >
                  <span className="inline-flex items-center gap-2"><Flag className="h-4 w-4 text-[#b94b3f]" aria-hidden />안전 문제 신고</span>
                  <span aria-hidden>{showReport ? '−' : '+'}</span>
                </button>
                {!journey?.teamId && (
                  <div id="tonight-report-unavailable" className="rounded-2xl bg-[#fff7f3] p-4 text-sm font-semibold leading-6 text-[#665c58]" role="status">
                    <p className="font-black text-[#292321]">팀 편성 전에는 오늘밤 팀 신고를 접수할 수 없어요.</p>
                    <p className="mt-1">긴급한 위험이 있다면 앱 접수를 기다리지 말고 아래 번호로 바로 연락해 주세요.</p>
                    <div className="mt-3 flex gap-2">
                      <a href="tel:112" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#b94b3f] bg-white font-black text-[#b94b3f]">경찰 112</a>
                      <a href="tel:119" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-[#b94b3f] bg-white font-black text-[#b94b3f]">구급·소방 119</a>
                    </div>
                  </div>
                )}
                {showReport && journey?.teamId && (
                  <form
                    className="rounded-2xl bg-[#fff7f3] p-4"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!journey.teamId || !reportDescription.trim()) return
                      void runAction('report', async () => {
                        await adapter.report({
                          teamId: journey.teamId!,
                          category: reportCategory,
                          description: reportDescription.trim(),
                        })
                        setShowReport(false)
                        setReportDescription('')
                        setNotice('신고가 접수됐어요. 운영자가 확인할게요.')
                      })
                    }}
                  >
                    <label htmlFor="tonight-report-category" className="text-sm font-black">신고 유형</label>
                    <select id="tonight-report-category" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-bold">
                      <option value="safety">안전 문제</option>
                      <option value="harassment">불쾌한 언행</option>
                      <option value="no_show">상대 미도착</option>
                      <option value="other">기타</option>
                    </select>
                    <label htmlFor="tonight-report-description" className="mt-3 block text-sm font-black">상황 설명</label>
                    <textarea id="tonight-report-description" value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} maxLength={500} required className="mt-2 min-h-24 w-full rounded-xl border border-[#ddcbc3] bg-white p-3 text-sm font-semibold" />
                    <PrimaryButton type="submit" disabled={busy !== null || !reportDescription.trim()} className="mt-3 sm:w-full">
                      {busy === 'report' ? '신고 접수 중…' : '이 내용으로 신고 접수'}
                    </PrimaryButton>
                  </form>
                )}

                {canRefund && <button type="button" onClick={() => setShowRefund((value) => !value)} className="flex min-h-11 items-center justify-between rounded-xl border border-[#ead9d2] px-4 text-sm font-black hover:bg-[#fff7f3]">
                  <span className="inline-flex items-center gap-2"><Banknote className="h-4 w-4 text-[#b94b3f]" aria-hidden />보증금 환불 요청</span>
                  <span aria-hidden>{showRefund ? '−' : '+'}</span>
                </button>}
                {canRefund && showRefund && application.deposit && (
                  <div className="rounded-2xl bg-[#fff7f3] p-4">
                    <p className="text-xs font-semibold leading-5 text-[#665c58]">요청 즉시 환불을 확정하지 않아요. 참석·취소 시각을 확인한 뒤 결과를 안내합니다.</p>
                    <PrimaryButton
                      disabled={busy !== null}
                      className="mt-3 sm:w-full"
                      onClick={() => void runAction('refund', async () => {
                        await adapter.requestRefund({
                          applicationId: application.id,
                          expectedDepositRevision: application.deposit!.revision,
                        })
                        setShowRefund(false)
                        setNotice('환불 검토 요청이 접수됐어요.')
                      })}
                    >
                      {busy === 'refund' ? '요청 중…' : '환불 검토 요청 보내기'}
                    </PrimaryButton>
                  </div>
                )}
                {!canRefund && application.deposit && (
                  <div className="rounded-2xl bg-[#fff7f3] p-4 text-sm font-semibold leading-5 text-[#665c58]">
                    <p className="font-black text-[#292321]">{refundReadOnlyTitle}</p>
                    <p className="mt-1">현재 단계에서는 새 결제나 중복 환불 요청을 열지 않아요. 상태가 바뀌면 이 화면에 반영됩니다.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>
      </div>
    </TonightPageShell>
  )
}
