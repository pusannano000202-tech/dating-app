'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeftRight,
  Building2,
  Check,
  ClipboardList,
  KeyRound,
  MapPinned,
  Phone,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react'

import PlaceMap from '@/components/places/PlaceMap'
import SuperAdminAccessOnboarding from '@/components/tonight/SuperAdminAccessOnboarding'

import {
  EmptyPanel,
  ErrorPanel,
  LoadingPanel,
  MetricCard,
  PEACH_PANEL,
  RehearsalBanner,
  StatusPill,
  TonightPageShell,
} from './TonightUi'
import type {
  AccessDirectoryResult,
  AccessMembershipView,
  AdminExceptionView,
  SuperAdminTonightAdapter,
  SuperAdminTonightData,
  TonightUiMode,
} from './types'

type SuperSection = 'teams' | 'exceptions' | 'access' | 'places' | 'audit'

function superAdminError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '최고관리자 작업을 처리하지 못했어요.'
}

function scoreLabel(score: number): string {
  return Number.isInteger(score) ? score.toString() : score.toFixed(1)
}

function exceptionLabel(kind: AdminExceptionView['kind']): string {
  const labels: Record<AdminExceptionView['kind'], string> = {
    missing_arrival: '미도착',
    active_report: '활성 신고',
    refund_dead_letter: '환불 처리 실패',
    headcount_mismatch: '실참석 인원 불일치',
    settlement_finalize_pending: '정산 생성 대기',
    deposit_manual_review: '보증금 수동 확인',
    deposit_reconciliation_failed: '결제 확인 실패',
    service_confirmation_missing: '서비스 확인 누락',
  }
  return labels[kind]
}

function shortestUniqueBundleReferences(bundleIds: readonly string[]): ReadonlyMap<string, string> {
  const uniqueIds = [...new Set(bundleIds)]
  return new Map(uniqueIds.map((bundleId) => {
    let length = Math.min(8, bundleId.length)
    while (
      length < bundleId.length
      && uniqueIds.some((candidate) => candidate !== bundleId && candidate.slice(0, length) === bundleId.slice(0, length))
    ) {
      length += 1
    }
    return [bundleId, bundleId.slice(0, length)]
  }))
}

export default function SuperAdminTonightConsole({
  mode,
  adapter,
}: {
  mode: TonightUiMode
  adapter: SuperAdminTonightAdapter
}) {
  const [data, setData] = useState<SuperAdminTonightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pendingDatabaseGate, setPendingDatabaseGate] = useState<boolean | null>(null)
  const [section, setSection] = useState<SuperSection>('teams')
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, string>>({})
  const [sourceBundleKey, setSourceBundleKey] = useState('')
  const [targetBundleKey, setTargetBundleKey] = useState('')
  const [swapReviewReady, setSwapReviewReady] = useState(false)
  const [directoryQuery, setDirectoryQuery] = useState('')
  const [directory, setDirectory] = useState<AccessDirectoryResult>({ accounts: [], venues: [] })
  const [membershipSubject, setMembershipSubject] = useState('')
  const [membershipRole, setMembershipRole] = useState<AccessMembershipView['role']>('user')
  const [membershipVenue, setMembershipVenue] = useState('')
  const [snapshotVenueQuery, setSnapshotVenueQuery] = useState('')
  const [snapshotVenue, setSnapshotVenue] = useState('')
  const [snapshotLatitude, setSnapshotLatitude] = useState('')
  const [snapshotLongitude, setSnapshotLongitude] = useState('')
  const [snapshotLoadState, setSnapshotLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [snapshotLoadError, setSnapshotLoadError] = useState<string | null>(null)
  const [pageBackStack, setPageBackStack] = useState<(number | null)[]>([])
  const [roundPageBackStack, setRoundPageBackStack] = useState<(string | null)[]>([])
  const [exceptionBackStack, setExceptionBackStack] = useState<(string | null)[]>([])
  const [marketPageBackStack, setMarketPageBackStack] = useState<(string | null)[]>([])
  const [partnerPageBackStack, setPartnerPageBackStack] = useState<(string | null)[]>([])
  const [financialJobBackStack, setFinancialJobBackStack] = useState<(string | null)[]>([])
  const [notificationFailureBackStack, setNotificationFailureBackStack] = useState<(string | null)[]>([])
  const [auditBackStack, setAuditBackStack] = useState<(string | null)[]>([])

  const load = useCallback(async (input?: {
    roundId?: string
    roundCursor?: string | null
    teamId?: string
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    auditCursor?: string | null
    notificationFailureCursor?: string | null
  }) => {
    setLoading(true)
    setError(null)
    try {
      const next = await adapter.load(input)
      setData(next)
      setScoreDrafts(Object.fromEntries(next.members.map((member) => [member.applicationId, String(member.finalScore)])))
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setLoading(false)
    }
  }, [adapter])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (key: string, action: () => Promise<SuperAdminTonightData>, success: string) => {
    setBusyKey(key)
    setError(null)
    setNotice(null)
    try {
      const next = await action()
      setData(next)
      setNotice(success)
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const searchAccounts = async () => {
    setBusyKey('directory')
    setError(null)
    try {
      const result = await adapter.searchDirectory(directoryQuery.trim())
      setDirectory(result)
      if (result.accounts.length === 1) setMembershipSubject(result.accounts[0].userId)
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const updateDatabaseApplicationsGate = async (value: boolean) => {
    setBusyKey('database-applications-gate')
    setError(null)
    setNotice(null)
    try {
      const next = await adapter.setDatabaseApplicationsOpen({ value })
      setData(next)
      setPendingDatabaseGate(null)
      setNotice(value ? 'DB 신청 Gate를 열었어요.' : 'DB 신청 Gate를 닫았어요.')
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const searchSnapshotVenues = async () => {
    setBusyKey('snapshot-directory')
    setError(null)
    try {
      const result = await adapter.searchDirectory(snapshotVenueQuery.trim())
      setDirectory(result)
      if (result.venues.length === 1) {
        const venueId = result.venues[0].venueId
        setSnapshotVenue(venueId)
        void refreshVenueSnapshots(venueId)
      }
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const refreshVenueSnapshots = async (venueId: string) => {
    if (!venueId) {
      setSnapshotLoadState('idle')
      setSnapshotLoadError(null)
      setData((current) => current ? { ...current, venueSnapshots: [] } : current)
      return
    }
    setSnapshotLoadState('loading')
    setSnapshotLoadError(null)
    try {
      const snapshots = await adapter.loadVenueSnapshots({ venueId })
      setData((current) => current ? { ...current, venueSnapshots: snapshots } : current)
      setSnapshotLoadState('ready')
    } catch (cause) {
      setSnapshotLoadError(superAdminError(cause))
      setSnapshotLoadState('error')
    }
  }

  const loadAccessPage = async (input?: {
    afterMembershipId?: string | null
    userId?: string | null
    partnerAfterMembershipId?: string | null
    partnerUserId?: string | null
    partnerVenueId?: string | null
  }) => {
    setBusyKey('access-load')
    setError(null)
    try {
      setData(await adapter.loadAccess(input))
    } catch (cause) {
      setError(superAdminError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const activeRound = data?.admin.rounds.find((round) => round.id === data.admin.activeRoundId) ?? data?.admin.rounds[0] ?? null
  const activeTeam = data?.admin.teams.find((team) => team.id === data.activeTeamId) ?? null
  const bundleOptions = useMemo(() => {
    const teamBundles = data?.teamBundles ?? []
    const shortReferences = shortestUniqueBundleReferences(
      teamBundles.flatMap((team) => team.bundles.map((bundle) => bundle.bundleId)),
    )
    return teamBundles.flatMap((team) =>
      team.bundles.map((bundle) => {
        const shortId = shortReferences.get(bundle.bundleId) ?? bundle.bundleId
        return {
          key: `${team.teamId}::${bundle.bundleId}`,
          teamId: team.teamId,
          teamCode: team.teamCode,
          teamRevision: team.teamRevision,
          bundleId: bundle.bundleId,
          memberCount: bundle.memberCount,
          shortId,
          label: `${team.teamCode} · 묶음 ID ${shortId} · ${bundle.memberCount}명`,
        }
      }),
    )
  }, [data])
  const bundleShortReferences = useMemo(
    () => new Map(bundleOptions.map((option) => [option.bundleId, option.shortId])),
    [bundleOptions],
  )

  if (loading) return <TonightPageShell eyebrow="SUPER ADMIN" title="부산대 오늘밤 통제실" description="민감 정보와 편성 수정은 최고관리자 계정에서만 다룹니다." accent="ink"><LoadingPanel label="최고관리자 진단 정보를 불러오는 중이에요" /></TonightPageShell>
  if (error && !data) return <TonightPageShell eyebrow="SUPER ADMIN" title="부산대 오늘밤 통제실" description="재인증된 최고관리자만 접근할 수 있어요." accent="ink"><ErrorPanel message={error} onRetry={() => void load()} /></TonightPageShell>
  if (!data || !activeRound) return <TonightPageShell eyebrow="SUPER ADMIN" title="부산대 오늘밤 통제실" description="전체 운영과 권한을 관리합니다." accent="ink"><EmptyPanel title="진단할 오늘 회차가 없어요" description="회차 생성이 완료되면 팀과 사용자가 표시됩니다." /></TonightPageShell>

  const sourceBundle = bundleOptions.find((option) => option.key === sourceBundleKey)
  const targetBundle = bundleOptions.find((option) => option.key === targetBundleKey)

  return (
    <TonightPageShell
      eyebrow="SUPER ADMIN · 최고관리자 전용"
      title="부산대 오늘밤 통제실"
      description="프로필과 비공개 점수, 친구 묶음, 팀 교체, 출석, 역할·시장·업장 권한과 장소 원장을 여기서 통제합니다."
      accent="ink"
    >
      {mode === 'rehearsal' && <RehearsalBanner />}
      {error && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</div>}
      {notice && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900" role="status"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{notice}</div>}

      <section className={`${PEACH_PANEL} mb-4 overflow-hidden`} aria-labelledby="database-applications-gate-title">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">최고관리자 전용 · 실제 DB 설정</p>
              <StatusPill tone={data.databaseApplicationsOpen ? 'good' : 'warn'}>
                {data.databaseApplicationsOpen ? 'DB Gate 열림' : 'DB Gate 닫힘'}
              </StatusPill>
            </div>
            <h2 id="database-applications-gate-title" className="mt-2 text-lg font-black text-[#292321]">DB 신청 Gate</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#6f625d]">
              서버/Vercel Gate와 별도인 데이터베이스 신청 차단 장치예요. 두 Gate가 모두 승인돼야 실제 사용자 신청이 열립니다.
            </p>
            <p className="mt-1 text-xs font-bold leading-5 text-[#8b7e78]">
              변경한 계정·시각·이전값·새 값은 서버에서 자동 기록하며, 추가 메모 없이 저장돼요.
            </p>
          </div>

          {pendingDatabaseGate === null ? (
            <button
              type="button"
              disabled={busyKey !== null}
              onClick={() => setPendingDatabaseGate(!data.databaseApplicationsOpen)}
              className={`min-h-11 rounded-xl px-5 text-sm font-black text-white transition disabled:opacity-40 ${
                data.databaseApplicationsOpen
                  ? 'bg-[#292321] hover:bg-[#3b3431]'
                  : 'bg-[#bd4b40] hover:bg-[#a94037]'
              }`}
            >
              {data.databaseApplicationsOpen ? 'DB 신청 닫기' : 'DB 신청 열기'}
            </button>
          ) : (
            <div className="rounded-2xl border border-[#e2b75f] bg-[#fff9e8] p-4 lg:max-w-sm" role="group" aria-label="DB 신청 Gate 변경 확인">
              <p className="text-sm font-black text-[#5b4220]">
                {pendingDatabaseGate
                  ? 'DB Gate를 열 준비가 됐나요? 서버/Vercel Gate도 별도로 승인해야 신청이 열려요.'
                  : 'DB Gate를 닫을까요? 확인 즉시 새 신청이 데이터베이스에서 차단돼요.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => setPendingDatabaseGate(null)}
                  className="min-h-11 rounded-xl border border-[#d7c5ba] bg-white px-3 text-sm font-black text-[#5f5551] disabled:opacity-40"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() => void updateDatabaseApplicationsGate(pendingDatabaseGate)}
                  className="min-h-11 rounded-xl bg-[#bd4b40] px-3 text-sm font-black text-white disabled:opacity-40"
                >
                  {busyKey === 'database-applications-gate'
                    ? '변경 중...'
                    : pendingDatabaseGate ? 'DB Gate 열기 확인' : 'DB Gate 닫기 확인'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={`${PEACH_PANEL} mb-4 p-4`} aria-label="최고관리자 회차 선택">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={roundPageBackStack.length === 0 || loading}
            onClick={() => {
              const previous = roundPageBackStack.at(-1) ?? null
              setRoundPageBackStack((current) => current.slice(0, -1))
              setPageBackStack([])
              setExceptionBackStack([])
              setFinancialJobBackStack([])
              setNotificationFailureBackStack([])
              setAuditBackStack([])
              void load({ roundCursor: previous, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null, auditCursor: null, notificationFailureCursor: null })
            }}
            className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
          >
            더 최신 50회차
          </button>
          <label htmlFor="super-admin-tonight-round" className="text-sm font-black">운영 회차</label>
          <select
            id="super-admin-tonight-round"
            value={data.admin.activeRoundId ?? ''}
            onChange={(event) => {
              setPageBackStack([])
              setExceptionBackStack([])
              setFinancialJobBackStack([])
              setNotificationFailureBackStack([])
              setAuditBackStack([])
              void load({ roundId: event.target.value, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null, auditCursor: null, notificationFailureCursor: null })
            }}
            className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-bold"
          >
            {data.admin.rounds.map((item) => <option key={item.id} value={item.id}>{item.serviceDate} · {item.marketCode}</option>)}
          </select>
          <button
            type="button"
            disabled={data.admin.roundPage.nextCursor === null || loading}
            onClick={() => {
              if (!data.admin.roundPage.nextCursor) return
              setRoundPageBackStack((current) => [...current, data.admin.roundPage.cursor])
              setPageBackStack([])
              setExceptionBackStack([])
              setFinancialJobBackStack([])
              setNotificationFailureBackStack([])
              setAuditBackStack([])
              void load({ roundCursor: data.admin.roundPage.nextCursor, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null, auditCursor: null, notificationFailureCursor: null })
            }}
            className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
          >
            더 오래된 50회차
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="최고관리자 핵심 현황">
        <MetricCard label="부산대 신청" value={activeRound.applicationCount} tone="coral" />
        <MetricCard label="남성 / 여성" value={`${activeRound.maleApplicationCount} / ${activeRound.femaleApplicationCount}`} />
        <MetricCard label="현재 페이지 팀" value={data.admin.teams.length} tone="sage" />
        <MetricCard label="운영 예외" value={data.admin.exceptionPage.totalCount} tone={data.admin.exceptionPage.totalCount ? 'amber' : 'plain'} />
        <MetricCard label="현재 이력 페이지" value={data.audit.length} />
      </section>

      <nav className="mt-5 overflow-x-auto rounded-2xl border border-[#ead9d2] bg-white p-1.5" aria-label="최고관리자 기능">
        <div className="flex min-w-max gap-1">
          {([
            ['teams', Users, '팀 편성 진단'],
            ['exceptions', AlertCircle, '예외·환불'],
            ['access', KeyRound, '역할·자격 관리'],
            ['places', MapPinned, '업장 장소 원장'],
            ['audit', ClipboardList, '자동 변경 이력'],
          ] as const).map(([value, Icon, label]) => (
            <button
              key={value}
              type="button"
              aria-current={section === value ? 'page' : undefined}
              onClick={() => {
                setSection(value)
                if (value === 'access' && !data.accessLoaded) {
                  void adapter.loadAccess().then(setData).catch((cause) => setError(superAdminError(cause)))
                }
              }}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-black transition ${
                section === value ? 'bg-[#292321] text-white' : 'text-[#665c58] hover:bg-[#fff4ef]'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {section === 'exceptions' && (
        <section className={`${PEACH_PANEL} mt-5 overflow-hidden`} aria-labelledby="super-admin-exception-title">
          <div className="border-b border-[#ead9d2] p-5 sm:p-6">
            <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">최고관리자 전용</p>
            <h2 id="super-admin-exception-title" className="mt-1 text-lg font-black">예외·환불·최고관리자 종결</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#8b7e78]">운영자는 모든 예외를 조회만 합니다. 최고관리자는 실패 작업을 재시도하고, 미도착 보증금을 명시적으로 전액 환불하거나 승인된 정책에서만 몰수로 종결할 수 있어요.</p>
          </div>
          {data.admin.exceptions.length === 0 ? (
            <EmptyPanel title="처리할 운영 예외가 없어요" description="환불 실패나 실참석 불일치가 생기면 이곳에 표시됩니다." />
          ) : (
            <div className="grid min-w-0 gap-3 p-4 sm:p-5 lg:grid-cols-2">
              {data.admin.exceptions.map((exception, index) => {
                const canRetry = exception.kind === 'refund_dead_letter'
                  && Boolean(exception.refundRequestId)
                  && exception.refundRevision !== null
                  && exception.status !== 'retry_queued'
                const retryReconciliation = adapter.retryReconciliation
                const canRetryReconciliation = exception.kind === 'deposit_reconciliation_failed'
                  && Boolean(exception.reconciliationJobId)
                  && exception.reconciliationRevision !== null
                  && exception.reconciliationRevision !== undefined
                  && typeof retryReconciliation === 'function'
                const resolveManualDeposit = adapter.resolveManualDeposit
                const canResolveManualDeposit = exception.kind === 'deposit_manual_review'
                  && Boolean(exception.manualDepositId)
                  && exception.manualDepositRevision !== null
                  && exception.manualDepositRevision !== undefined
                  && typeof resolveManualDeposit === 'function'
                const canRecoverService = (
                  exception.kind === 'service_confirmation_missing'
                  || exception.kind === 'headcount_mismatch'
                )
                  && Boolean(exception.serviceAttemptId)
                  && exception.serviceConfirmationRevision !== null
                  && exception.serviceConfirmationRevision !== undefined
                  && exception.reportedAttendeeCount === exception.observedArrivedCount
                return (
                  <article key={exception.reportId ?? exception.refundRequestId ?? exception.reconciliationJobId ?? `${exception.kind}-${exception.teamId}-${index}`} className="min-w-0 rounded-2xl border border-[#ead9d2] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone={exception.kind === 'refund_dead_letter' ? 'danger' : 'warn'}>{exceptionLabel(exception.kind)}</StatusPill>
                      <strong className="break-words">{exception.teamCode || '팀 미연결'}</strong>
                      <span className="ml-auto text-xs font-black text-[#8b7e78]">{exception.status}</span>
                    </div>
                    {!exception.detailLoaded && exception.key && (
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => {
                          const key = exception.key
                          if (!key || !data.admin.activeRoundId) return
                          setBusyKey(`exception-detail-${key}`)
                          setError(null)
                          void adapter.loadExceptionDetail({
                            roundId: data.admin.activeRoundId,
                            exceptionKey: key,
                          }).then((detail) => {
                            setData((current) => current ? {
                              ...current,
                              admin: {
                                ...current.admin,
                                exceptions: current.admin.exceptions.map((row) => row.key === key ? detail : row),
                              },
                            } : current)
                          }).catch((cause) => setError(superAdminError(cause)))
                            .finally(() => setBusyKey(null))
                        }}
                        className="mt-3 min-h-10 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black text-[#665c58] disabled:opacity-40"
                      >
                        상세·조치 불러오기
                      </button>
                    )}

                    {exception.detailLoaded && exception.kind === 'refund_dead_letter' && (
                      <div className="mt-3">
                        {exception.refundRequestId && (
                          <p className="break-all text-xs font-semibold text-[#665c58]">
                            환불 요청 · …{exception.refundRequestId.slice(-8)} · revision {exception.refundRevision ?? '확인 필요'}
                          </p>
                        )}
                        {canRetry ? (
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => {
                              if (!exception.refundRequestId || exception.refundRevision === null) return
                              void run(
                                `refund-${exception.refundRequestId}`,
                                () => adapter.retryRefund({ requestId: exception.refundRequestId!, expectedRevision: exception.refundRevision! }),
                                `${exception.teamCode || '해당 팀'} 환불을 재시도 대기열에 넣었어요.`,
                              )
                            }}
                            className="mt-3 min-h-11 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                          >
                            실패 환불 재시도 요청
                          </button>
                        ) : (
                          <p className="mt-3 rounded-xl bg-[#f7eee9] p-3 text-xs font-bold leading-5 text-[#665c58]">
                            {exception.status === 'retry_queued' ? '재시도 대기열에 등록됐어요.' : '환불 요청 식별 정보나 revision이 없어 조회만 가능합니다.'}
                          </p>
                        )}
                      </div>
                    )}

                    {exception.detailLoaded && exception.kind === 'deposit_reconciliation_failed' && (
                      <div className="mt-3">
                        {exception.reconciliationJobId && (
                          <p className="break-all text-xs font-semibold text-[#665c58]">
                            결제 확인 작업 · …{exception.reconciliationJobId.slice(-8)} · revision {exception.reconciliationRevision ?? '확인 필요'}
                          </p>
                        )}
                        {canRetryReconciliation ? (
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => {
                              if (!retryReconciliation || !exception.reconciliationJobId || exception.reconciliationRevision == null) return
                              void run(
                                `reconciliation-${exception.reconciliationJobId}`,
                                () => retryReconciliation({
                                  jobId: exception.reconciliationJobId!,
                                  expectedRevision: exception.reconciliationRevision!,
                                }),
                                `${exception.teamCode || '해당 팀'} 결제 확인을 재시도 대기열에 넣었어요.`,
                              )
                            }}
                            className="mt-3 min-h-11 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                          >
                            결제 확인 재시도 요청
                          </button>
                        ) : (
                          <p className="mt-3 rounded-xl bg-[#f7eee9] p-3 text-xs font-bold leading-5 text-[#665c58]">
                            결제 확인 작업 식별 정보나 revision이 없어 조회만 가능합니다.
                          </p>
                        )}
                      </div>
                    )}

                    {exception.detailLoaded && exception.kind === 'deposit_manual_review' && (
                      <div className="mt-3">
                        <p className="text-sm font-semibold leading-5 text-[#665c58]">
                          {exception.subjectName ?? '참가자'} · {exception.subjectPhone ?? '연락처 확인 필요'} · {exception.status === 'no_show' ? '미도착' : '출석 미확정'}
                        </p>
                        {exception.manualDepositId && (
                          <p className="mt-1 break-all text-xs font-semibold text-[#8b7e78]">
                            보증금 · …{exception.manualDepositId.slice(-8)} · revision {exception.manualDepositRevision ?? '확인 필요'}
                          </p>
                        )}
                        {canResolveManualDeposit ? (
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => {
                                if (!resolveManualDeposit || !exception.manualDepositId || exception.manualDepositRevision == null) return
                                void run(
                                  `manual-refund-${exception.manualDepositId}`,
                                  () => resolveManualDeposit({
                                    depositId: exception.manualDepositId!,
                                    decision: 'refund',
                                    expectedRevision: exception.manualDepositRevision!,
                                  }),
                                  `${exception.subjectName ?? '해당 참가자'} 보증금을 전액 환불 대기열에 넣었어요.`,
                                )
                              }}
                              className="min-h-11 rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                            >
                              보증금 전액 환불
                            </button>
                            <button
                              type="button"
                              disabled={busyKey !== null || exception.manualForfeitPolicyApproved !== true}
                              onClick={() => {
                                if (!resolveManualDeposit || !exception.manualDepositId || exception.manualDepositRevision == null) return
                                if (!window.confirm('이 참가자의 보증금을 몰수로 최종 종결할까요? 이 작업은 자동 실행되지 않습니다.')) return
                                void run(
                                  `manual-forfeit-${exception.manualDepositId}`,
                                  () => resolveManualDeposit({
                                    depositId: exception.manualDepositId!,
                                    decision: 'forfeit',
                                    expectedRevision: exception.manualDepositRevision!,
                                  }),
                                  `${exception.subjectName ?? '해당 참가자'} 보증금을 몰수로 종결했어요.`,
                                )
                              }}
                              className="min-h-11 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              보증금 몰수 확정
                            </button>
                            {exception.manualForfeitPolicyApproved !== true && (
                              <p className="sm:col-span-2 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950">
                                법·약관 승인 Gate가 닫혀 있어 몰수는 차단됐어요. 전액 환불만 선택할 수 있습니다.
                              </p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-3 rounded-xl bg-[#f7eee9] p-3 text-xs font-bold leading-5 text-[#665c58]">
                            보증금 식별 정보나 최신 revision이 없어 조회만 가능합니다.
                          </p>
                        )}
                      </div>
                    )}

                    {exception.detailLoaded && exception.kind === 'headcount_mismatch' && (
                      <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold leading-5 text-amber-950">사용자 도착 기록과 업장 최종 참석 인원을 비교한 뒤 출석·정산 원장을 확인해 주세요.</p>
                    )}
                    {exception.detailLoaded && (exception.kind === 'service_confirmation_missing' || exception.kind === 'headcount_mismatch') && (
                      <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold leading-5 text-amber-950">
                        <p>업장 보고 {exception.reportedAttendeeCount ?? '미확인'}명 · 현재 도착 {exception.observedArrivedCount ?? '미확인'}명</p>
                        {canRecoverService ? (
                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => {
                              if (!exception.serviceAttemptId || exception.serviceConfirmationRevision == null) return
                              void run(
                                `service-recovery-${exception.teamId}`,
                                () => adapter.recoverServiceConfirmation({
                                  teamId: exception.teamId,
                                  attemptId: exception.serviceAttemptId!,
                                  expectedRevision: exception.serviceConfirmationRevision!,
                                }),
                                `${exception.teamCode || '해당 팀'} 서비스 확인을 복구했어요.`,
                              )
                            }}
                            className="mt-3 min-h-11 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                          >
                            서비스 확인 복구
                          </button>
                        ) : (
                          <p className="mt-2 text-xs font-bold">먼저 참가자 출석을 업장 보고 인원과 맞추거나 최신 업장 보고를 확인해 주세요.</p>
                        )}
                      </div>
                    )}
                    {exception.detailLoaded && (exception.kind === 'missing_arrival' || exception.kind === 'active_report') && (
                      <p className="mt-3 text-sm font-semibold leading-5 text-[#665c58]">연락과 신고 대응은 운영자 상황판에서 처리하고, 변경 결과는 이력에서 확인합니다.</p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
          <div className="border-t border-[#ead9d2] bg-[#fffaf7] p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">금융 자동화 복구</p>
                <h3 className="mt-1 font-black">금융 작업 대기열</h3>
                <p className="mt-1 text-sm font-semibold text-[#8b7e78]">보증금 처리 실패 {data.admin.financialHealth.depositDeadLetterCount}건 · 정산 처리 실패 {data.admin.financialHealth.settlementDeadLetterCount}건</p>
              </div>
              <StatusPill tone={data.admin.financialHealth.jobs.length ? 'danger' : 'good'}>{data.admin.financialHealth.jobs.length}건 확인 필요</StatusPill>
            </div>
            {data.admin.financialHealth.jobs.length === 0 ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">재시도가 필요한 금융 작업이 없어요.</p>
            ) : (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {data.admin.financialHealth.jobs.map((job) => (
                  <article key={`${job.kind}-${job.id}`} className="rounded-2xl border border-[#ead9d2] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="danger">{job.kind === 'deposit_disposition' ? '보증금 종결' : '업장 정산'}</StatusPill>
                      <strong>{job.teamCode || `팀 …${job.teamId.slice(-8)}`}</strong>
                      <span className="ml-auto text-xs font-black text-[#8b7e78]">{job.attemptCount}회 실패</span>
                    </div>
                    <p className="mt-2 break-all text-xs font-semibold text-[#665c58]">작업 …{job.id.slice(-8)} · revision {job.revision}</p>
                    <p className="mt-1 text-xs font-semibold text-[#8b7e78]">오류 {job.lastErrorCode ?? '미분류'} · {job.updatedAt || '갱신 시각 미확인'}</p>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void run(
                        `financial-${job.kind}-${job.id}`,
                        () => adapter.retryFinancialJob({
                          jobKind: job.kind,
                          jobId: job.id,
                          expectedRevision: job.revision,
                        }),
                        `${job.teamCode || '해당 팀'} 금융 작업을 재시도 대기열에 넣었어요.`,
                      )}
                      className="mt-3 min-h-11 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                    >
                      금융 작업 재시도
                    </button>
                  </article>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#ead9d2] pt-4">
              <button
                type="button"
                disabled={financialJobBackStack.length === 0 || loading}
                onClick={() => {
                  const previous = financialJobBackStack.at(-1) ?? null
                  setFinancialJobBackStack((current) => current.slice(0, -1))
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    financialCursor: previous,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50건
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">최신 금융 실패부터 50건씩 조회</span>
              <button
                type="button"
                disabled={data.admin.financialJobPage.nextCursor === null || loading}
                onClick={() => {
                  if (!data.admin.financialJobPage.nextCursor) return
                  setFinancialJobBackStack((current) => [...current, data.admin.financialJobPage.cursor])
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    financialCursor: data.admin.financialJobPage.nextCursor,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50건
              </button>
            </div>
          </div>
          <div className="border-t border-[#ead9d2] p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">개인정보 없는 복구 목록</p>
                <h3 className="mt-1 font-black">알림 전송 실패</h3>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">
                  사용자 이름·전화번호·푸시 주소 없이 익명 참조와 오류 상태만 보여줘요. 재구독이 필요한 기기에는 인앱 안내만 보냅니다.
                </p>
              </div>
              <StatusPill tone={data.notificationFailures.length ? 'danger' : 'good'}>{data.notificationFailures.length}건 확인 필요</StatusPill>
            </div>
            {data.notificationFailures.length === 0 ? (
              <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">이 페이지에 복구할 알림 실패가 없어요.</p>
            ) : (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {data.notificationFailures.map((failure) => (
                  <article key={`${failure.kind}-${failure.id}`} className="rounded-2xl border border-[#ead9d2] bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill tone="danger">{failure.kind === 'push' ? '브라우저 푸시' : '앱 안 알림'}</StatusPill>
                      {failure.resubscribeRequired && <StatusPill tone="warn">재구독 안내</StatusPill>}
                      <strong>{failure.teamRef ?? '회차 공통'}</strong>
                      <span className="ml-auto text-xs font-black text-[#8b7e78]">{failure.attemptCount}회 실패</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#665c58]">대상 {failure.recipientRef} · {failure.eventType}</p>
                    <p className="mt-1 break-all text-xs font-semibold text-[#8b7e78]">오류 {failure.failureCode} · {failure.failedAt}</p>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() => void run(
                        `notification-${failure.kind}-${failure.id}`,
                        () => adapter.retryNotificationFailure({
                          failureKind: failure.kind,
                          failureId: failure.id,
                          expectedRevision: failure.revision,
                        }),
                        failure.resubscribeRequired
                          ? '해당 사용자에게 개인정보 없는 재구독 안내를 대기열에 넣었어요.'
                          : '알림 실패 재처리를 안전한 대기열에 넣었어요.',
                      )}
                      className="mt-3 min-h-11 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40"
                    >
                      {failure.resubscribeRequired ? '재구독 안내 보내기' : '알림 실패 재처리'}
                    </button>
                  </article>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#ead9d2] pt-4">
              <button
                type="button"
                disabled={notificationFailureBackStack.length === 0 || loading}
                onClick={() => {
                  const previous = notificationFailureBackStack.at(-1) ?? null
                  setNotificationFailureBackStack((current) => current.slice(0, -1))
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    notificationFailureCursor: previous,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50건
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">최신 실패부터 최대 50건씩 조회</span>
              <button
                type="button"
                disabled={data.notificationFailurePage.nextCursor === null || loading}
                onClick={() => {
                  if (!data.notificationFailurePage.nextCursor) return
                  setNotificationFailureBackStack((current) => [...current, data.notificationFailurePage.cursor])
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    notificationFailureCursor: data.notificationFailurePage.nextCursor,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50건
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-[#ead9d2] p-4">
            <button
              type="button"
              disabled={exceptionBackStack.length === 0 || loading}
              onClick={() => {
                const previous = exceptionBackStack.at(-1) ?? null
                setExceptionBackStack((current) => current.slice(0, -1))
                void load({
                  roundId: data.admin.activeRoundId ?? undefined,
                  afterExceptionKey: previous,
                })
              }}
              className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
            >
              이전 50건
            </button>
            <span className="text-center text-[11px] font-bold text-[#8b7e78]">민감 정보는 선택한 1건만 조회</span>
            <button
              type="button"
              disabled={data.admin.exceptionPage.nextAfterExceptionKey === null || loading}
              onClick={() => {
                setExceptionBackStack((current) => [...current, data.admin.exceptionPage.afterExceptionKey])
                void load({
                  roundId: data.admin.activeRoundId ?? undefined,
                  afterExceptionKey: data.admin.exceptionPage.nextAfterExceptionKey,
                })
              }}
              className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
            >
              다음 50건
            </button>
          </div>
        </section>
      )}

      {section === 'teams' && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className={`${PEACH_PANEL} h-fit p-4`}>
            <h2 className="font-black">오늘 팀 목록</h2>
            <p className="mt-1 text-xs font-semibold leading-5 text-[#8b7e78]">팀을 고르면 프로필·점수·친구 묶음을 함께 봅니다.</p>
            <div className="mt-4 space-y-2">
              {data.admin.teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    teamId: team.id,
                    afterTeamNumber: data.admin.teamPage.afterTeamNumber,
                  })}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    team.id === data.activeTeamId ? 'border-[#b94b3f] bg-[#fff0eb]' : 'border-[#ead9d2] hover:bg-[#fffaf7]'
                  }`}
                >
                  <p className="font-black">{team.code}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-[#8b7e78]">{team.activityTitle} · {team.venueName ?? '업장 미정'}</p>
                  <p className="mt-2 text-xs font-black text-[#b94b3f]">남 {team.maleCount} · 여 {team.femaleCount} · {team.paidCount}/{team.memberCount} 결제</p>
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={pageBackStack.length === 0 || loading}
                onClick={() => {
                  const previous = pageBackStack.at(-1) ?? null
                  setPageBackStack((current) => current.slice(0, -1))
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    afterTeamNumber: previous,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-2 text-xs font-black disabled:opacity-40"
              >
                이전 50팀
              </button>
              <button
                type="button"
                disabled={data.admin.teamPage.nextAfterTeamNumber === null || loading}
                onClick={() => {
                  setPageBackStack((current) => [...current, data.admin.teamPage.afterTeamNumber])
                  void load({
                    roundId: data.admin.activeRoundId ?? undefined,
                    afterTeamNumber: data.admin.teamPage.nextAfterTeamNumber,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-2 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50팀
              </button>
            </div>
          </aside>

          <div className="space-y-5">
            {!activeTeam ? (
              <EmptyPanel title="팀을 골라 주세요" description="왼쪽 팀 목록에서 진단할 팀을 선택하세요." />
            ) : (
              <>
                <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">편성 근거</p>
                      <h2 className="mt-1 text-2xl font-black">{activeTeam.code}</h2>
                      <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">
                        {activeTeam.memberCount}명 · 남 {activeTeam.maleCount} / 여 {activeTeam.femaleCount} · 친구 묶음 보존 · 나이와 최종 외모점수의 팀 내 균형을 기준으로 편성
                      </p>
                    </div>
                    <StatusPill tone={[5, 6].includes(activeTeam.memberCount) ? 'good' : 'danger'}>{activeTeam.memberCount} / {activeTeam.memberCount}명</StatusPill>
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label={`${activeTeam.code} 참가자 프로필`}>
                  {data.members.map((member) => (
                    <article key={member.applicationId} className={`${PEACH_PANEL} overflow-hidden`}>
                      <div className="relative h-52 bg-[#f6e8e1]">
                        {member.photoUrls[0] ? (
                          // Signed profile URLs can use provider-specific hosts that are not safe to bake into next.config.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={member.photoUrls[0]} alt={`${member.name} 프로필 사진`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-sm font-black text-[#8b7e78]">사진 미등록</div>
                        )}
                        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs font-black text-white">{member.seatNumber}번 좌석</span>
                        {member.bundleId && (
                          <span className="absolute bottom-3 left-3 rounded-full bg-[#b94b3f] px-3 py-1 text-xs font-black text-white">
                            친구 묶음 · {bundleShortReferences.get(member.bundleId) ?? member.bundleId}
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-black">{member.name}</h3>
                            <p className="mt-1 text-xs font-semibold text-[#8b7e78]">{member.age}세 · {member.gender === 'male' ? '남성' : '여성'}</p>
                          </div>
                          <a href={`tel:${member.phone}`} aria-label={`${member.name}에게 전화`} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0eb] text-[#b94b3f]"><Phone className="h-4 w-4" aria-hidden /></a>
                        </div>
                        <p className="mt-3 break-all text-sm font-black">{member.phone}</p>
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="rounded-xl bg-[#fff7f3] p-2 text-center"><p className="text-[10px] font-black text-[#8b7e78]">자동 점수</p><p className="mt-1 font-black">{scoreLabel(member.automaticScore)}</p></div>
                          <div className="rounded-xl bg-[#fff7f3] p-2 text-center"><p className="text-[10px] font-black text-[#8b7e78]">보정 점수</p><p className="mt-1 font-black">{member.adjustment > 0 ? '+' : ''}{scoreLabel(member.adjustment)}</p></div>
                          <div className="rounded-xl bg-[#292321] p-2 text-center text-white"><p className="text-[10px] font-black text-white/60">최종 점수</p><p className="mt-1 font-black">{scoreLabel(member.finalScore)}</p></div>
                        </div>
                        <div className="mt-4">
                          <label htmlFor={`score-${member.applicationId}`} className="text-xs font-black">최종 점수 조정 (0~100)</label>
                          <div className="mt-2 flex gap-2">
                            <input id={`score-${member.applicationId}`} type="number" min="0" max="100" step="0.1" value={scoreDrafts[member.applicationId] ?? ''} onChange={(event) => setScoreDrafts((current) => ({ ...current, [member.applicationId]: event.target.value }))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#ddcbc3] px-3 text-sm font-black" />
                            <button
                              type="button"
                              disabled={busyKey !== null}
                              onClick={() => {
                                const score = Number(scoreDrafts[member.applicationId])
                                if (!Number.isFinite(score) || score < 0 || score > 100) {
                                  setError('점수는 0부터 100 사이로 입력해 주세요.')
                                  return
                                }
                                void run(`score-${member.applicationId}`, () => adapter.adjustAppearance({ applicationId: member.applicationId, score, expectedRevision: member.featureRevision }), `${member.name}의 최종 점수를 조정했어요.`)
                              }}
                              className="min-h-11 rounded-xl bg-[#292321] px-4 text-xs font-black text-white disabled:opacity-40"
                            >
                              점수 반영
                            </button>
                          </div>
                        </div>
                        <div className="mt-4 border-t border-[#f1e5df] pt-4">
                          <label htmlFor={`attendance-status-${member.applicationId}`} className="text-xs font-black">출석 상태 수정</label>
                          <select
                            id={`attendance-status-${member.applicationId}`}
                            value={member.attendanceStatus}
                            disabled={busyKey !== null}
                            onChange={(event) => void run(
                              `attendance-${member.applicationId}`,
                              () => adapter.updateAttendance({
                                teamId: activeTeam.id,
                                userId: member.userId,
                                status: event.target.value as 'pending' | 'arrived' | 'no_show' | 'excused',
                                expectedRevision: member.attendanceRevision,
                              }),
                              `${member.name}의 출석 상태를 반영했어요.`,
                            )}
                            className="mt-2 min-h-11 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-black"
                          >
                            <option value="pending">도착 대기</option>
                            <option value="arrived">도착 확인</option>
                            <option value="no_show">미도착</option>
                            <option value="excused">사유 인정</option>
                          </select>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>

                <section className={`${PEACH_PANEL} p-5 sm:p-6`}>
                  <div className="flex items-start gap-3">
                    <ArrowLeftRight className="mt-0.5 h-5 w-5 shrink-0 text-[#b94b3f]" aria-hidden />
                    <div>
                      <h2 className="font-black">친구 묶음 단위 팀 교체</h2>
                      <p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">개인을 따로 떼지 않고 선택한 묶음 전체를 교체합니다. 서버가 팀 인원·성비·여성 3인 친구 예외·동행 조건을 다시 확인한 뒤에만 확정해요.</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end">
                    <label className="text-sm font-black">보낼 묶음<select value={sourceBundleKey} onChange={(event) => { setSourceBundleKey(event.target.value); setSwapReviewReady(false) }} className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-bold"><option value="">묶음 선택</option>{bundleOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
                    <ArrowLeftRight className="mx-auto hidden h-5 w-5 text-[#b94b3f] md:block" aria-hidden />
                    <label className="text-sm font-black">바꿔 받을 묶음<select value={targetBundleKey} onChange={(event) => { setTargetBundleKey(event.target.value); setSwapReviewReady(false) }} className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-bold"><option value="">묶음 선택</option>{bundleOptions.filter((option) => option.teamId !== sourceBundle?.teamId).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
                  </div>
                  {sourceBundle && targetBundle && (
                    <div className="mt-4 grid gap-2 rounded-2xl border border-[#ead9d2] bg-[#fffaf7] p-4 sm:grid-cols-2" aria-live="polite">
                      <div><p className="text-xs font-black text-[#8b7e78]">출발 팀</p><p className="mt-1 font-black">{sourceBundle.teamCode}</p><p className="mt-1 text-xs font-bold text-[#b94b3f]">묶음 ID {sourceBundle.shortId} · {sourceBundle.memberCount}명</p></div>
                      <div><p className="text-xs font-black text-[#8b7e78]">대상 팀</p><p className="mt-1 font-black">{targetBundle.teamCode}</p><p className="mt-1 text-xs font-bold text-[#b94b3f]">묶음 ID {targetBundle.shortId} · {targetBundle.memberCount}명</p></div>
                    </div>
                  )}
                  {!swapReviewReady ? (
                    <button
                      type="button"
                      disabled={!sourceBundle || !targetBundle || busyKey !== null}
                      onClick={() => setSwapReviewReady(true)}
                      className="mt-4 min-h-12 w-full rounded-2xl bg-[#292321] px-5 text-sm font-black text-white disabled:opacity-40"
                    >
                      교체 내용 확인
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!sourceBundle || !targetBundle || busyKey !== null}
                      onClick={() => {
                        if (!sourceBundle || !targetBundle) return
                        void run('swap', async () => {
                          const next = await adapter.swapBundles({
                            teamAId: sourceBundle.teamId,
                            bundleAId: sourceBundle.bundleId,
                            expectedTeamARevision: sourceBundle.teamRevision,
                            teamBId: targetBundle.teamId,
                            bundleBId: targetBundle.bundleId,
                            expectedTeamBRevision: targetBundle.teamRevision,
                          })
                          setSwapReviewReady(false)
                          return next
                        }, '친구 묶음 교체를 완료하고 두 팀을 다시 검증했어요.')
                      }}
                      className="mt-4 min-h-12 w-full rounded-2xl bg-[#b94b3f] px-5 text-sm font-black text-white disabled:opacity-40"
                    >
                      확인한 두 묶음 교체
                    </button>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {section === 'access' && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(340px,0.7fr)_minmax(0,1.3fr)]">
          <SuperAdminAccessOnboarding mode={mode} />
          <form
            className={`${PEACH_PANEL} h-fit p-5 sm:p-6`}
            onSubmit={(event: FormEvent) => {
              event.preventDefault()
              if (!membershipSubject.trim()) return
              void run('membership-grant', () => adapter.updateMembership({
                subject: membershipSubject.trim(),
                role: membershipRole,
                marketCode: membershipRole === 'user' ? 'PNU' : undefined,
                venueId: membershipRole === 'partner' ? membershipVenue.trim() : undefined,
                action: 'grant',
              }), '로그인 계정의 역할·자격을 부여했어요.')
            }}
          >
            <div className="flex items-start gap-3"><UserCog className="mt-0.5 h-5 w-5 text-[#b94b3f]" aria-hidden /><div><h2 className="font-black">기존 긴급 직접 부여</h2><p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">초대·승인 흐름을 쓸 수 없는 긴급 상황에서만 로그인 계정에 역할을 직접 부여합니다.</p></div></div>
            <label htmlFor="directory-query" className="mt-5 block text-sm font-black">계정 검색</label>
            <p className="mt-1 text-xs font-semibold text-[#8b7e78]">이름·이메일로 가입 계정을 찾은 뒤 선택하세요. 전화번호는 검색 목록에 표시하지 않아요.</p>
            <div className="mt-2 flex gap-2">
              <input id="directory-query" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="예: 김부산 또는 이메일" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#ddcbc3] px-4 text-sm font-bold" />
              <button type="button" onClick={() => void searchAccounts()} disabled={busyKey !== null || directoryQuery.trim().length < 2} className="min-h-12 rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40">검색</button>
            </div>
            <fieldset className="mt-3">
              <legend className="sr-only">권한을 부여할 계정</legend>
              <div className="space-y-2">
                {directory.accounts.map((account) => (
                  <label key={account.userId} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${membershipSubject === account.userId ? 'border-[#b94b3f] bg-[#fff0eb]' : 'border-[#ead9d2]'}`}>
                    <input type="radio" name="membership-account" value={account.userId} checked={membershipSubject === account.userId} onChange={() => setMembershipSubject(account.userId)} className="mt-1 accent-[#b94b3f]" />
                    <span><strong className="block text-sm">{account.name}</strong><span className="mt-0.5 block text-xs font-semibold text-[#8b7e78]">{account.email ?? '이메일 미등록'}</span></span>
                  </label>
                ))}
              </div>
            </fieldset>
            {membershipSubject && (
              <button
                type="button"
                disabled={busyKey !== null}
                onClick={() => {
                  setMarketPageBackStack([])
                  setPartnerPageBackStack([])
                  void loadAccessPage({
                    afterMembershipId: null,
                    userId: membershipSubject,
                    partnerAfterMembershipId: null,
                    partnerUserId: membershipSubject,
                  })
                }}
                className="mt-3 min-h-10 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black text-[#665c58] disabled:opacity-40"
              >
                선택 계정의 부산대·업장 권한만 보기
              </button>
            )}
            <label htmlFor="membership-role" className="mt-4 block text-sm font-black">부여할 역할</label>
            <select id="membership-role" value={membershipRole} onChange={(event) => setMembershipRole(event.target.value as AccessMembershipView['role'])} className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-bold">
              <option value="user">부산대 사용자 자격</option>
              <option value="partner">업장 사장님·직원</option>
              <option value="admin">운영자</option>
              <option value="super_admin">최고관리자</option>
            </select>
            {membershipRole === 'partner' && <><label htmlFor="membership-venue" className="mt-4 block text-sm font-black">업장 목록</label><select id="membership-venue" value={membershipVenue} onChange={(event) => setMembershipVenue(event.target.value)} required className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-bold"><option value="">연결할 업장 선택</option>{directory.venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}{venue.address ? ` · ${venue.address}` : ''}</option>)}</select>{membershipVenue && <button type="button" disabled={busyKey !== null} onClick={() => { setPartnerPageBackStack([]); void loadAccessPage({ partnerAfterMembershipId: null, partnerVenueId: membershipVenue }) }} className="mt-2 min-h-10 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black text-[#665c58] disabled:opacity-40">선택 업장의 권한만 보기</button>}</>}
            <button type="submit" disabled={busyKey !== null || !membershipSubject || (membershipRole === 'partner' && !membershipVenue)} className="mt-5 min-h-12 w-full rounded-2xl bg-[#292321] px-5 text-sm font-black text-white disabled:opacity-40">선택한 계정에 권한 부여</button>
          </form>

          <section className={`${PEACH_PANEL} overflow-hidden`}>
            <div className="border-b border-[#ead9d2] p-5"><h2 className="font-black">현재 역할·시장·업장 연결</h2><p className="mt-1 text-sm font-semibold text-[#8b7e78]">회수하면 다음 요청부터 서버 접근이 차단됩니다.</p></div>
            <div className="divide-y divide-[#f1e5df]">
              {data.memberships.map((membership) => (
                <div key={membership.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div><div className="flex flex-wrap items-center gap-2"><p className="font-black">{membership.label}</p><StatusPill tone={membership.status === 'active' ? 'good' : 'danger'}>{membership.status === 'active' ? '활성' : '회수됨'}</StatusPill></div><p className="mt-1 text-xs font-semibold text-[#8b7e78]">{membership.role} · {membership.marketCode ?? membership.venueName ?? '전체 운영'}</p></div>
                  <div className="flex flex-wrap gap-2">
                    {(membership.role === 'user' || membership.role === 'partner') && !membership.detailLoaded && (
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() => {
                          setBusyKey(`access-detail-${membership.id}`)
                          void adapter.loadAccessDetail({
                            membershipId: membership.id,
                            role: membership.role === 'partner' ? 'partner' : 'user',
                          })
                            .then((detail) => setData((current) => current ? {
                              ...current,
                              memberships: current.memberships.map((row) => row.id === membership.id ? detail : row),
                            } : current))
                            .catch((cause) => setError(superAdminError(cause)))
                            .finally(() => setBusyKey(null))
                        }}
                        className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-4 text-xs font-black text-[#665c58] disabled:opacity-40"
                      >
                        계정·업장 상세 보기
                      </button>
                    )}
                    {membership.status === 'active' && <button type="button" disabled={busyKey !== null} onClick={() => void run(`revoke-${membership.id}`, () => adapter.updateMembership({ subject: membership.id, role: membership.role, marketCode: membership.marketCode ?? undefined, action: 'revoke' }), `${membership.label} 권한을 회수했어요.`)} className="min-h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-800 disabled:opacity-40">권한 회수</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[#ead9d2] p-4">
              <button
                type="button"
                disabled={partnerPageBackStack.length === 0 || busyKey !== null}
                onClick={() => {
                  const previous = partnerPageBackStack.at(-1) ?? null
                  setPartnerPageBackStack((current) => current.slice(0, -1))
                  void loadAccessPage({
                    partnerAfterMembershipId: previous,
                    partnerUserId: data.partnerMembershipPage.userId,
                    partnerVenueId: data.partnerMembershipPage.venueId,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50개 업장 권한
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">업장 권한은 50개씩 조회</span>
              <button
                type="button"
                disabled={data.partnerMembershipPage.nextAfterMembershipId === null || busyKey !== null}
                onClick={() => {
                  setPartnerPageBackStack((current) => [...current, data.partnerMembershipPage.afterMembershipId])
                  void loadAccessPage({
                    partnerAfterMembershipId: data.partnerMembershipPage.nextAfterMembershipId,
                    partnerUserId: data.partnerMembershipPage.userId,
                    partnerVenueId: data.partnerMembershipPage.venueId,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50개 업장 권한
              </button>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[#ead9d2] p-4">
              <button
                type="button"
                disabled={marketPageBackStack.length === 0 || busyKey !== null}
                onClick={() => {
                  const previous = marketPageBackStack.at(-1) ?? null
                  setMarketPageBackStack((current) => current.slice(0, -1))
                  void loadAccessPage({
                    afterMembershipId: previous,
                    userId: data.marketMembershipPage.userId,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50명
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">부산대 자격은 50명씩 조회</span>
              <button
                type="button"
                disabled={data.marketMembershipPage.nextAfterMembershipId === null || busyKey !== null}
                onClick={() => {
                  setMarketPageBackStack((current) => [...current, data.marketMembershipPage.afterMembershipId])
                  void loadAccessPage({
                    afterMembershipId: data.marketMembershipPage.nextAfterMembershipId,
                    userId: data.marketMembershipPage.userId,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50명
              </button>
            </div>
          </section>
        </div>
      )}

      {section === 'places' && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.3fr)]">
          <form
            className={`${PEACH_PANEL} h-fit p-5 sm:p-6`}
            onSubmit={(event) => {
              event.preventDefault()
              const latitude = Number(snapshotLatitude)
              const longitude = Number(snapshotLongitude)
              if (!snapshotVenue.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                setError('장소 원장에 등록할 업장과 올바른 위도·경도를 선택해 주세요.')
                return
              }
              void run('snapshot', () => adapter.saveVenueSnapshot({ venueId: snapshotVenue.trim(), latitude, longitude }), '검증된 좌표로 새 불변 장소 스냅샷을 만들었어요.')
            }}
          >
            <div className="flex items-start gap-3"><Building2 className="mt-0.5 h-5 w-5 text-[#b94b3f]" aria-hidden /><div><h2 className="font-black">업장 좌표 스냅샷 생성</h2><p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">업장 원장의 이름·주소를 복사하고 검증된 좌표를 새 revision으로 보관합니다.</p></div></div>
            <label htmlFor="snapshot-venue-query" className="mt-5 block text-sm font-black">업장 검색</label>
            <p className="mt-1 text-xs font-semibold text-[#8b7e78]">이름이나 주소로 찾고, 장소 원장에 등록할 업장을 선택하세요.</p>
            <div className="mt-2 flex gap-2">
              <input id="snapshot-venue-query" value={snapshotVenueQuery} onChange={(event) => setSnapshotVenueQuery(event.target.value)} placeholder="예: 장전 보더라운지" className="min-h-12 min-w-0 flex-1 rounded-xl border border-[#ddcbc3] px-4 text-sm font-bold" />
              <button type="button" onClick={() => void searchSnapshotVenues()} disabled={busyKey !== null || snapshotVenueQuery.trim().length < 2} className="min-h-12 rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-40">검색</button>
            </div>
            <label htmlFor="snapshot-venue" className="mt-4 block text-sm font-black">장소 원장에 등록할 업장</label>
            <select id="snapshot-venue" value={snapshotVenue} onChange={(event) => { const venueId = event.target.value; setSnapshotVenue(venueId); void refreshVenueSnapshots(venueId) }} required className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-bold">
              <option value="">검색 결과에서 업장 선택</option>
              {directory.venues.map((venue) => <option key={venue.venueId} value={venue.venueId}>{venue.name}{venue.address ? ` · ${venue.address}` : ''}</option>)}
            </select>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="text-sm font-black">위도<input aria-label="업장 위도" type="number" step="0.000001" value={snapshotLatitude} onChange={(event) => setSnapshotLatitude(event.target.value)} required className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] px-3 text-sm font-bold" /></label>
              <label className="text-sm font-black">경도<input aria-label="업장 경도" type="number" step="0.000001" value={snapshotLongitude} onChange={(event) => setSnapshotLongitude(event.target.value)} required className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] px-3 text-sm font-bold" /></label>
            </div>
            <button type="submit" disabled={busyKey !== null} className="mt-5 min-h-12 w-full rounded-2xl bg-[#292321] px-5 text-sm font-black text-white disabled:opacity-40">새 장소 revision 저장</button>
          </form>
          <div className="grid content-start gap-4 md:grid-cols-2">
            {snapshotLoadState === 'idle' && <EmptyPanel title="업장을 선택해 주세요" description="업장을 고르면 해당 업장의 장소 revision만 불러옵니다." />}
            {snapshotLoadState === 'loading' && <LoadingPanel label="장소 이력을 불러오는 중이에요" />}
            {snapshotLoadState === 'error' && <ErrorPanel message={snapshotLoadError ?? '장소 이력을 불러오지 못했어요.'} onRetry={() => void refreshVenueSnapshots(snapshotVenue)} />}
            {snapshotLoadState === 'ready' && data.venueSnapshots.length === 0 && <EmptyPanel title="이 업장에는 아직 장소 revision이 없어요" description="왼쪽에서 검증된 좌표를 입력해 첫 revision을 저장하세요." />}
            {snapshotLoadState === 'ready' && data.venueSnapshots.map((place) => <PlaceMap key={`${place.placeRef}-${place.snapshotRevision}`} place={place} />)}
          </div>
        </div>
      )}

      {section === 'audit' && (
        <section className={`${PEACH_PANEL} mt-5 overflow-hidden`}>
          <div className="border-b border-[#ead9d2] p-5"><h2 className="font-black">자동 변경 이력</h2><p className="mt-1 text-sm font-semibold text-[#8b7e78]">별도 설명을 입력하지 않아도 actor·시각·before·after가 자동 기록됩니다.</p></div>
          {data.audit.length === 0 ? <EmptyPanel title="아직 변경 이력이 없어요" description="점수, 팀, 출석, 권한을 바꾸면 여기에 자동으로 남습니다." /> : (
            <div className="overflow-x-auto"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-[#fff7f3] text-xs text-[#665c58]"><tr>{['시각', 'actor', '동작', 'before', 'after'].map((label) => <th key={label} className="px-4 py-3 font-black">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#f1e5df]">{data.audit.map((entry) => <tr key={entry.id}><td className="whitespace-nowrap px-4 py-4 font-semibold">{entry.at}</td><td className="px-4 py-4 font-black">{entry.actor}</td><td className="px-4 py-4 font-bold">{entry.action}</td><td className="px-4 py-4 font-mono text-xs">{entry.before}</td><td className="px-4 py-4 font-mono text-xs">{entry.after}</td></tr>)}</tbody></table></div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-[#ead9d2] p-4">
            <button
              type="button"
              disabled={auditBackStack.length === 0 || loading}
              onClick={() => {
                const previous = auditBackStack.at(-1) ?? null
                setAuditBackStack((current) => current.slice(0, -1))
                void load({
                  roundId: data.admin.activeRoundId ?? undefined,
                  auditCursor: previous,
                })
              }}
              className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
            >
              이전 50건
            </button>
            <span className="text-center text-[11px] font-bold text-[#8b7e78]">최신 변경부터 50건씩 조회</span>
            <button
              type="button"
              disabled={data.auditPage.nextCursor === null || loading}
              onClick={() => {
                if (!data.auditPage.nextCursor) return
                setAuditBackStack((current) => [...current, data.auditPage.cursor])
                void load({
                  roundId: data.admin.activeRoundId ?? undefined,
                  auditCursor: data.auditPage.nextCursor,
                })
              }}
              className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
            >
              다음 50건
            </button>
          </div>
        </section>
      )}

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-[#ead9d2] bg-white p-4 text-sm font-semibold leading-6 text-[#665c58]">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#b94b3f]" aria-hidden />
        최고관리자 페이지와 모든 변경 API는 로그인 역할을 서버에서 다시 확인합니다. 일반 사용자·업장·운영자는 주소를 직접 입력해도 이 데이터를 받을 수 없습니다.
      </div>
    </TonightPageShell>
  )
}
