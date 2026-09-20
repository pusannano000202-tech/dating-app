'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
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
import MeetingCoachingCards from '@/components/matching/MeetingCoachingCards'
import { useCalendarReadiness } from '@/components/matching/CalendarReadinessGate'
import TonightPreparationGate from './TonightPreparationGate'
import { tonightPrimaryAction } from './tonight-primary-action'
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
import { canShowTonightMeetingCoaching, formatTonightCount, isTonightSnapshotFresh, tonightServiceDateLabel, tonightRecruitmentState } from './tonight-journey-state'
import { isTonightRoundUnavailable, TonightAccessError, tonightLoadFailureAction } from './tonight-journey-errors'
import styles from './tonight-journey.module.css'

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
    { at: data.round.depositDueAt, label: '보증금 마감', detail: '배정 후 각자 결제' },
    { at: data.round.revealAt, label: '장소 공개', detail: '업장·팀 번호 확인' },
    { at: data.round.arrivalAt, label: '도착 확인', detail: '현장에서 체크인' },
    { at: data.round.startsAt, label: '모임 시작', detail: '활동 안내 확인' },
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

function TonightParticipation({ data, mode, fresh, now }: { data: UserTonightData; mode: TonightUiMode; fresh: boolean; now: number }) {
  const summary = data.participationSummary
  const asOf = Date.parse(summary?.asOf ?? '')
  const timely = mode === 'rehearsal' || fresh && Number.isFinite(asOf) && now - asOf < 75_000 && now - asOf >= -60_000
  const sameRound = timely && summary?.scopeId === `tonight:${data.round.id}` && summary.basis === 'valid_applicants'
  return (
    <section className={styles.participation} aria-label="이번 회차 신청 현황">
      <div className="flex items-center justify-between gap-3 text-xs font-bold text-[#75665c]">
        <span>{mode === 'rehearsal' ? '체험용 회차 집계' : !timely ? '신청 인원 재확인 필요' : '이번 회차 신청 현황'}</span>
        <span>총 {formatTonightCount(sameRound ? summary?.totalPeople : null, '명')}</span>
      </div>
      <dl className={styles.stats}>
        <div><dt>남성 신청</dt><dd>{formatTonightCount(sameRound ? summary?.genderBreakdown.malePeople : null, '명')}</dd></div>
        <div><dt>여성 신청</dt><dd>{formatTonightCount(sameRound ? summary?.genderBreakdown.femalePeople : null, '명')}</dd></div>
        <div><dt>편성된 팀</dt><dd>{formatTonightCount(timely ? data.roundStats?.teamCount : null, '팀')}</dd></div>
      </dl>
      <p className={styles.statsNote}>기타·미확인 {formatTonightCount(sameRound ? summary?.genderBreakdown.otherOrUnspecifiedPeople : null, '명')} 포함 · 취소를 제외한 유효 신청 기준</p>
      {mode === 'live' ? <p className={styles.statsNote}>{timely && summary ? `${formatKoreanTime(summary.asOf)} 조회 · 30초마다 갱신` : '최신 인원을 확인하지 못했어요. 다시 불러와 주세요.'}</p> : null}
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
  // Use the existing readiness contract; never replace an existing receipt with onboarding.
  const readiness = useCalendarReadiness(mode === 'live', ownerScope ?? null)
  const dataRef = useRef<UserTonightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [roundUnavailable, setRoundUnavailable] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [rankedIds, setRankedIds] = useState<readonly string[]>([])
  const [explorerStage, setExplorerStage] = useState<'browse' | 'rank' | 'guide'>('browse')
  const [activePanel, setActivePanel] = useState<'next' | 'place' | 'guide' | 'help'>('next')
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [verifiedAt,setVerifiedAt] = useState<number|null>(null)
  const [refreshFailed,setRefreshFailed] = useState(false)
  const [refreshing,setRefreshing] = useState(false)
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
  const requestGenerationRef = useRef(0)
  const requestPendingRef = useRef(false)
  const readControllerRef = useRef<AbortController | null>(null)
  const ownerGuardRef = useRef(isOwnerCurrent)
  ownerGuardRef.current = isOwnerCurrent
  const busyRef = useRef(busy)
  busyRef.current = busy
  const draftKey = activityExplorerDraftKey(mode, ownerScope)
  const acceptData = useCallback((next: UserTonightData) => {
    if (ownerGuardRef.current?.() === false) return
    dataRef.current = next
    setData(next)
    setLoadError(null)
    setVerifiedAt(Date.now())
    setRefreshFailed(false)
  }, [])

  useEffect(() => {
    const generation = lifecycleGenerationRef.current + 1
    lifecycleGenerationRef.current = generation
    return () => {
      if (lifecycleGenerationRef.current === generation) lifecycleGenerationRef.current += 1
    }
  }, [])

  const load = useCallback(async (silent = false) => {
    const lifecycle = lifecycleGenerationRef.current
    const request = ++requestGenerationRef.current
    const current = () => lifecycle === lifecycleGenerationRef.current && request === requestGenerationRef.current && ownerGuardRef.current?.() !== false
    readControllerRef.current?.abort()
    const readController = new AbortController()
    readControllerRef.current = readController
    requestPendingRef.current = true
    setRefreshing(true)
    if (!silent) setLoading(dataRef.current === null)
    if (!silent) setLoadError(null)
    if (!silent) setRoundUnavailable(false)
    try {
      const next = await adapter.load({ signal: readController.signal })
      if (!current()) return
      acceptData(next)
      setRoundUnavailable(false)
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
      if (!current()) return
      setRefreshFailed(true)
      const failureAction = tonightLoadFailureAction(dataRef.current, error)
      if (failureAction === 'unavailable') {
        dataRef.current = null
        setData(null)
        setLoadError(null)
        setRoundUnavailable(true)
      } else {
        setRoundUnavailable(false)
        if (failureAction === 'error') { dataRef.current = null; setData(null) }
        setLoadError(isTonightRoundUnavailable(error)
          ? '최신 회차를 확인하지 못했어요. 마지막으로 확인한 내 신청을 표시하고 있어요.'
          : actionErrorMessage(error))
      }
    } finally {
      if (readControllerRef.current === readController) readControllerRef.current = null
      if (current()) {requestPendingRef.current=false;setRefreshing(false);setLoading(false)}
    }
  }, [adapter, draftKey, acceptData])

  useEffect(() => {
    void load()
    if(mode !== 'live')return () => { requestGenerationRef.current += 1; readControllerRef.current?.abort() }
    const refresh=()=>{if(document.visibilityState==='visible'&&!requestPendingRef.current&&!busyRef.current)void load(true)}
    const timer=window.setInterval(refresh,30_000)
    window.addEventListener('focus',refresh)
    document.addEventListener('visibilitychange',refresh)
    return()=>{requestGenerationRef.current+=1;readControllerRef.current?.abort();requestPendingRef.current=false;window.clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh)}
  }, [load,mode])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 10_000)
    return () => window.clearInterval(timer)
  }, [])

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
    requestGenerationRef.current+=1
    readControllerRef.current?.abort()
    requestPendingRef.current=false
    setRefreshing(false)
    setBusy(name)
    setActionError(null)
    setNotice(null)
    try {
      await action()
    } catch (error) {
      if (error instanceof TonightAccessError) {
        requestGenerationRef.current += 1
        readControllerRef.current?.abort()
        requestPendingRef.current = false
        dataRef.current = null
        setData(null)
        setVerifiedAt(null)
        setRefreshFailed(true)
        setRefreshing(false)
        setLoading(false)
        setRoundUnavailable(false)
        setLoadError(actionErrorMessage(error))
      }
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
      if (mode === 'live' && !await readiness.check()) {
        if (isCurrentSubmission()) setActionError('남은 참가 준비를 확인해 주세요. 선택한 활동 순위는 유지했어요.')
        return
      }
      if (!isCurrentSubmission()) return
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
            acceptData(latest)
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
            acceptData(latest)
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
          acceptData(next)
          setNotice(`신청이 접수됐어요. ${formatKoreanTime(next.round.allocationPublishAt)}에 팀 조합을 안내할게요.`)
        },
      )
    })
  }

  if (loading) return <TonightPageShell eyebrow="PNU TONIGHT" title="오늘 밤, 같이 해볼래요?" description="부산대 인증자끼리 한 풀에서 만나고, 팀이 함께할 활동을 정해요."><LoadingPanel /></TonightPageShell>
  if (roundUnavailable) {
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href="/match" className={styles.back}><ArrowLeft size={17} aria-hidden />매칭</Link>
          <header className={styles.heading}><p className={styles.eyebrow}>PNU TONIGHT</p><h1 className={styles.title}>오늘밤 만나기</h1></header>
          <section className="mx-auto max-w-[680px] rounded-[24px] border border-[#e9e0d8] bg-[#fffdfb] px-6 py-9 sm:p-10" role="status">
            <CalendarClock className="h-9 w-9 text-[#b44733]" aria-hidden />
            <h2 className="mt-5 text-2xl font-black leading-snug tracking-[-0.04em]">오늘 모집이 아직 열리지 않았어요</h2>
            <p className="mt-3 text-sm font-semibold leading-7 text-[#7b6c62]">모집이 열리면 이곳에서 활동과 신청 현황을 확인할 수 있어요. 다른 날짜의 만남도 둘러보세요.</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <Link href="/match/calendar" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#b44733] px-4 text-sm font-black text-white">이벤트 캘린더 보기<ArrowRight size={17} aria-hidden /></Link>
              <Link href="/match" className="flex min-h-12 items-center justify-center rounded-xl border border-[#e9e0d8] px-4 text-sm font-black text-[#75665c]">매칭으로 돌아가기</Link>
            </div>
            <button type="button" onClick={() => void load()} className="mt-5 inline-flex min-h-11 items-center gap-2 text-xs font-bold text-[#8a7366]"><RefreshCw size={15} aria-hidden />모집 상태 다시 확인</button>
          </section>
        </div>
      </main>
    )
  }
  if (!data) {
    return (
      <TonightPageShell eyebrow="PNU TONIGHT" title="오늘 밤, 같이 해볼래요?" description="부산대 인증자만 참여하는 당일 5~6인 모임이에요.">
        <ErrorPanel message={loadError ?? '오늘 회차가 아직 준비되지 않았어요.'} onRetry={() => void load()} />
        {mode === 'live' && <div className="mt-5"><TonightPreparationGate value={readiness.value} onRetry={readiness.check} /></div>}
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
  const snapshotFresh = mode === 'rehearsal' || isTonightSnapshotFresh(verifiedAt, Math.max(clockNow, verifiedAt ?? 0), refreshFailed)
  const canUseArrivalHelp = snapshotFresh && !refreshing && data.arrivalHelpAvailable !== false
  const recruitment = tonightRecruitmentState(data, clockNow, snapshotFresh)
  const recruitmentLabel = {
    open: '지금 신청 가능', upcoming: '아직 신청 시작 전이에요', closed: '오늘 신청이 마감됐어요',
    paused: '현재 새 신청을 받지 않아요', unavailable: '최신 신청 상태 확인이 필요해요',
  }[recruitment]
  const financialState = {
    applicationStatus: application?.status ?? null,
    roundStatus: data.round.status,
    teamStatus: journey?.teamStatus ?? null,
    depositStatus: application?.deposit?.status ?? null,
    refundStatus: application?.deposit?.refundStatus ?? null,
  }
  const canDeposit = Boolean(snapshotFresh && journey?.teamId && canBeginTonightDeposit(financialState))
  const canRefund = Boolean(snapshotFresh && journey?.teamId && canRequestTonightRefund(financialState))
  const financialNextAction = tonightFinancialNextAction(financialState)
  const terminalRound = ['completed', 'cancelled'].includes(data.round.status)
  const refundReadOnlyTitle = application?.deposit?.refundStatus
    || ['held', 'refund_requested', 'refunded', 'forfeited', 'reconciliation_required', 'cancelled'].includes(application?.deposit?.status ?? '')
    || ['completed', 'cancelled'].includes(data.round.status)
    ? financialNextAction
    : '현재 단계의 환불은 운영자 검토로 처리돼요'
  const canArrive = Boolean(
    snapshotFresh && journey?.teamId
      && journey.attendanceRevision !== null
      && journey.canMarkArrival,
  )
  const coachingUnlocked = mode === 'live' && snapshotFresh && !refreshing && canShowTonightMeetingCoaching(data, clockNow)
  const matchedActivities = data.activities.filter(activity => activity.title === journey?.activityTitle)
  const matchedActivityKind = matchedActivities.length === 1 ? matchedActivities[0].kind : undefined
  const primaryAction = tonightPrimaryAction(data, clockNow, snapshotFresh)
  const selectPanel = (panel: typeof activePanel) => {
    setActivePanel(panel)
    setClockNow(Date.now())
    if (panel === 'guide') void load(true)
  }

  if (!application) {
    const canProgress = recruitment === 'open' && canProgressTonightActivityExplorer(data)
    return (
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href="/match" className={styles.back}><ArrowLeft size={17} aria-hidden />매칭</Link>
          {mode === 'rehearsal' && <RehearsalBanner />}
          {loadError && <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">{loadError} 이전 조회 결과를 표시하며, 신청은 최신 확인 뒤 이어갈 수 있어요.</p>}
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
              onContinue={() => { setExplorerStage('rank'); if (mode === 'live') void readiness.check() }}
              headingRef={explorerHeadingRef}
              disabled={!canProgress || busy !== null}
              disabledReason={busy ? '요청을 처리하고 있어요' : recruitmentLabel}
              dateLabel={tonightServiceDateLabel(data.round.serviceDate)}
              summary={<TonightParticipation data={data} mode={mode} fresh={snapshotFresh} now={Math.max(clockNow,verifiedAt??0)} />}
              onPreview={() => setExplorerStage('guide')}
            />
          ) : explorerStage === 'guide' ? (
            <div className={styles.focused}>
              <button type="button" className={styles.back} onClick={() => { setRestoreBrowseFocus(true); setExplorerStage('browse') }}><ArrowLeft size={17} aria-hidden />활동 다시 둘러보기</button>
              <MeetingCoachingCards audience="singles" preview unlocked={false} activityKind={data.activities[activeActivityIndex]?.kind} />
            </div>
          ) : (
            <form onSubmit={submitApplication} className="mx-auto max-w-[752px] space-y-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black tracking-[0.14em] text-[#b94b3f]">{tonightServiceDateLabel(data.round.serviceDate)} · 순위 확인</p>
                  <h1 ref={rankHeadingRef} tabIndex={-1} className="mt-1 text-[28px] font-black tracking-[-0.05em] outline-none sm:text-4xl">세 활동을 1·2·3순위로 정해 주세요</h1>
                  <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">신청 전까지는 언제든 다시 둘러보고 순서를 바꿀 수 있어요.</p>
                </div>
                <StatusPill tone={canProgress ? 'good' : 'warn'}>{recruitmentLabel}</StatusPill>
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
                {mode === 'live' && <div className="mb-4"><TonightPreparationGate value={readiness.value} onRetry={readiness.check} /></div>}
                <p className="mb-3 text-xs font-semibold leading-5 text-[#8b7e78]">기본은 남 3명 · 여 2명이며, 여성 친구 3명이 함께 신청한 경우에만 남 3명 · 여 3명으로 편성돼요.</p>
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
                <PrimaryButton type="submit" className="mt-5 sm:w-full" disabled={!canProgress || !matchingConsentAccepted || busy !== null || readiness.value.status !== 'ready'}>
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
    <main className={styles.page}>
      <div className={styles.container}>
      <Link href="/match" className={styles.back}><ArrowLeft size={17} aria-hidden />매칭</Link>
      <header className={styles.heading}>
        <p className={styles.eyebrow}>{tonightServiceDateLabel(data.round.serviceDate)} · 부산대 인증자 전용</p>
        <h1 className={styles.title}>{terminalRound ? '지난 만남 확인하기' : coachingUnlocked ? '오늘의 만남, 함께해요' : '오늘밤 만나기'}</h1>
        <p className={styles.description}>{terminalRound ? '지난 회차의 결제·환불 진행 상태를 끝까지 확인할 수 있어요.' : '한 팀에서 만날 사람들, 다음 할 일부터 함께 확인해요.'}</p>
      </header>
      {mode === 'rehearsal' && <RehearsalBanner />}
      {loadError && <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950" role="status">{loadError} 신청·보증금은 마지막 조회 결과예요. 다시 불러온 뒤 다음 절차를 이어가 주세요.</p>}
      <TonightParticipation data={data} mode={mode} fresh={snapshotFresh} now={Math.max(clockNow,verifiedAt??0)} />
      <section className={styles.nextAction} aria-label="지금 해야 할 일">
        <div><p>지금 해야 할 일</p><h2>{primaryAction.title}</h2><span className={styles.nextDescription}>{primaryAction.description}</span></div>
        <button type="button" disabled={busy !== null || refreshing} onClick={() => {
          if (primaryAction.refresh) { void load(); return }
          selectPanel(primaryAction.panel)
          requestAnimationFrame(() => document.getElementById(`tonight-panel-${primaryAction.panel}`)?.scrollIntoView({ block: 'start', behavior: 'auto' }))
        }}>
          {primaryAction.label}<ArrowRight size={16} aria-hidden />
        </button>
      </section>
      <div className={styles.controls}>
        <details><summary>오늘 시간표 · 알림 설정</summary><Timeline data={data} />{mode === 'live' && <TonightNotificationControl audience="participant" onRefresh={() => load(true)} />}</details>
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

      <nav className={styles.tabs} aria-label="내 오늘밤 보기">
        {([['next', '내 신청'], ['place', '장소·도착'], ['guide', '진행 안내'], ['help', '도움·환불']] as const).map(([panel, label]) => <button key={panel} type="button" className={styles.tab} aria-pressed={activePanel === panel} aria-controls={`tonight-panel-${panel}`} onClick={() => selectPanel(panel)}>{label}</button>)}
      </nav>
      <div className={styles.focused}>
          <div className="space-y-5">
            <section id="tonight-panel-next" hidden={activePanel !== 'next'} className={`${PEACH_PANEL} overflow-hidden`} aria-label="내 신청">
              <div className="bg-[#292321] px-5 py-6 text-white sm:px-6">
                <p className="text-xs font-black tracking-[0.12em] text-[#ffcbbb]">{tonightServiceDateLabel(data.round.serviceDate)} · 내 신청 내역</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">
                  {journey?.activityTitle ?? '함께할 팀을 기다리고 있어요'}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-white/70">
                  {journey?.activityTitle ? '배정된 활동이에요. 확정 여부는 아래 참가 상태에서 확인해 주세요.' : '한 신청 풀에서 팀을 만든 뒤, 각자의 1·2·3순위를 합산해 활동을 정해요.'}
                </p>
              </div>

              <div className="space-y-4 p-5 sm:p-6">
                <details className="rounded-2xl border border-[#ead9d2] p-4">
                  <summary className="min-h-8 cursor-pointer text-sm font-black">내가 제출한 활동 순위</summary>
                  <ol className="mt-3 space-y-2 text-sm text-[#77645b]">
                    {application.choices.slice().sort((a, b) => a.rank - b.rank).map(choice => <li key={choice.activityId} className="flex gap-3"><strong className="text-[#b44733]">{choice.rank}순위</strong><span>{data.activities.find(activity => activity.id === choice.activityId)?.title ?? '활동 정보 확인 필요'}</span></li>)}
                  </ol>
                  <p className="mt-3 text-xs leading-5 text-[#8a7c72]">접수한 순위를 확인하는 화면이에요. 새로운 신청이나 재투표가 아니에요.</p>
                </details>
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
                        if (mode === 'rehearsal') acceptData(await adapter.load())
                      })}
                    >
                      <Banknote className="h-4 w-4" aria-hidden />
                      {busy === 'deposit' ? '결제 준비 중…' : '보증금 10,000원 결제하고 자리 확정'}
                    </PrimaryButton>
                  </div>
                )}
              </div>
            </section>

            <div hidden={activePanel !== 'next'} className="space-y-5">
            {application.bundle && (
              <FriendInviteSharePanel
                key={`${ownerScope ?? mode}:${data.round.id}:${application.bundle.id}`}
                roundId={data.round.id}
                memberCount={application.bundle.memberCount}
                mode={mode}
                disabled={!snapshotFresh || !data.applicationsOpen || application.bundle.status !== 'forming'}
              />
            )}

            {mode === 'live' && data.round.status === 'completed' && journey?.teamId && (
              <TonightContinuationEntry key={journey.teamId} teamId={journey.teamId} isOwnerCurrent={isOwnerCurrent} />
            )}
            </div>

            <section id="tonight-panel-place" hidden={activePanel !== 'place'} className={`${PEACH_PANEL} p-5 sm:p-6`} aria-label="장소와 도착 확인">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fce9e4] text-[#b94b3f]">
                  <ShieldCheck className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="font-black">{journey?.canRevealExactVenue ? '우리 팀 번호와 만날 장소' : `${formatKoreanTime(data.round.revealAt)} 공개 예정 · 팀과 업장 확인 후 열려요`}</p>
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
                        acceptData(next)
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
                      {!data.arrivalHelpRequest && data.arrivalHelpAvailable !== false && (
                        <button
                          type="button"
                          disabled={busy !== null || !canUseArrivalHelp}
                          onClick={() => setShowArrivalHelp((current) => !current)}
                          className="min-h-11 shrink-0 rounded-2xl border border-[#d85c4d] px-4 text-sm font-black text-[#b94b3f] disabled:opacity-50"
                        >
                          못 찾겠어요
                        </button>
                      )}
                    </div>

                    {data.arrivalHelpAvailable === false ? (
                      <div className="mt-4 rounded-2xl bg-[#fff7f3] p-4" role="status">
                        <p className="text-sm font-bold leading-6">도움 요청 내역을 확인하지 못했어요. 내 참가와 장소 정보는 그대로 확인할 수 있어요.</p>
                        <button type="button" disabled={busy !== null || refreshing} onClick={() => void load(true)} className="mt-2 min-h-11 text-sm font-black text-[#b94b3f] disabled:opacity-50">도움 요청 내역 다시 확인</button>
                      </div>
                    ) : data.arrivalHelpRequest ? (
                      <div className="mt-4 rounded-2xl bg-[#fff7f3] p-4" aria-live="polite">
                        <p className="text-sm font-black text-[#b94b3f]">도움 요청 접수 · {journey.teamCode}</p>
                        <p className="mt-2 text-sm font-bold leading-6">{data.arrivalHelpRequest.nextAction}</p>
                        <button
                          type="button"
                          disabled={busy !== null || !canUseArrivalHelp}
                          onClick={() => void runAction('arrivalHelp', async () => {
                            const next = await adapter.cancelArrivalHelp({
                              requestId: data.arrivalHelpRequest!.requestId,
                              expectedRevision: data.arrivalHelpRequest!.revision,
                            })
                            acceptData(next)
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
                            disabled={busy !== null || !canUseArrivalHelp}
                            onClick={() => void runAction('arrivalHelp', async () => {
                              const next = await adapter.requestArrivalHelp({ teamId: journey.teamId!, category })
                              acceptData(next)
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

          <section id="tonight-panel-guide" hidden={activePanel !== 'guide'} aria-label="만남 진행 안내">
            <div className="mb-4 rounded-2xl border border-[#ead9d2] bg-white p-4 text-sm leading-6 text-[#77645b]">
              <p>{terminalRound ? '이번 만남이 종료됐어요. 아래 카드는 일반적인 대화 안내이며, 다음 만남의 진행 화면이 아니에요.' : '아래 카드는 대화에 참고하는 안내예요. 실제 배정·출석·보증금·다음 만남 선택은 기존 참가 절차에서 따로 진행해요.'}</p>
              {mode === 'live' && data.round.status === 'completed' && journey?.teamId && <button type="button" className="mt-3 min-h-11 font-bold text-[#a84230]" onClick={() => selectPanel('next')}>기존 계속 만나기에서 선택하기 <ArrowRight className="inline" size={15} aria-hidden /></button>}
            </div>
            {activePanel === 'guide' && <MeetingCoachingCards audience="singles" preview={!coachingUnlocked} unlocked={coachingUnlocked} activityKind={matchedActivityKind} />}
          </section>
          <aside id="tonight-panel-help" hidden={activePanel !== 'help'} className="space-y-5" aria-label="도움과 환불">
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
      </div>
    </main>
  )
}
