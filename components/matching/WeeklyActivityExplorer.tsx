'use client'

import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Loader2, MapPin, RotateCw, Users } from 'lucide-react'
import Image from 'next/image'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import ScheduledContinuationStartButton from '@/components/matching/ScheduledContinuationStartButton'
import WeeklyPartyControls, { type WeeklyPartyApplication } from '@/components/matching/WeeklyPartyControls'
import { resolveMutationAttempt, type MutationAttempt } from '@/lib/matching/continuation-journey-client'

type WindowRow = {
  id: string
  activity_id: string
  activity_kind: string
  week_key: string
  title: string
  summary: string
  starts_at: string
  ends_at: string
  application_closes_at: string
  location_name: string
  capacity: number
  applicant_count: number
  assigned_count: number
}

type Discovery = { server_now: string; week_key: string; windows: WindowRow[]; application: WeeklyPartyApplication | null }

export default function WeeklyActivityExplorer() {
  const [data, setData] = useState<Discovery | null>(null)
  const [selectedActivity, setSelectedActivity] = useState('')
  const [selectedWindows, setSelectedWindows] = useState<string[]>([])
  const [partyType, setPartyType] = useState<'solo' | 'friends'>('solo')
  const [partyGroupId, setPartyGroupId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [canReload, setCanReload] = useState(false)
  const applyAttempt = useRef<MutationAttempt | null>(null)

  const load = useCallback(async () => {
    setNotice('')
    setCanReload(false)
    try {
      const response = await fetch('/api/match/weekly-availability', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isDiscovery(payload)) throw new Error('load_failed')
      setData(payload)
      if (payload.application) {
        setSelectedActivity(payload.application.activity_id)
        setSelectedWindows(payload.application.candidate_window_ids)
        setPartyType(payload.application.party.type)
      } else if (payload.windows[0]) {
        setSelectedActivity(payload.windows[0].activity_id)
      }
    } catch {
      setNotice('이번 주 활동 시간을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.')
      setCanReload(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  const activities = useMemo(() => {
    const groups = new Map<string, WindowRow[]>()
    for (const window of data?.windows ?? []) groups.set(window.activity_id, [...(groups.get(window.activity_id) ?? []), window])
    return [...groups.entries()]
  }, [data])
  const activityIndex = Math.max(0, activities.findIndex(([id]) => id === selectedActivity))
  const currentWindows = activities[activityIndex]?.[1] ?? []
  const activity = currentWindows[0]
  const assignedWindow = data?.application?.assigned_window_id
    ? data.windows.find((window) => window.id === data.application?.assigned_window_id) ?? null
    : null
  const assignedMeetingEnded = Boolean(assignedWindow && data
    && Date.parse(assignedWindow.ends_at) <= Date.parse(data.server_now))
  const hasLiveApplication = data?.application?.status === 'awaiting_consents'
    || data?.application?.status === 'active'
    || data?.application?.status === 'assigned'

  function chooseActivity(activityId: string) {
    if (hasLiveApplication) return
    setSelectedActivity(activityId)
    setSelectedWindows([])
  }

  function moveActivity(direction: -1 | 1) {
    if (hasLiveApplication || activities.length < 2) return
    const nextIndex = (activityIndex + direction + activities.length) % activities.length
    const nextActivity = activities[nextIndex]?.[0]
    if (nextActivity) chooseActivity(nextActivity)
  }

  function toggleWindow(id: string) {
    if (hasLiveApplication) return
    setSelectedWindows((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function apply() {
    if (!data || !selectedActivity || selectedWindows.length === 0 || busy
      || (partyType === 'friends' && !partyGroupId)) return
    const candidateWindowIds = [...selectedWindows].sort()
    const partyIdentity = partyType === 'friends' ? partyGroupId : 'solo'
    applyAttempt.current = resolveMutationAttempt(
      applyAttempt.current,
      `weekly-apply:${data.week_key}:${selectedActivity}:${partyIdentity}:${candidateWindowIds.join(',')}`,
    )
    setBusy(true)
    setNotice('')
    setCanReload(false)
    try {
      const response = await fetch('/api/match/weekly-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activity_id: selectedActivity,
          week_key: data.week_key,
          candidate_window_ids: candidateWindowIds,
          party_group_id: partyType === 'friends' ? partyGroupId : null,
          idempotency_key: applyAttempt.current.key,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isDiscovery(payload)) throw new Error('apply_failed')
      setData(payload)
      applyAttempt.current = null
      setNotice(partyType === 'friends'
        ? '친구들과 가능한 날짜를 한 번에 신청했어요. 전원 수락 뒤 한 일정만 확정됩니다.'
        : '가능한 날짜를 한 번에 신청했어요. 확정되는 일정은 한 개뿐이에요.')
    } catch {
      setNotice('신청을 저장하지 못했어요. 마감이나 기존 일정을 확인해 주세요.')
      setCanReload(true)
    } finally {
      setBusy(false)
    }
  }

  if (!data && !notice) return <PanelMessage icon={Loader2} message="이번 주 활동을 불러오는 중이에요." spin />
  if (!data) return <PanelMessage icon={RotateCw} message={notice} action={() => void load()} />

  return (
    <section className="mx-auto mt-5 w-full max-w-3xl overflow-hidden rounded-3xl border border-boot-hairline bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
      <header className="border-b border-boot-hairline px-5 py-5 sm:px-7">
        <p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">이번 주 만나기 · 한 신청 풀</p>
        <h3 className="mt-2 text-2xl font-black text-boot-ink">활동을 보고, 가능한 날짜를 모두 골라요</h3>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">둘러보기만으로 신청되지 않아요. 마지막 버튼을 눌러도 여러 날짜 중 한 일정만 확정됩니다.</p>
      </header>

      {activity ? (
        <div className="relative min-h-[280px] overflow-hidden bg-[#13211f] sm:min-h-[340px]">
          <Image
            src={activityImage(activity.activity_kind)}
            alt={`${activity.title} 활동 모습`}
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0D151C]/95 via-[#0D151C]/30 to-[#0D151C]/20" />
          <div className="absolute inset-x-0 bottom-0 p-5 text-white sm:p-7">
            <p className="text-[11px] font-black text-[#F3B95F]">활동 {activityIndex + 1} / {activities.length}</p>
            <h4 className="mt-1 text-2xl font-black">{activity.title}</h4>
            <p className="mt-2 max-w-xl text-sm font-bold leading-6 text-white/80">{activity.summary}</p>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button type="button" aria-label="이전 활동" onClick={() => moveActivity(-1)} disabled={hasLiveApplication || activities.length < 2} className="flex min-h-12 min-w-12 items-center justify-center rounded-full border border-white/35 bg-black/20 disabled:opacity-35"><ArrowLeft size={19} /></button>
              <div className="flex gap-1.5" aria-hidden="true">{activities.map(([id]) => <span key={id} className={`h-1.5 rounded-full ${id === selectedActivity ? 'w-7 bg-[#F3B95F]' : 'w-1.5 bg-white/55'}`} />)}</div>
              <button type="button" aria-label="다음 활동" onClick={() => moveActivity(1)} disabled={hasLiveApplication || activities.length < 2} className="flex min-h-12 min-w-12 items-center justify-center rounded-full border border-white/35 bg-black/20 disabled:opacity-35"><ArrowRight size={19} /></button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-5 p-5 sm:p-7">
        {data.application?.status === 'assigned' ? (
          <div className="rounded-2xl border border-[#147A70]/25 bg-[#EAF7F5] p-4 sm:p-5">
            <p className="text-[11px] font-black tracking-[0.14em] text-[#147A70]">확정된 한 일정</p>
            {assignedWindow ? (
              <>
                <h4 className="mt-2 text-lg font-black text-[#103F3A]">{assignedWindow.title}</h4>
                <p className="mt-3 flex items-center gap-2 text-sm font-black text-[#115F57]"><Clock3 size={16} />{formatWindow(assignedWindow.starts_at)}</p>
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-[#315F5B]"><MapPin size={16} />{assignedWindow.location_name}</p>
                <p className="mt-3 text-xs font-bold leading-5 text-[#315F5B]">신청한 {data.application.candidate_window_ids.length}개 후보 중 이 일정 하나만 확정됐어요.</p>
                {assignedMeetingEnded && data.application.assigned_occurrence_id ? (
                  <div className="mt-4 border-t border-[#147A70]/15 pt-4">
                    <p className="mb-3 text-xs font-bold leading-5 text-[#315F5B]">만남이 끝났다면 실제 출석 확인 뒤 같은 사람들과 계속 만날 수 있어요.</p>
                    <ScheduledContinuationStartButton occurrenceId={data.application.assigned_occurrence_id} />
                  </div>
                ) : (
                  <p className="mt-4 rounded-xl bg-white/65 px-3 py-2 text-xs font-bold text-[#315F5B]">지금 할 일 · 확정된 시간과 장소를 확인해 주세요.</p>
                )}
              </>
            ) : (
              <div className="mt-2">
                <p className="text-sm font-bold text-[#315F5B]">확정 일정을 표시하지 못했어요. 최신 상태를 다시 불러와 주세요.</p>
                <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-xl bg-white px-4 text-xs font-black text-[#147A70]">다시 불러오기</button>
              </div>
            )}
          </div>
        ) : hasLiveApplication && data.application ? (
          <div className="rounded-2xl border border-[#147A70]/20 bg-[#EAF7F5] p-4">
            <p className="font-black text-[#115F57]">신청 완료 · 배정 기다리는 중</p>
            <p className="mt-1 text-xs font-bold leading-5 text-[#315F5B]">고른 {data.application.candidate_window_ids.length}개 날짜는 한 신청입니다. 다른 사람의 신청 수나 선택은 공개하지 않아요.</p>
          </div>
        ) : null}

        <WeeklyPartyControls
          application={data.application}
          partyType={partyType}
          partyGroupId={partyGroupId}
          onPartyTypeChange={setPartyType}
          onPartyGroupChange={setPartyGroupId}
          onDiscovery={(payload) => {
            if (!isDiscovery(payload)) return false
            setData(payload)
            return true
          }}
          onNotice={(message, reload = false) => {
            setNotice(message)
            setCanReload(reload)
          }}
        />

        <div>
          <div className="flex items-end justify-between gap-3">
            <div><p className="text-[11px] font-black text-boot-primary">2. 날짜 선택</p><h4 className="mt-1 text-lg font-black text-boot-ink">가능한 날짜를 복수로 선택</h4></div>
            <p className="text-xs font-black text-boot-primary">{selectedWindows.length}개 선택</p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {currentWindows.map((window) => {
              const selected = selectedWindows.includes(window.id)
              const confirmed = window.id === data.application?.assigned_window_id
              return (
                <button key={window.id} type="button" aria-pressed={selected} onClick={() => toggleWindow(window.id)} disabled={hasLiveApplication}
                  className={`min-h-[132px] rounded-2xl border p-4 text-left transition ${confirmed ? 'border-[#147A70] bg-[#EAF7F5]' : selected ? 'border-boot-primary bg-boot-soft shadow-sm' : 'border-boot-hairline bg-white'} disabled:cursor-default`}>
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-black text-boot-ink">{formatWindow(window.starts_at)}</span>
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${confirmed ? 'bg-[#147A70] text-white' : selected ? 'bg-boot-primary text-white' : 'bg-boot-soft text-boot-muted'}`}><Check size={15} /></span>
                  </span>
                  <span className="mt-2 flex items-center gap-2 text-xs font-bold text-boot-muted"><CalendarDays size={14} />{window.location_name}</span>
                  <span className="mt-2 flex items-center gap-2 text-xs font-bold text-boot-muted"><Users size={14} />정원 {window.capacity}명</span>
                  <span className="mt-2 block text-xs font-black text-[#315F5B]">신청 {window.applicant_count}명 · 배정 {window.assigned_count}명</span>
                  {confirmed ? <span className="mt-2 block text-xs font-black text-[#147A70]">이 일정으로 확정</span> : null}
                </button>
              )
            })}
          </div>
          {currentWindows.length === 0 ? <p className="py-6 text-center text-sm font-bold text-boot-muted">현재 모집 중인 시간이 없어요.</p> : null}
        </div>

        {notice ? (
          <div className="rounded-2xl bg-boot-soft p-4">
            <p role="status" className="text-sm font-bold leading-6 text-boot-muted">{notice}</p>
            {canReload ? <button type="button" onClick={() => void load()} className="mt-3 min-h-11 rounded-xl bg-white px-4 text-xs font-black text-boot-primary shadow-sm">다시 불러오기</button> : null}
          </div>
        ) : null}
        {!hasLiveApplication ? (
          <button type="button" onClick={() => void apply()} disabled={busy || selectedWindows.length === 0 || (partyType === 'friends' && !partyGroupId)} className="min-h-14 w-full rounded-2xl bg-boot-primary px-4 text-base font-black text-white disabled:opacity-45">
            {busy ? '저장하는 중…' : `선택한 ${selectedWindows.length}개 날짜로 한 번만 신청`}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function PanelMessage({ icon: Icon, message, action, spin = false }: { icon: typeof Loader2; message: string; action?: () => void; spin?: boolean }) {
  return <div className="mx-auto mt-5 flex min-h-40 w-full max-w-3xl flex-col items-center justify-center rounded-3xl border border-boot-hairline bg-white p-5 text-center"><Icon className={`text-boot-primary ${spin ? 'animate-spin' : ''}`} /><p className="mt-3 text-sm font-bold text-boot-muted">{message}</p>{action ? <button type="button" onClick={action} className="mt-4 rounded-full bg-boot-primary px-4 py-2 text-xs font-black text-white">다시 불러오기</button> : null}</div>
}

function activityImage(kind: string) {
  return ({
    board_game: '/images/match/events/event-board-game.webp',
    walk: '/images/match/events/event-walk-v2.webp',
    meal: '/images/match/events/event-dinner.webp',
    bowling: '/images/match/quantum-scheduled-five.png',
    other: '/images/match/events/event-jogging-v2.webp',
  } as Record<string, string>)[kind] ?? '/images/match/quantum-scheduled-five.png'
}

function isDiscovery(value: unknown): value is Discovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<Discovery>
  if (typeof row.server_now !== 'string' || typeof row.week_key !== 'string' || !Array.isArray(row.windows)
    || !row.windows.every(isWindowRow)) return false
  if (row.application === null) return true
  if (!row.application || typeof row.application !== 'object') return false
  const application = row.application as Partial<WeeklyPartyApplication>
  const party = application.party
  return typeof application.id === 'string'
    && typeof application.activity_id === 'string'
    && typeof application.week_key === 'string'
    && ['awaiting_consents', 'active', 'assigned', 'cancelled', 'expired'].includes(application.status ?? '')
    && typeof application.revision === 'number'
    && Array.isArray(application.candidate_window_ids)
    && Boolean(party)
    && (party?.type === 'solo' || party?.type === 'friends')
    && Number.isInteger(party?.size)
    && Number.isInteger(party?.accepted_count)
    && Number.isInteger(party?.pending_count)
    && (party?.my_role === 'owner' || party?.my_role === 'member')
    && ['pending', 'accepted', 'withdrawn'].includes(party?.my_consent_status ?? '')
}

function isWindowRow(value: unknown): value is WindowRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<WindowRow>
  return ['id', 'activity_id', 'activity_kind', 'week_key', 'title', 'summary', 'starts_at',
    'ends_at', 'application_closes_at', 'location_name'].every((key) => (
      typeof (row as Record<string, unknown>)[key] === 'string'
    ))
    && [row.capacity, row.applicant_count, row.assigned_count].every((count) => (
      Number.isSafeInteger(count) && (count as number) >= 0
    ))
    && (row.assigned_count as number) <= (row.capacity as number)
    && [row.starts_at, row.ends_at, row.application_closes_at].every((timestamp) => (
      typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))
    ))
}

function formatWindow(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
