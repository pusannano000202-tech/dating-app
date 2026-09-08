'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Banknote,
  Check,
  Clock3,
  Flag,
  Phone,
  RefreshCw,
  ShieldAlert,
  Users,
  Utensils,
} from 'lucide-react'

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
import type { AdminExceptionView, AdminTonightAdapter, AdminTonightData, TonightUiMode } from './types'

function adminError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '운영 현황을 처리하지 못했어요.'
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    open: '신청 접수 중',
    allocation_locked: '편성 준비',
    awaiting_deposits: '보증금 확인 중',
    partner_confirmation: '업장 수락 중',
    allocated: '편성 완료',
    deposit_pending: '보증금 대기',
    partner_pending: '업장 수락 대기',
    accepted: '수락 완료',
    revealed: '장소 공개',
    in_progress: '진행 중',
    completed: '완료',
    cancelled: '중단',
  }
  return labels[status] ?? status
}

function isPostAllocationRoundStatus(status: string): boolean {
  return status === 'awaiting_deposits'
    || status === 'partner_confirmation'
    || status === 'accepted'
    || status === 'in_progress'
    || status === 'completed'
}

function isContactException(exception: AdminExceptionView): boolean {
  return exception.kind === 'missing_arrival'
    || exception.kind === 'active_report'
    || exception.kind === 'deposit_manual_review'
    || exception.kind === 'deposit_reconciliation_failed'
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

function exceptionGuide(kind: AdminExceptionView['kind']): string | null {
  if (kind === 'refund_dead_letter') return '운영자는 조회만 할 수 있어요. 실패 환불 재시도는 최고관리자 통제실에서 처리합니다.'
  if (kind === 'headcount_mismatch') return '사용자 도착 기록과 업장의 최종 참석 인원이 달라 정산 확인이 필요해요.'
  if (kind === 'settlement_finalize_pending') return '참석 인원 확인 뒤 정산 생성 자동화가 다시 처리합니다. 계속 남으면 최고관리자가 확인해요.'
  if (kind === 'deposit_manual_review') return '보증금 상태와 실제 참석 여부를 함께 확인한 뒤 최고관리자가 종결해야 해요.'
  if (kind === 'deposit_reconciliation_failed') return '결제사 조회가 반복 실패했어요. 연락 결과와 결제사 기록을 최고관리자가 확인해야 해요.'
  if (kind === 'service_confirmation_missing') return '업장 보고는 보존되어 있으며 운영자는 조회만 할 수 있어요. 출석을 맞춘 뒤 최고관리자가 서비스 확인을 복구합니다.'
  return null
}

export default function AdminTonightConsole({
  mode,
  adapter,
}: {
  mode: TonightUiMode
  adapter: AdminTonightAdapter
}) {
  const [data, setData] = useState<AdminTonightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [pageBackStack, setPageBackStack] = useState<(number | null)[]>([])
  const [roundPageBackStack, setRoundPageBackStack] = useState<(string | null)[]>([])
  const [exceptionBackStack, setExceptionBackStack] = useState<(string | null)[]>([])
  const [financialJobBackStack, setFinancialJobBackStack] = useState<(string | null)[]>([])

  const load = useCallback(async (input?: {
    roundId?: string
    roundCursor?: string | null
    afterTeamNumber?: number | null
    afterExceptionKey?: string | null
    financialCursor?: string | null
    allocationFailureCursor?: string | null
  }) => {
    setLoading(true)
    setError(null)
    try {
      setData(await adapter.load(input))
    } catch (cause) {
      setError(adminError(cause))
    } finally {
      setLoading(false)
    }
  }, [adapter])

  useEffect(() => {
    void load()
  }, [load])

  const activeRound = useMemo(
    () => data?.rounds.find((round) => round.id === data.activeRoundId) ?? data?.rounds[0] ?? null,
    [data],
  )

  const totals = useMemo(() => {
    const teams = data?.teams ?? []
    return {
      paid: teams.reduce((sum, team) => sum + team.paidCount, 0),
      arrived: teams.reduce((sum, team) => sum + team.arrivedCount, 0),
      reports: teams.reduce((sum, team) => sum + team.openReportCount, 0),
      venuePending: teams.filter((team) => team.status === 'partner_pending').length,
      settlementPending: teams.filter((team) => team.confirmedCount === null).length,
    }
  }, [data])

  const activeAllocationFailure = useMemo(
    () => data?.allocationFailures.find(
      (failure) => failure.roundId === activeRound?.id && failure.status === 'open',
    ) ?? null,
    [activeRound?.id, data?.allocationFailures],
  )
  const allocationFailureAfterPublish = Boolean(
    activeAllocationFailure && activeRound && isPostAllocationRoundStatus(activeRound.status),
  )

  if (loading) return <TonightPageShell eyebrow="PNU OPERATIONS" title="오늘밤 운영 상황판" description="부산대 오늘 회차의 신청부터 정산 예외까지 한눈에 확인합니다." accent="ink"><LoadingPanel label="부산대 오늘 회차를 불러오는 중이에요" /></TonightPageShell>
  if (error && !data) return <TonightPageShell eyebrow="PNU OPERATIONS" title="오늘밤 운영 상황판" description="운영 권한이 확인된 계정만 접근합니다." accent="ink"><ErrorPanel message={error} onRetry={() => void load()} /></TonightPageShell>
  if (!data || !activeRound) return <TonightPageShell eyebrow="PNU OPERATIONS" title="오늘밤 운영 상황판" description="부산대 오늘 회차를 관리합니다." accent="ink"><EmptyPanel title="진행 중인 회차가 없어요" description="회차 준비 자동화가 완료되면 이곳에 표시됩니다." /></TonightPageShell>

  return (
    <TonightPageShell
      eyebrow="PNU OPERATIONS · 운영자"
      title="오늘밤 운영 상황판"
      description="팀 편성은 자동으로 두고, 운영자는 미도착·신고·정산 불일치처럼 사람이 필요한 예외에만 집중합니다."
      accent="ink"
    >
      {mode === 'rehearsal' && <RehearsalBanner />}
      {error && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{error}</div>}
      {notice && <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900" role="status"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{notice}</div>}

      <section className={`${PEACH_PANEL} p-4 sm:p-5`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">부산대 · {activeRound.serviceDate}</p>
            <h2 className="mt-1 text-xl font-black">{statusLabel(activeRound.status)}</h2>
          </div>
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
                void load({ roundCursor: previous, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null })
              }}
              className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
            >
              더 최신 50회차
            </button>
            <label htmlFor="admin-tonight-round" className="text-sm font-black">회차</label>
            <select
              id="admin-tonight-round"
              value={data.activeRoundId ?? ''}
              onChange={(event) => {
                setPageBackStack([])
                setExceptionBackStack([])
                setFinancialJobBackStack([])
                void load({ roundId: event.target.value, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null })
              }}
              className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-sm font-bold"
            >
              {data.rounds.map((round) => <option key={round.id} value={round.id}>{round.serviceDate} · {round.marketCode}</option>)}
            </select>
            <button
              type="button"
              disabled={data.roundPage.nextCursor === null || loading}
              onClick={() => {
                if (!data.roundPage.nextCursor) return
                setRoundPageBackStack((current) => [...current, data.roundPage.cursor])
                setPageBackStack([])
                setExceptionBackStack([])
                setFinancialJobBackStack([])
                void load({ roundCursor: data.roundPage.nextCursor, afterTeamNumber: null, afterExceptionKey: null, financialCursor: null })
              }}
              className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
            >
              더 오래된 50회차
            </button>
            <button type="button" onClick={() => void load({
              roundId: data.activeRoundId ?? undefined,
              afterTeamNumber: data.teamPage.afterTeamNumber,
              afterExceptionKey: data.exceptionPage.afterExceptionKey,
              financialCursor: data.financialJobPage.cursor,
            })} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-black">
              <RefreshCw className="h-4 w-4" aria-hidden />새로고침
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8" aria-label="오늘 핵심 수치">
        <MetricCard label="전체 신청" value={activeRound.applicationCount} tone="coral" />
        <MetricCard label="남성 신청" value={activeRound.maleApplicationCount} />
        <MetricCard label="여성 신청" value={activeRound.femaleApplicationCount} />
        <MetricCard label="통합 대기" value={activeRound.waitlistedCount} tone={activeRound.waitlistedCount ? 'amber' : 'plain'} />
        <MetricCard label="현재 페이지 팀" value={data.teams.length} tone="sage" />
        <MetricCard label="현재 페이지 결제" value={`${totals.paid}명`} />
        <MetricCard label="현재 페이지 도착" value={`${totals.arrived}명`} />
        <MetricCard label="신고·정산 예외" value={data.exceptionPage.totalCount} tone={data.exceptionPage.totalCount ? 'amber' : 'plain'} />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className={`${PEACH_PANEL} overflow-hidden`} aria-labelledby="admin-team-table-title">
          <div className="flex items-center justify-between border-b border-[#ead9d2] p-5">
            <div>
              <h2 id="admin-team-table-title" className="text-lg font-black">팀·활동·업장 현황</h2>
              <p className="mt-1 text-sm font-semibold text-[#8b7e78]">고유 팀 번호와 세 화면의 상태를 같은 원장에서 읽어요.</p>
            </div>
            <StatusPill>{data.teams.length}팀</StatusPill>
          </div>
          {data.teams.length === 0 ? (
            <EmptyPanel title="아직 편성된 팀이 없어요" description="18:32 편성 자동화가 끝나면 표시됩니다." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-left text-sm">
                <thead className="bg-[#fff7f3] text-xs text-[#665c58]">
                  <tr>
                    {['팀 번호', '활동', '업장', '성비', '보증금', '도착', '실참석', '신고', '상태'].map((label) => <th key={label} className="px-4 py-3 font-black">{label}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1e5df]">
                  {data.teams.map((team) => (
                    <tr key={team.id} className="hover:bg-[#fffaf7]">
                      <td className="whitespace-nowrap px-4 py-4 font-black">{team.code}</td>
                      <td className="px-4 py-4 font-bold">{team.activityTitle}</td>
                      <td className="px-4 py-4 font-semibold">{team.venueName ?? '배정 전'}</td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold">남 {team.maleCount} · 여 {team.femaleCount}</td>
                      <td className="px-4 py-4 font-black">{team.paidCount}/{team.memberCount}</td>
                      <td className="px-4 py-4 font-black">{team.arrivedCount}/{team.memberCount}</td>
                      <td className="px-4 py-4 font-black">{team.confirmedCount ?? '대기'}</td>
                      <td className="px-4 py-4"><StatusPill tone={team.openReportCount ? 'danger' : 'good'}>{team.openReportCount}건</StatusPill></td>
                      <td className="px-4 py-4"><StatusPill>{statusLabel(team.status)}</StatusPill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 border-t border-[#ead9d2] p-4">
            <button
              type="button"
              disabled={pageBackStack.length === 0 || loading}
              onClick={() => {
                const previous = pageBackStack.at(-1) ?? null
                setPageBackStack((current) => current.slice(0, -1))
                void load({ roundId: data.activeRoundId ?? undefined, afterTeamNumber: previous })
              }}
              className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-4 text-xs font-black disabled:opacity-40"
            >
              이전 50팀
            </button>
            <span className="text-xs font-bold text-[#8b7e78]">한 번에 최대 50팀</span>
            <button
              type="button"
              disabled={data.teamPage.nextAfterTeamNumber === null || loading}
              onClick={() => {
                setPageBackStack((current) => [...current, data.teamPage.afterTeamNumber])
                void load({
                  roundId: data.activeRoundId ?? undefined,
                  afterTeamNumber: data.teamPage.nextAfterTeamNumber,
                })
              }}
              className="min-h-10 rounded-xl bg-[#292321] px-4 text-xs font-black text-white disabled:opacity-40"
            >
              다음 50팀
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          {activeAllocationFailure && (
            <section
              className="rounded-[28px] border border-rose-200 bg-rose-50 p-5 shadow-sm"
              aria-labelledby="admin-allocation-failure-title"
              role="alert"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black tracking-[0.12em] text-rose-700">
                    {allocationFailureAfterPublish ? '배정 기록 정리 예외' : '자동 배정 보호 차단'}
                  </p>
                  <h2 id="admin-allocation-failure-title" className="mt-1 text-lg font-black text-rose-950">
                    {allocationFailureAfterPublish ? '편성은 게시됐고 예외 기록 정리 필요' : '팀 편성 자동화 중단'}
                  </h2>
                </div>
                <ShieldAlert className="h-6 w-6 shrink-0 text-rose-700" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-rose-950">
                {allocationFailureAfterPublish
                  ? '팀 편성 게시에는 성공했지만 이전 실패 기록을 자동으로 종결하지 못했어요. 현재 회차와 팀·업장 안내는 게시된 상태를 기준으로 확인하세요.'
                  : '최대 팀 수가 증명되지 않아 사용자·업장 배정을 게시하지 않았어요.'}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-rose-950">
                <div className="rounded-xl bg-white/80 p-3"><dt>현재 하한</dt><dd className="mt-1 text-lg font-black">{activeAllocationFailure.lowerBoundTeamCount}팀</dd></div>
                <div className="rounded-xl bg-white/80 p-3"><dt>안전 상한</dt><dd className="mt-1 text-lg font-black">{activeAllocationFailure.upperBoundTeamCount}팀</dd></div>
                <div className="rounded-xl bg-white/80 p-3"><dt>신청 인원</dt><dd className="mt-1 text-lg font-black">{activeAllocationFailure.applicantCount}명</dd></div>
                <div className="rounded-xl bg-white/80 p-3"><dt>시도 횟수</dt><dd className="mt-1 text-lg font-black">revision {activeAllocationFailure.revision}</dd></div>
              </dl>
              <p className="mt-3 break-all text-xs font-semibold leading-5 text-rose-800">
                오류 {activeAllocationFailure.errorCode} · 마지막 시도 {activeAllocationFailure.attemptedAt}
              </p>
              <p className="mt-3 rounded-xl border border-rose-200 bg-white p-3 text-xs font-bold leading-5 text-rose-950">
                {allocationFailureAfterPublish
                  ? '운영자는 조회만 가능해요. 사용자 안내를 되돌리지 말고, 최고관리자가 실패 원장 종결 상태와 서버 로그를 확인해야 합니다.'
                  : '운영자는 조회만 가능해요. 자동 재실행에도 계속 남아 있으면 최고관리자가 기존 내부 자동화 실행 경로와 서버 로그를 확인해야 합니다.'}
              </p>
            </section>
          )}

          <section className={`${PEACH_PANEL} p-5`} aria-labelledby="admin-arrival-help-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">현장 우선 처리</p>
                <h2 id="admin-arrival-help-title" className="mt-1 text-lg font-black">현장 지원 요청 {data.arrivalHelpRequests.length}건</h2>
              </div>
              <Users className="h-6 w-6 text-[#b94b3f]" aria-hidden />
            </div>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#8b7e78]">연락처 없이 팀 번호와 업장만으로 처리하고, 업장이 해결하지 못한 요청만 운영자가 이어받아요.</p>
            {data.arrivalHelpRequests.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-900">지금 현장 지원을 기다리는 팀이 없어요.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {data.arrivalHelpRequests.map((request) => {
                  const problem = request.category === 'entrance'
                    ? '입구 찾기'
                    : request.category === 'team'
                      ? '팀 찾기'
                      : '업장 찾기'
                  const update = (action: 'acknowledge' | 'escalate' | 'resolve') => {
                    setBusyKey(`arrival-help-${request.requestId}-${action}`)
                    setError(null)
                    setNotice(null)
                    void adapter.updateArrivalHelp({
                      requestId: request.requestId,
                      action,
                      expectedRevision: request.revision,
                    }).then((next) => {
                      setData(next)
                      setNotice(`${request.teamCode} 현장 지원 상태를 갱신했어요.`)
                    }).catch((cause) => setError(adminError(cause)))
                      .finally(() => setBusyKey(null))
                  }
                  return (
                    <article key={request.requestId} className="rounded-2xl border border-[#ead9d2] bg-[#fffaf7] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={request.status === 'escalated' ? 'danger' : 'warn'}>{problem}</StatusPill>
                        <strong>{request.teamCode}</strong>
                      </div>
                      <p className="mt-2 text-sm font-black">{request.venueName ?? '업장 확인 중'}</p>
                      <p className="mt-1 text-sm font-semibold leading-5 text-[#665c58]">{request.nextAction}</p>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        {request.status === 'requested' && (
                          <button type="button" disabled={busyKey !== null} onClick={() => update('acknowledge')} className="min-h-11 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40">운영 확인</button>
                        )}
                        {request.status !== 'escalated' && (
                          <button type="button" disabled={busyKey !== null} onClick={() => update('escalate')} className="min-h-11 rounded-xl border border-[#d85c4d] bg-white px-3 text-xs font-black text-[#b94b3f] disabled:opacity-40">운영자 호출</button>
                        )}
                        <button type="button" disabled={busyKey !== null} onClick={() => update('resolve')} className="min-h-11 rounded-xl bg-emerald-700 px-3 text-xs font-black text-white disabled:opacity-40">해결 완료</button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className={`${PEACH_PANEL} p-5`} aria-labelledby="admin-exception-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">운영자 우선 처리</p>
                <h2 id="admin-exception-title" className="mt-1 text-lg font-black">운영 예외 {data.exceptionPage.totalCount}건</h2>
              </div>
              <ShieldAlert className="h-6 w-6 text-[#b94b3f]" aria-hidden />
            </div>
            <p className="mt-2 text-sm font-semibold leading-5 text-[#8b7e78]">연락 필요 항목은 미도착·활성 신고·보증금 확인이며, 기본 화면에는 한 명의 마스킹 연락처만 표시됩니다.</p>

            {data.exceptions.length === 0 ? (
              <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-900">지금 바로 연락할 예외가 없어요.</div>
            ) : (
              <div className="mt-4 space-y-3">
                {data.exceptions.map((exception, index) => {
                  const contactException = isContactException(exception)
                  const userId = contactException
                    ? exception.businessContactUserId ?? exception.subjectUserId
                    : null
                  const maskedPhone = contactException ? exception.businessContactPhoneMasked : null
                  const guide = exceptionGuide(exception.kind)
                  return (
                    <article key={exception.reportId ?? exception.refundRequestId ?? `${exception.kind}-${exception.teamId}-${index}`} className="min-w-0 rounded-2xl border border-[#ead9d2] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={contactException ? 'danger' : 'warn'}>{exceptionLabel(exception.kind)}</StatusPill>
                        <strong className="break-words">{exception.teamCode || '팀 미연결'}</strong>
                      </div>
                      {!exception.detailLoaded && exception.key && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => {
                            const key = exception.key
                            if (!key || !data.activeRoundId) return
                            setBusyKey(`exception-detail-${key}`)
                            setError(null)
                            void adapter.loadExceptionDetail({
                              roundId: data.activeRoundId,
                              exceptionKey: key,
                            }).then((detail) => {
                              setData((current) => current ? {
                                ...current,
                                exceptions: current.exceptions.map((row) => row.key === key ? detail : row),
                              } : current)
                            }).catch((cause) => setError(adminError(cause)))
                              .finally(() => setBusyKey(null))
                          }}
                          className="mt-3 min-h-10 w-full rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black text-[#665c58] disabled:opacity-40"
                        >
                          상세·마스킹 연락처 보기
                        </button>
                      )}
                      {contactException && exception.detailLoaded && <p className="mt-2 text-sm font-bold">{exception.businessContactRole === 'reporter' ? '신고 접수자 연락 대상' : '참가자 연락 대상'}</p>}
                      {exception.category && <p className="mt-1 text-xs font-semibold text-[#8b7e78]">분류 · {exception.category}</p>}
                      {exception.refundRequestId && <p className="mt-2 break-all text-xs font-semibold text-[#8b7e78]">환불 요청 · …{exception.refundRequestId.slice(-8)} · revision {exception.refundRevision ?? '확인 필요'}</p>}
                      {guide && <p className="mt-2 text-sm font-semibold leading-5 text-[#665c58]">{guide}</p>}
                      {maskedPhone && exception.detailLoaded && <div className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#b94b3f] bg-[#fff5f1] px-4 text-sm font-black text-[#b94b3f]"><Phone className="h-4 w-4" aria-hidden />{maskedPhone}</div>}
                      {contactException && exception.detailLoaded && <div className="mt-2 grid grid-cols-2 gap-2">
                        {([
                          ['answered', '통화 완료'],
                          ['no_answer', '응답 없음'],
                          ['arriving', '도착 예정'],
                          ['cancelled', '참석 취소'],
                          ['wrong_number', '번호 확인 필요'],
                        ] as const).map(([outcome, label]) => (
                          <button
                            key={outcome}
                            type="button"
                            disabled={!userId || busyKey !== null}
                            onClick={() => {
                              if (!userId) return
                              setBusyKey(`${exception.teamId}-${outcome}`)
                              setError(null)
                              void adapter.recordCall({ teamId: exception.teamId, subjectUserId: userId, outcome })
                                .then((next) => {
                                  setData(next)
                                  setNotice(`${exception.teamCode} 연락 결과를 기록했어요.`)
                                })
                                .catch((cause) => setError(adminError(cause)))
                                .finally(() => setBusyKey(null))
                            }}
                            className="min-h-10 rounded-xl bg-[#f7eee9] px-2 text-xs font-black text-[#665c58] disabled:opacity-40"
                          >
                            {label}
                          </button>
                        ))}
                      </div>}
                      {contactException && exception.detailLoaded && <p className="mt-2 text-[11px] font-semibold leading-4 text-[#8b7e78]">원문 번호는 이 화면에서 제공하지 않습니다. 승인된 별도 연락 채널로 처리한 뒤 연락 이력만 기록하며, 기록은 출석과 팀 상태를 자동으로 바꾸지 않습니다.</p>}
                    </article>
                  )
                })}
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#ead9d2] pt-4">
              <button
                type="button"
                disabled={exceptionBackStack.length === 0 || loading}
                onClick={() => {
                  const previous = exceptionBackStack.at(-1) ?? null
                  setExceptionBackStack((current) => current.slice(0, -1))
                  void load({
                    roundId: data.activeRoundId ?? undefined,
                    afterExceptionKey: previous,
                  })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50건
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">연락처는 선택한 1건만 조회</span>
              <button
                type="button"
                disabled={data.exceptionPage.nextAfterExceptionKey === null || loading}
                onClick={() => {
                  setExceptionBackStack((current) => [...current, data.exceptionPage.afterExceptionKey])
                  void load({
                    roundId: data.activeRoundId ?? undefined,
                    afterExceptionKey: data.exceptionPage.nextAfterExceptionKey,
                  })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50건
              </button>
            </div>
          </section>

          <section className={`${PEACH_PANEL} p-5`}>
            <h2 className="font-black">운영 마감 체크</h2>
            <div className="mt-4 space-y-3 text-sm font-bold">
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-[#b94b3f]" aria-hidden />업장 수락 대기</span><strong>{totals.venuePending}팀</strong></p>
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Flag className="h-4 w-4 text-[#b94b3f]" aria-hidden />활성 신고</span><strong>{totals.reports}건</strong></p>
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Banknote className="h-4 w-4 text-[#b94b3f]" aria-hidden />정산 확인 대기</span><strong>{totals.settlementPending}팀</strong></p>
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Users className="h-4 w-4 text-[#b94b3f]" aria-hidden />현장 도착</span><strong>{totals.arrived}명</strong></p>
              <p className="flex items-center justify-between"><span className="inline-flex items-center gap-2"><Utensils className="h-4 w-4 text-[#b94b3f]" aria-hidden />실제 참석 확정</span><strong>{data.teams.filter((team) => team.confirmedCount !== null).length}팀</strong></p>
            </div>
          </section>

          <section className={`${PEACH_PANEL} p-5`} aria-labelledby="admin-financial-queue-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">자동화 상태</p>
                <h2 id="admin-financial-queue-title" className="mt-1 font-black">금융 작업 대기열</h2>
              </div>
              <Banknote className="h-5 w-5 text-[#b94b3f]" aria-hidden />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold">
              <p className="rounded-xl bg-[#fff7f3] p-3">보증금 처리 <strong className="block text-lg">{data.financialHealth.depositDispositionActiveCount}건</strong></p>
              <p className="rounded-xl bg-[#fff7f3] p-3">정산 처리 <strong className="block text-lg">{data.financialHealth.settlementActiveCount}건</strong></p>
              <p className="rounded-xl bg-[#fff7f3] p-3">환불 실패 <strong className="block text-lg text-rose-700">{data.financialHealth.refundFailedCount}건</strong></p>
              <p className="rounded-xl bg-[#fff7f3] p-3">결제 확인 실패 <strong className="block text-lg text-rose-700">{data.financialHealth.reconciliationFailedCount}건</strong></p>
              <p className="rounded-xl bg-[#fff7f3] p-3">알림 실패 <strong className="block text-lg text-rose-700">{data.financialHealth.notificationFailedCount}건</strong></p>
              <p className="rounded-xl bg-[#fff7f3] p-3">푸시 실패 <strong className="block text-lg text-rose-700">{data.financialHealth.pushFailedCount}건</strong></p>
            </div>
            <p className="mt-3 rounded-xl border border-[#ead9d2] bg-white p-3 text-xs font-bold leading-5 text-[#665c58]">
              운영자는 조회만 가능해요. 재시도와 원장 변경은 최근 인증을 마친 최고관리자만 할 수 있습니다.
            </p>
            {data.financialHealth.jobs.length > 0 && (
              <div className="mt-3 space-y-2" aria-label="금융 실패 작업">
                {data.financialHealth.jobs.map((job) => (
                  <p key={`${job.kind}-${job.id}`} className="rounded-xl border border-[#ead9d2] bg-white p-3 text-xs font-bold leading-5 text-[#665c58]">
                    <strong className="block text-[#292321]">{job.teamCode} · {job.kind === 'deposit_disposition' ? '보증금 종결' : '업장 정산'}</strong>
                    {job.attemptCount}회 실패 · {job.lastErrorCode ?? '오류 코드 없음'}
                  </p>
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
                  void load({ roundId: data.activeRoundId ?? undefined, financialCursor: previous })
                }}
                className="min-h-10 rounded-xl border border-[#ddcbc3] bg-white px-3 text-xs font-black disabled:opacity-40"
              >
                이전 50건
              </button>
              <span className="text-center text-[11px] font-bold text-[#8b7e78]">최신 실패부터 50건씩 조회</span>
              <button
                type="button"
                disabled={data.financialJobPage.nextCursor === null || loading}
                onClick={() => {
                  if (!data.financialJobPage.nextCursor) return
                  setFinancialJobBackStack((current) => [...current, data.financialJobPage.cursor])
                  void load({ roundId: data.activeRoundId ?? undefined, financialCursor: data.financialJobPage.nextCursor })
                }}
                className="min-h-10 rounded-xl bg-[#292321] px-3 text-xs font-black text-white disabled:opacity-40"
              >
                다음 50건
              </button>
            </div>
          </section>
        </aside>
      </div>
    </TonightPageShell>
  )
}
