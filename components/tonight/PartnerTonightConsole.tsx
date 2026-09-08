'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  Minus,
  Plus,
  Users,
} from 'lucide-react'

import PlaceMap from '@/components/places/PlaceMap'

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
import type { PartnerTonightAdapter, PartnerTonightData, TonightUiMode } from './types'
import TonightNotificationControl from './TonightNotificationControl'

function partnerError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return '업장 운영 정보를 처리하지 못했어요.'
}

export default function PartnerTonightConsole({
  mode,
  adapter,
}: {
  mode: TonightUiMode
  adapter: PartnerTonightAdapter
}) {
  const [data, setData] = useState<PartnerTonightData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, number>>({})
  const [headcountDrafts, setHeadcountDrafts] = useState<Record<string, 5 | 6>>({})
  const [attendanceDrafts, setAttendanceDrafts] = useState<Record<string, number>>({})
  const [confirmedVenueId, setConfirmedVenueId] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const next = await adapter.load()
      setData(next)
      setCapacityDrafts(Object.fromEntries(next.capacities.map((row) => [row.activityId, row.teamCapacity])))
      setHeadcountDrafts(Object.fromEntries(next.capacities.map((row) => [row.activityId, row.maxTeamHeadcount])))
      setAttendanceDrafts(Object.fromEntries(next.teams.map((team) => [team.id, team.confirmedAttendeeCount ?? team.arrivedMemberCount])))
    } catch (cause) {
      setError(partnerError(cause))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [adapter])

  useEffect(() => {
    void load()
  }, [load])

  const run = async (key: string, action: () => Promise<PartnerTonightData>, success: string) => {
    setBusyKey(key)
    setError(null)
    setNotice(null)
    try {
      const next = await action()
      setData(next)
      setNotice(success)
    } catch (cause) {
      setError(partnerError(cause))
    } finally {
      setBusyKey(null)
    }
  }

  const totalCapacity = useMemo(
    () => Object.values(capacityDrafts).reduce((total, count) => total + count, 0),
    [capacityDrafts],
  )

  if (loading) {
    return <TonightPageShell eyebrow="PARTNER TONIGHT" title="오늘 받을 팀을 준비해요" description="내 업장의 수용량부터 실제 참석 확인까지 한 순서로 안내합니다." accent="ink"><LoadingPanel label="내 업장 운영 정보를 불러오는 중이에요" /></TonightPageShell>
  }
  if (error && !data) {
    return <TonightPageShell eyebrow="PARTNER TONIGHT" title="오늘 받을 팀을 준비해요" description="권한이 연결된 내 업장만 표시합니다." accent="ink"><ErrorPanel message={error} onRetry={() => void load()} /></TonightPageShell>
  }
  if (!data) return null

  if (confirmedVenueId !== data.venueId) {
    return (
      <TonightPageShell
        eyebrow="PARTNER TONIGHT · 로그인 업장 전용"
        title="먼저 내 업장을 확인해 주세요"
        description="다른 업장의 수용량을 잘못 바꾸지 않도록, 오늘 운영을 시작하기 전에 연결된 업장 이름을 한 번 확인합니다."
        accent="ink"
      >
        {mode === 'rehearsal' && <RehearsalBanner />}
        <section className={`${PEACH_PANEL} p-6 sm:p-8`}>
          <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">내 업장 이름</p>
          <h2 className="mt-2 text-3xl font-black tracking-[-0.04em]">{data.venueName}</h2>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#665c58]">이 계정은 위 업장의 오늘 받을 팀 수와 최대 팀 인원만 바꿀 수 있어요.</p>
          <button
            type="button"
            onClick={() => setConfirmedVenueId(data.venueId)}
            className="mt-6 min-h-14 w-full rounded-2xl bg-[#292321] px-5 text-base font-black text-white"
          >
            맞아요, 이 업장 운영 시작
          </button>
        </section>
      </TonightPageShell>
    )
  }

  const allCapacitiesLocked = data.capacities.length === 3 && data.capacities.every((capacity) => capacity.status === 'locked')
  const paidTeams = data.teams.filter((team) => team.paidMemberCount === team.memberCount)
  const acceptedTeams = data.teams.filter((team) => ['accepted', 'revealed', 'in_progress', 'completed'].includes(team.status))

  return (
    <TonightPageShell
      eyebrow="PARTNER TONIGHT · 로그인 업장 전용"
      title={data.venueName}
      description="다른 가게 정보는 보이지 않아요. 이 계정에 연결된 내 업장의 수용팀 수, 팀 수락, 실제 참석 인원만 처리합니다."
      accent="ink"
    >
      {mode === 'rehearsal' && <RehearsalBanner />}
      {mode === 'live' && (
        <TonightNotificationControl audience="partner" onRefresh={() => load(true)} />
      )}

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900" role="status">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {notice}
        </div>
      )}

      <section className={`${PEACH_PANEL} p-5 sm:p-6`} aria-labelledby="partner-next-action">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">지금 해야 할 일</p>
            <h2 id="partner-next-action" className="mt-1 text-2xl font-black tracking-[-0.04em]">
              {allCapacitiesLocked ? '전원 보증금 완료 팀을 확인해 수락해 주세요' : '18:30까지 활동별 수용팀을 제출해 주세요'}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">
              수용 상한 안에서만 팀이 배정돼요. 수락한 팀에는 18:55에 같은 고유 팀 번호와 주소가 공개됩니다.
            </p>
          </div>
          <StatusPill tone={allCapacitiesLocked ? 'good' : 'warn'}>
            {allCapacitiesLocked ? '수용량 잠금 완료' : '수용량 제출 필요'}
          </StatusPill>
        </div>

        <ol className="mt-5 grid gap-2 sm:grid-cols-4">
          {[
            ['1', formatKoreanTime(data.round.capacityLockAt), '수용팀 제출·잠금'],
            ['2', '18:32', '예상 배정 확인'],
            ['3', formatKoreanTime(data.round.partnerAcceptanceDueAt), '전원 결제 팀 수락 마감'],
            ['4', '종료 후', '실제 참석 인원 확정'],
          ].map(([index, time, label]) => (
            <li key={index} className="rounded-2xl bg-[#fff7f3] p-3">
              <p className="text-xs font-black text-[#b94b3f]">{index}단계 · {time}</p>
              <p className="mt-1 text-sm font-black">{label}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <section className={`${PEACH_PANEL} p-5 sm:p-6`} aria-labelledby="partner-capacity-title">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fce9e4] text-[#b94b3f]"><Building2 className="h-5 w-5" aria-hidden /></div>
              <div>
                <h2 id="partner-capacity-title" className="text-lg font-black">오늘 받을 팀 수</h2>
                <p className="text-sm font-semibold text-[#8b7e78]">기본 5명, 여성 친구 3명 동행팀은 6명이에요 · 현재 합계 {totalCapacity}팀</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {data.capacities.map((capacity) => {
                const value = capacityDrafts[capacity.activityId] ?? capacity.teamCapacity
                const maxTeamHeadcount = headcountDrafts[capacity.activityId] ?? capacity.maxTeamHeadcount
                const locked = capacity.status === 'locked'
                return (
                  <div key={capacity.activityId} className="rounded-2xl border border-[#ead9d2] bg-[#fffaf7] p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-black">{capacity.activityTitle}</p>
                          <StatusPill tone={locked ? 'good' : 'plain'}>{locked ? '잠금' : '수정 가능'}</StatusPill>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-[#8b7e78]">배정 {capacity.reservedTeamCount}팀 / 상한 {capacity.teamCapacity}팀</p>
                      </div>
                      <fieldset className="rounded-xl border border-[#ddcbc3] bg-white p-2">
                        <legend className="px-1 text-xs font-black text-[#665c58]">한 팀에 최대 몇 명</legend>
                        <div className="mt-1 grid grid-cols-2 gap-2">
                          {([5, 6] as const).map((headcount) => (
                            <button
                              key={headcount}
                              type="button"
                              disabled={locked || busyKey !== null}
                              aria-pressed={maxTeamHeadcount === headcount}
                              onClick={() => setHeadcountDrafts((current) => ({ ...current, [capacity.activityId]: headcount }))}
                              className={`min-h-11 min-w-16 rounded-lg px-4 text-base font-black ${maxTeamHeadcount === headcount ? 'bg-[#b94b3f] text-white' : 'bg-[#fff7f3] text-[#665c58]'}`}
                            >
                              {headcount}명
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 max-w-52 text-xs font-semibold leading-5 text-[#8b7e78]">6명 팀을 받을 수 있으면 여성 친구 3명 동행 묶음도 나누지 않고 안내할 수 있어요.</p>
                      </fieldset>
                      <div className="flex items-center gap-2">
                        <button type="button" disabled={locked || busyKey !== null || value <= 0} onClick={() => setCapacityDrafts((current) => ({ ...current, [capacity.activityId]: Math.max(0, value - 1) }))} aria-label={`${capacity.activityTitle} 수용팀 1팀 줄이기`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ddcbc3] bg-white disabled:opacity-35"><Minus className="h-4 w-4" aria-hidden /></button>
                        <output className="min-w-16 text-center text-xl font-black" aria-label={`${capacity.activityTitle} ${value}팀`}>{value}팀</output>
                        <button type="button" disabled={locked || busyKey !== null || value >= 50} onClick={() => setCapacityDrafts((current) => ({ ...current, [capacity.activityId]: Math.min(50, value + 1) }))} aria-label={`${capacity.activityTitle} 수용팀 1팀 늘리기`} className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#ddcbc3] bg-white disabled:opacity-35"><Plus className="h-4 w-4" aria-hidden /></button>
                        <button
                          type="button"
                          disabled={locked || busyKey !== null}
                          onClick={() => void run(
                            `capacity-${capacity.id}`,
                            () => adapter.saveCapacity({
                              venueId: data.venueId,
                              roundId: data.round.id,
                              activityId: capacity.activityId,
                              venueSnapshotId: data.venueSnapshotId,
                              teamCapacity: value,
                              maxTeamHeadcount,
                              expectedRevision: capacity.revision,
                            }),
                            `${capacity.activityTitle} 수용 상한을 ${value}팀으로 잠갔어요.`,
                          )}
                          className="min-h-11 rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-35"
                        >
                          {busyKey === `capacity-${capacity.id}` ? '저장 중…' : locked ? '잠금 완료' : '제출·잠금'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className={`${PEACH_PANEL} p-5 sm:p-6`} aria-labelledby="partner-teams-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="partner-teams-title" className="text-lg font-black">오늘 방문 예정 팀</h2>
                <p className="mt-1 text-sm font-semibold text-[#8b7e78]">고유 팀 번호로 현장에서 빠르게 확인하세요.</p>
              </div>
              <StatusPill>{data.teams.length}팀</StatusPill>
            </div>
            {data.teams.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-[#d8c3ba] p-6 text-center text-sm font-semibold text-[#8b7e78]">
                아직 배정된 팀이 없어요. 18:32 이후 자동으로 갱신됩니다.
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {data.teams.map((team) => {
                  const canAccept = team.paidMemberCount === team.memberCount && team.teamRevision !== null && !['accepted', 'revealed', 'in_progress', 'completed'].includes(team.status)
                  const acceptLabel = team.teamRevision === null
                    ? '팀 정보 새로고침 후 수락'
                    : team.paidMemberCount === team.memberCount
                      ? '이 팀 최종 수락'
                      : `${team.memberCount}명 전원 결제 후 수락`
                  const attendance = attendanceDrafts[team.id] ?? team.arrivedMemberCount
                  const servicePanelAvailable = ['accepted', 'revealed', 'in_progress', 'completed'].includes(team.status)
                  return (
                    <article key={team.id} className="rounded-2xl border border-[#ead9d2] p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">{team.code}</h3>
                            <StatusPill tone={team.paidMemberCount === team.memberCount ? 'good' : 'warn'}>{team.paidMemberCount}/{team.memberCount} 보증금</StatusPill>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-[#665c58]">{team.activityTitle}</p>
                        </div>
                        {!servicePanelAvailable && (
                          <button
                            type="button"
                            disabled={!canAccept || busyKey !== null}
                            aria-label={`${team.code} ${acceptLabel}`}
                            onClick={() => {
                              if (team.teamRevision === null) return
                              void run(
                                `accept-${team.id}`,
                                () => adapter.acceptTeam({
                                  venueId: data.venueId,
                                  roundId: data.round.id,
                                  teamId: team.id,
                                  expectedRevision: team.teamRevision!,
                                }),
                                `${team.code} 방문을 수락했어요.`,
                              )
                            }}
                            className="min-h-11 rounded-xl bg-[#b94b3f] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-35"
                          >
                            {acceptLabel}
                          </button>
                        )}
                      </div>

                      {servicePanelAvailable && (
                        <div className="mt-4 border-t border-[#f1e5df] pt-4">
                          <label className="text-sm font-black" htmlFor={`attendance-${team.id}`}>실제 참석 인원</label>
                          <p className="mt-1 text-xs font-semibold text-[#8b7e78]">
                            도착 표시 {team.arrivedMemberCount}명 · 실제 제공한 인원으로 정산됩니다.
                          </p>
                          {!team.canConfirmService && (
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900" role="status">
                              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                              <span>
                                서비스 종료 후 실제 참석 인원을 확정할 수 있어요. 서버 기준 {formatKoreanTime(team.serviceConfirmAfter)}부터 열립니다.
                              </span>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <select id={`attendance-${team.id}`} value={attendance} disabled={!team.canConfirmService || busyKey !== null} onChange={(event) => setAttendanceDrafts((current) => ({ ...current, [team.id]: Number(event.target.value) }))} className="min-h-11 rounded-xl border border-[#ddcbc3] bg-white px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45">
                              {Array.from({ length: team.memberCount + 1 }, (_, count) => count).map((count) => <option key={count} value={count}>{count}명</option>)}
                            </select>
                            <button
                              type="button"
                              disabled={!team.canConfirmService || busyKey !== null}
                              aria-label={`${team.code} ${team.canConfirmService ? '실제 참석 인원 확정' : `${formatKoreanTime(team.serviceConfirmAfter)}부터 확정`}`}
                              onClick={() => void run(
                                `service-${team.id}`,
                                () => adapter.confirmAttendance({
                                  venueId: data.venueId,
                                  roundId: data.round.id,
                                  teamId: team.id,
                                  confirmedAttendeeCount: attendance,
                                  expectedRevision: team.serviceRevision ?? 0,
                                }),
                                `${team.code} 실제 참석 ${attendance}명을 확정했어요.`,
                              )}
                              className="min-h-11 rounded-xl border border-[#292321] bg-[#292321] px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {team.canConfirmService ? '실제 참석 인원 확정' : `${formatKoreanTime(team.serviceConfirmAfter)}부터 확정`}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className={`${PEACH_PANEL} p-5`}>
            <div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#b94b3f]" aria-hidden /><h2 className="font-black">오늘 운영 상태</h2></div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-[#fff7f3] p-3"><span className="text-sm font-bold">보증금 완료 팀</span><strong>{paidTeams.length}팀</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-[#fff7f3] p-3"><span className="text-sm font-bold">최종 수락 팀</span><strong>{acceptedTeams.length}팀</strong></div>
              <div className="flex items-center justify-between rounded-xl bg-[#fff7f3] p-3"><span className="text-sm font-bold">수락 마감</span><strong>{formatKoreanTime(data.round.partnerAcceptanceDueAt)}</strong></div>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              수용 상한과 배정 인원 전원의 결제를 모두 통과한 팀만 수락 버튼이 열립니다.
            </div>
          </section>

          <section className={`${PEACH_PANEL} p-5`} aria-labelledby="partner-arrival-help-title">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-[#b94b3f]">지금 확인할 일</p>
                <h2 id="partner-arrival-help-title" className="mt-1 text-xl font-black">현장 도움 요청</h2>
              </div>
              <StatusPill tone={data.arrivalHelpRequests.length ? 'warn' : 'good'}>{data.arrivalHelpRequests.length}건</StatusPill>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6 text-[#8b7e78]">손님 연락처 없이 팀 번호만 보고 도와주세요.</p>
            {data.arrivalHelpRequests.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-900">지금 기다리는 팀이 없어요.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {data.arrivalHelpRequests.map((help) => {
                  const problem = help.category === 'entrance'
                    ? '입구를 못 찾고 있어요'
                    : help.category === 'team'
                      ? '자기 팀을 못 찾고 있어요'
                      : '정확한 업장을 못 찾고 있어요'
                  const act = (action: 'acknowledge' | 'escalate' | 'resolve', message: string) =>
                    void run(`arrival-help-${help.requestId}-${action}`, () => adapter.updateArrivalHelp({
                      venueId: data.venueId,
                      requestId: help.requestId,
                      action,
                      expectedRevision: help.revision,
                    }), message)
                  return (
                    <article key={help.requestId} className="rounded-[22px] border border-[#ead9d2] bg-[#fffaf7] p-4">
                      <p className="text-2xl font-black tracking-[-0.04em]">{help.teamCode}</p>
                      <p className="mt-1 text-sm font-black text-[#b94b3f]">{problem}</p>
                      <p className="mt-2 text-sm font-semibold leading-5 text-[#665c58]">{help.nextAction}</p>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {help.status === 'requested' && (
                          <button type="button" disabled={busyKey !== null} onClick={() => act('acknowledge', `${help.teamCode} 팀을 찾으러 간다고 알렸어요.`)} className="min-h-14 rounded-2xl bg-[#292321] px-4 text-base font-black text-white disabled:opacity-40">찾으러 가기</button>
                        )}
                        {help.status !== 'escalated' && (
                          <button type="button" disabled={busyKey !== null} onClick={() => act('escalate', `${help.teamCode} 요청을 운영자에게 넘겼어요.`)} className="min-h-14 rounded-2xl border border-[#d85c4d] bg-white px-4 text-base font-black text-[#b94b3f] disabled:opacity-40">운영자 호출</button>
                        )}
                        {help.status !== 'requested' && (
                          <button type="button" disabled={busyKey !== null} onClick={() => act('resolve', `${help.teamCode} 도움 요청을 해결했어요.`)} className="min-h-14 rounded-2xl bg-emerald-700 px-4 text-base font-black text-white disabled:opacity-40">해결 완료</button>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <PlaceMap place={data.place} />

          <section className={`${PEACH_PANEL} p-5`}>
            <div className="flex items-start gap-3">
              <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[#b94b3f]" aria-hidden />
              <div>
                <h2 className="font-black">업장 권한 보호</h2>
                <p className="mt-1 text-sm font-semibold leading-6 text-[#8b7e78]">이 화면과 서버는 로그인 계정에 연결된 내 업장 ID를 다시 확인합니다. 주소를 바꾸거나 다른 ID를 보내도 다른 가게는 열리지 않아요.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </TonightPageShell>
  )
}
