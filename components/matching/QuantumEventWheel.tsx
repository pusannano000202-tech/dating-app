'use client'

import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  CalendarDays,
  Check,
  CircleCheckBig,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  Footprints,
  Gamepad2,
  Loader2,
  MapPin,
  UsersRound,
  Wine,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getQuantumEventById,
  getQuantumEventStartHref,
  quantumEventPhotos,
  type QuantumEvent,
  type QuantumEventKind,
  type QuantumEventMode,
  type QuantumPartyType,
} from '@/lib/matching/quantum-event-catalog'
import {
  isQuantumEventApplicantStatsMap,
  type QuantumEventApplicantStatsMap,
} from '@/lib/matching/quantum-event-stats'
import {
  isQuantumEventParticipation,
  type QuantumEventParticipation,
} from '@/lib/matching/quantum-event-participation'
import {
  getEventWheelOffset,
  getNextEventIndex,
  type EventWheelDirection,
} from '@/lib/matching/quantum-event-wheel'
import MeetingGuideStory from '@/components/matching/MeetingGuideStory'
import QuantumParticipationCommandCenter from '@/components/matching/QuantumParticipationCommandCenter'
import {
  deriveQuantumEventLifecycleStage,
  isQuantumEventLifecycle,
  type QuantumEventLifecycle,
} from '@/lib/matching/quantum-event-lifecycle'

type ParticipationAvailability = 'loading' | 'ready' | 'auth_required' | 'schema_unavailable' | 'error'
type StatsAvailability = 'loading' | 'ready' | 'unavailable'

interface QuantumEventWheelProps {
  events: readonly QuantumEvent[]
  mode: QuantumEventMode
  party: QuantumPartyType
  onPartyChange: (party: QuantumPartyType) => void
  onParticipationStateChange?: (active: boolean) => void
}

const eventIcons: Record<QuantumEventKind, LucideIcon> = {
  run: Footprints,
  'board-game': Gamepad2,
  drinks: Wine,
  dinner: Coffee,
  walk: MapPin,
}

export default function QuantumEventWheel({
  events,
  mode,
  party,
  onPartyChange,
  onParticipationStateChange,
}: QuantumEventWheelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeIndex, setActiveIndex] = useState(0)
  const [participation, setParticipation] = useState<QuantumEventParticipation | QuantumEventLifecycle | null>(null)
  const [availability, setAvailability] = useState<ParticipationAvailability>('loading')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [messageTone, setMessageTone] = useState<'error' | 'success'>('error')
  const [guideOpen, setGuideOpen] = useState(false)
  const [applicantStats, setApplicantStats] = useState<QuantumEventApplicantStatsMap>({})
  const [statsAvailability, setStatsAvailability] = useState<StatsAvailability>('loading')
  const pointerStartX = useRef<number | null>(null)
  const cancelInFlightRef = useRef(false)
  const cancelRequestControllerRef = useRef<AbortController | null>(null)
  const cancelRedirectTimerRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)
  const guideDialogRef = useRef<HTMLDivElement | null>(null)
  const guideReturnFocusRef = useRef<HTMLElement | null>(null)
  const activeEvent = events[activeIndex] ?? events[0]
  const isTonight = mode === 'tonight'

  const participationStage = isQuantumEventLifecycle(participation)
    ? deriveQuantumEventLifecycleStage(participation)
    : null
  const chooseAnother = searchParams.get('choose') === 'another'
  const dismissedCancelledParticipation = chooseAnother && participationStage === 'cancelled'

  useEffect(() => {
    onParticipationStateChange?.(Boolean(participation) && !dismissedCancelledParticipation)
  }, [dismissedCancelledParticipation, onParticipationStateChange, participation])

  function clearCancelRedirectTimer() {
    if (cancelRedirectTimerRef.current === null) return
    window.clearTimeout(cancelRedirectTimerRef.current)
    cancelRedirectTimerRef.current = null
  }

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      cancelRequestControllerRef.current?.abort()
      cancelRequestControllerRef.current = null
      clearCancelRedirectTimer()
      cancelInFlightRef.current = false
    }
  }, [])

  function openGuide() {
    guideReturnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    setGuideOpen(true)
  }

  useEffect(() => {
    if (!guideOpen) return

    const dialog = guideDialogRef.current
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    focusable?.[0]?.focus()

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setGuideOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const items = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleDialogKeyDown)
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown)
      guideReturnFocusRef.current?.focus()
    }
  }, [guideOpen])

  useEffect(() => {
    setActiveIndex(0)
    setMessage(null)
    setMessageTone('error')
  }, [mode])

  useEffect(() => {
    const controller = new AbortController()

    async function loadParticipation() {
      try {
        const response = await fetch('/api/match/event-participation', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('participation_lookup_failed')

        const payload = await response.json() as {
          participation?: unknown
          availability?: ParticipationAvailability
        }
        setParticipation(
          isQuantumEventLifecycle(payload.participation)
            ? payload.participation
            : isQuantumEventParticipation(payload.participation)
              ? payload.participation
              : null,
        )
        setAvailability(payload.availability ?? 'error')
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return
        setAvailability('error')
      }
    }

    void loadParticipation()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    async function loadApplicantStats() {
      try {
        const response = await fetch('/api/match/events/stats', {
          signal: controller.signal,
          cache: 'no-store',
        })
        if (!response.ok) throw new Error('event_stats_lookup_failed')

        const payload = await response.json() as {
          stats?: unknown
          availability?: StatsAvailability
        }
        setApplicantStats(isQuantumEventApplicantStatsMap(payload.stats) ? payload.stats : {})
        setStatsAvailability(payload.availability === 'ready' ? 'ready' : 'unavailable')
      } catch (error) {
        if ((error as { name?: string }).name === 'AbortError') return
        setStatsAvailability('unavailable')
      }
    }

    void loadApplicantStats()
    return () => controller.abort()
  }, [])

  const activeParticipationEvent = useMemo(
    () => getQuantumEventById(participation?.event_id),
    [participation?.event_id],
  )

  if (!activeEvent) return null

  const isCurrentParticipation = !dismissedCancelledParticipation
    && participation?.event_id === activeEvent.id
  const hasOtherParticipation = Boolean(
    participation && !dismissedCancelledParticipation && !isCurrentParticipation,
  )
  const lifecycleStage = participationStage
  const participationLocked = lifecycleStage !== null
    && lifecycleStage !== 'recruiting'
    && lifecycleStage !== 'cancelled'
  const isCurrentRecruiting = isCurrentParticipation && !participationLocked

  function rotate(direction: EventWheelDirection) {
    setActiveIndex((current) => getNextEventIndex(current, direction, events.length))
    setMessage(null)
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStartX.current = event.clientX
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerStartX.current === null) return
    const distance = event.clientX - pointerStartX.current
    pointerStartX.current = null
    if (Math.abs(distance) < 42) return
    rotate(distance > 0 ? -1 : 1)
  }

  function handleJoin() {
    setMessage(null)

    if (availability === 'auth_required') {
      router.push('/login?redirect=%2Fmatch')
      return
    }
    if (availability === 'schema_unavailable') {
      setMessage('참여 저장 기능을 준비 중이에요. 활동은 미리 둘러볼 수 있어요.')
      return
    }
    if (availability === 'error') {
      setMessage('신청 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    if (participationLocked) return
    if (isCurrentRecruiting) {
      router.push(getQuantumEventStartHref(activeEvent.id, participation.party_type))
      return
    }
    if (
      hasOtherParticipation
      && !window.confirm('현재 참여 중인 약속을 변경할까요? 기존 참여는 새 약속으로 바뀝니다.')
    ) {
      return
    }

    if (window.sessionStorage.getItem(`quantum-meeting-guide:${activeEvent.id}`) === 'confirmed') {
      router.push(getQuantumEventStartHref(activeEvent.id, party))
      return
    }

    openGuide()
  }

  function completeGuide() {
    window.sessionStorage.setItem(`quantum-meeting-guide:${activeEvent.id}`, 'confirmed')
    setGuideOpen(false)
    router.push(getQuantumEventStartHref(activeEvent.id, party))
  }

  async function handleCancel() {
    if (!participation || saving) return
    if (cancelInFlightRef.current) return

    cancelInFlightRef.current = true
    setSaving(true)
    setMessage(null)
    const cancelController = new AbortController()
    cancelRequestControllerRef.current = cancelController
    let redirectingToDiscovery = false
    try {
      const response = await fetch('/api/match/event-participation', {
        method: 'DELETE',
        signal: cancelController.signal,
      })
      if (!isMountedRef.current) return
      if (!response.ok) {
        setMessageTone('error')
        setMessage('참여 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
        return
      }

      const cancellation = await response.json().catch(() => null) as {
        cancelled?: unknown
        participation?: unknown
      } | null
      if (!isMountedRef.current) return
      if (!cancellation?.cancelled) {
        setMessageTone('error')
        setMessage('참여 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
        return
      }

      const remainingParticipation = getCancellationParticipation(cancellation.participation)
      if (remainingParticipation) {
        setParticipation(remainingParticipation)
        setMessageTone('success')
        setMessage('참여를 취소했어요. 다른 참여는 계속 진행 중이에요.')
        return
      }

      setParticipation(null)
      setMessageTone('success')
      setMessage('참여를 취소했어요.')
      redirectingToDiscovery = true
      clearCancelRedirectTimer()
      cancelRequestControllerRef.current = null
      cancelRedirectTimerRef.current = window.setTimeout(() => {
        cancelRedirectTimerRef.current = null
        cancelRequestControllerRef.current = null
        cancelInFlightRef.current = false
        if (!isMountedRef.current) return
        setSaving(false)
        router.replace('/match?choose=another')
        router.refresh()
      }, 650)
    } catch (error) {
      if ((error as { name?: string }).name === 'AbortError') return
      setMessageTone('error')
      setMessage('참여 취소에 실패했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      if (!redirectingToDiscovery) {
        if (cancelRequestControllerRef.current === cancelController) {
          cancelRequestControllerRef.current = null
        }
        cancelInFlightRef.current = false
        if (isMountedRef.current) setSaving(false)
      }
    }
  }

  if (participation && !dismissedCancelledParticipation) {
    return (
      <>
        <QuantumParticipationCommandCenter
          participation={participation}
          applicantStats={applicantStats[participation.event_id]}
          placement="match"
          onCancel={() => void handleCancel()}
          cancelling={saving}
        />
        {message && <p className={`mx-auto mt-3 max-w-xl px-4 text-center text-xs font-black ${messageTone === 'success' ? 'text-[#147A70]' : 'text-[#C94D63]'}`} role="status">{message}</p>}
      </>
    )
  }

  return (
    <>
    <section
      aria-label={isTonight ? '오늘 밤 활동 선택' : '날짜 잡기 활동 선택'}
      className={`relative -mx-4 min-h-[820px] overflow-hidden px-4 pb-8 pt-5 sm:-mx-6 sm:min-h-[900px] sm:px-6 ${isTonight ? 'bg-[#121821] text-white' : 'bg-boot-canvas text-boot-ink'}`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-end justify-between gap-4">
        <div>
          <p className={`text-[11px] font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
            {isTonight ? '오늘 밤 추천' : '날짜별 추천'}
          </p>
          <h2 className="mt-1 text-xl font-black sm:text-2xl">
            {isTonight ? '지금 끌리는 활동을 골라요' : '날짜와 활동을 함께 골라요'}
          </h2>
        </div>
        <p className={`shrink-0 text-xs font-black ${isTonight ? 'text-white/65' : 'text-boot-muted'}`} aria-live="polite">
          {activeIndex + 1} / {events.length}
        </p>
      </div>

      <div className="relative mx-auto mt-3 w-full max-w-6xl">
        <div
          id="quantum-event-wheel-cards"
          data-layout="cylindrical-carousel"
          aria-roledescription="원기둥형 활동 캐러셀"
          className="relative h-[clamp(410px,105vw,570px)] w-full touch-pan-y outline-none"
          style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
          tabIndex={0}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => { pointerStartX.current = null }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault()
              rotate(-1)
            }
            if (event.key === 'ArrowRight') {
              event.preventDefault()
              rotate(1)
            }
          }}
        >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-[7%] left-1/2 h-[12%] w-[78%] -translate-x-1/2 rounded-[50%] blur-xl ${isTonight ? 'bg-black/55' : 'bg-boot-ink/15'}`}
        />
        {events.map((event, index) => {
          const offset = getEventWheelOffset(index, activeIndex, events.length)
          const photo = quantumEventPhotos[event.kind]
          const Icon = eventIcons[event.kind]
          const selected = offset === 0
          return (
            <button
              key={event.id}
              type="button"
              aria-label={event.title}
              aria-current={selected ? 'true' : undefined}
              aria-hidden={offset === null}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActiveIndex(index)}
              className={`absolute left-1/2 top-3 aspect-[4/5] h-auto w-[clamp(260px,78vw,440px)] overflow-hidden rounded-lg border-2 bg-black shadow-[0_28px_80px_rgba(0,0,0,0.42)] transition-[transform,opacity,filter,border-color] duration-500 ease-out motion-reduce:transition-none ${offset === null ? 'pointer-events-none opacity-0' : ''} ${selected ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isTonight ? 'border-white/25' : 'border-white'}`}
              style={getWheelStyle(offset)}
            >
              <Image
                src={photo.src}
                alt={photo.alt}
                fill
                priority={index < 2}
                sizes="(min-width: 768px) 440px, 78vw"
                className="h-full w-full object-cover object-position-center"
              />
              <span className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/35" aria-hidden="true" />
              <span className="absolute inset-y-0 left-0 w-[14%] bg-gradient-to-r from-black/32 to-transparent" aria-hidden="true" />
              <span className="absolute inset-y-0 right-0 w-[14%] bg-gradient-to-l from-black/32 to-transparent" aria-hidden="true" />
              <span className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/62 text-white backdrop-blur-sm">
                <Icon size={19} aria-hidden="true" />
              </span>
            </button>
          )
        })}

        </div>

        <button
          type="button"
          aria-label="이전 활동"
          aria-controls="quantum-event-wheel-cards"
          onClick={() => rotate(-1)}
          className={`absolute left-1 top-1/2 z-50 flex h-14 w-14 min-h-[56px] min-w-[56px] touch-manipulation -translate-y-1/2 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-transform active:scale-95 sm:left-4 ${isTonight ? 'border-white/45 bg-black/80 text-white hover:bg-black' : 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary'}`}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="다음 활동"
          aria-controls="quantum-event-wheel-cards"
          onClick={() => rotate(1)}
          className={`absolute right-1 top-1/2 z-50 flex h-14 w-14 min-h-[56px] min-w-[56px] touch-manipulation -translate-y-1/2 items-center justify-center rounded-full border shadow-lg backdrop-blur-sm transition-transform active:scale-95 sm:right-4 ${isTonight ? 'border-white/45 bg-black/80 text-white hover:bg-black' : 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary'}`}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>

      <div className="relative z-50 mx-auto -mt-1 w-full max-w-xl text-center sm:-mt-3">
        {isCurrentParticipation && (
          <p className="mx-auto mb-2 inline-flex min-h-8 items-center gap-1.5 rounded-full bg-[#19A88F] px-3 text-xs font-black text-white">
            <Check size={15} aria-hidden="true" /> {getParticipationBadge(lifecycleStage)}
          </p>
        )}
        <h3 className="text-2xl font-black" aria-live="polite">{activeEvent.title}</h3>
        <div className={`mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-bold ${isTonight ? 'text-white/72' : 'text-boot-body'}`}>
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} aria-hidden="true" />{activeEvent.schedule}</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" />{activeEvent.location}</span>
          <span className="inline-flex items-center gap-1.5"><UsersRound size={14} aria-hidden="true" />목표 남 {activeEvent.maleCount} · 여 {activeEvent.femaleCount}</span>
        </div>

        <ApplicantStatus
          stats={applicantStats[activeEvent.id]}
          availability={statsAvailability}
          dark={isTonight}
        />

        <div className={`mt-4 border-y py-4 text-left ${isTonight ? 'border-white/15' : 'border-boot-hairline'}`}>
          <p className={`flex items-center gap-2 text-xs font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
            <Clock3 size={16} aria-hidden="true" /> {activeEvent.duration} 코스
          </p>
          <ol className="mt-3 grid gap-2">
            {activeEvent.missions.map((mission, index) => (
              <li key={mission} className="flex items-start gap-2 text-sm font-bold leading-5">
                <CircleCheckBig size={16} className={`mt-0.5 shrink-0 ${isTonight ? 'text-[#35D3B7]' : 'text-boot-primary'}`} aria-hidden="true" />
                <span><span className="sr-only">{index + 1}단계. </span>{mission}</span>
              </li>
            ))}
          </ol>
        </div>

        {!participationLocked ? (
          <>
            <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2" aria-label="참여 방식">
              <PartyButton active={party === 'solo'} label="혼자" onClick={() => onPartyChange('solo')} dark={isTonight} />
              <PartyButton active={party === 'friends'} label="친구와" onClick={() => onPartyChange('friends')} dark={isTonight} />
            </div>
            <p className={`mt-2 text-[11px] font-bold ${isTonight ? 'text-white/55' : 'text-boot-muted'}`}>
              친구와 참여는 같은 성별끼리, 본인 포함 최대 3명까지 가능해요.
            </p>
          </>
        ) : (
          <p className={`mt-4 text-xs font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
            위 상태 카드에서 지금 필요한 다음 행동을 확인할 수 있어요.
          </p>
        )}

        {hasOtherParticipation && (
          <p className={`mt-3 text-xs font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
            현재 다른 약속에 참여 중이에요{activeParticipationEvent ? `: ${activeParticipationEvent.title}` : ''}
          </p>
        )}
        {availability === 'schema_unavailable' && (
          <p className={`mt-3 text-xs font-bold ${isTonight ? 'text-white/65' : 'text-boot-muted'}`}>
            참여 저장 기능은 준비 중이에요. 활동은 먼저 둘러볼 수 있어요.
          </p>
        )}
        {message && <p className={`mt-3 text-xs font-black ${messageTone === 'success' ? 'text-[#147A70]' : 'text-[#FF8D7E]'}`} role="status">{message}</p>}

        {!participationLocked ? (
          <button
            type="button"
            onClick={handleJoin}
            disabled={saving || availability === 'loading'}
            className={`mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-5 text-sm font-black text-white transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${isTonight ? 'bg-[#E65D4D] hover:bg-[#D84F40]' : 'bg-boot-primary hover:bg-boot-primary-dark'}`}
          >
            {saving || availability === 'loading'
              ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /> 확인 중</>
              : <>{getJoinLabel({ isTonight, isCurrentParticipation: isCurrentRecruiting, hasOtherParticipation })}<ChevronRight size={18} aria-hidden="true" /></>}
          </button>
        ) : null}
        {isCurrentRecruiting && (
          <button
            type="button"
            onClick={() => void handleCancel()}
            disabled={saving}
            className={`mt-2 min-h-11 px-4 text-xs font-black underline underline-offset-4 disabled:opacity-50 ${isTonight ? 'text-white/65' : 'text-boot-muted'}`}
          >
            참여 취소
          </button>
        )}
      </div>
    </section>

    {guideOpen ? (
      <div ref={guideDialogRef} className="fixed inset-0 z-[100] overflow-y-auto bg-[#0D151C]/82 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8" role="dialog" aria-modal="true" aria-label="참여 전 필수 안내">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-3 flex items-center justify-between gap-3 text-white">
            <div>
              <p className="text-xs font-black text-[#F3B95F]">{activeEvent.title}</p>
              <p className="mt-1 text-sm font-bold">여섯 장을 모두 보면 신청 준비로 이어져요.</p>
            </div>
            <button type="button" onClick={() => setGuideOpen(false)} aria-label="안내 닫기" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/25 bg-black/30 text-white">
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <MeetingGuideStory onComplete={completeGuide} />
        </div>
      </div>
    ) : null}
    </>
  )
}

function getParticipationBadge(stage: ReturnType<typeof deriveQuantumEventLifecycleStage> | null) {
  if (stage === 'confirmed') return '일정 확정'
  if (stage === 'chat_open') return '채팅 열림'
  if (stage === 'in_progress') return '만남 진행 중'
  if (stage === 'cancelled') return '이번 회차 취소'
  if (stage === 'completed') return '만남 완료'
  return '참여 중'
}

function ApplicantStatus({
  stats,
  availability,
  dark,
}: {
  stats: QuantumEventApplicantStatsMap[string] | undefined
  availability: StatsAvailability
  dark: boolean
}) {
  if (availability === 'loading') {
    return <p className={`mt-4 text-xs font-bold ${dark ? 'text-white/62' : 'text-boot-muted'}`}>신청 현황 확인 중</p>
  }

  if (availability === 'unavailable') {
    return <p className={`mt-4 text-xs font-bold ${dark ? 'text-white/62' : 'text-boot-muted'}`}>실시간 신청 현황은 아직 연결되지 않았어요.</p>
  }

  if (!stats) {
    return <p className={`mt-4 text-xs font-bold ${dark ? 'text-white/62' : 'text-boot-muted'}`}>지금 첫 신청을 기다리고 있어요.</p>
  }

  return (
    <div className={`mt-4 border-y py-3 ${dark ? 'border-white/15' : 'border-boot-hairline'}`} aria-label="최근 신청 현황">
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm font-black">
        <span>대기 {stats.waiting_accounts}명</span>
        <span className={dark ? 'text-[#83CFF3]' : 'text-[#1575A7]'}>남 {stats.male_applicants}</span>
        <span className={dark ? 'text-[#FF9BA8]' : 'text-[#C94D63]'}>여 {stats.female_applicants}</span>
        {stats.friend_applications > 0 && <span>친구 신청 {stats.friend_applications}건</span>}
      </div>
      <p className={`mt-1 text-[10px] font-bold ${dark ? 'text-white/48' : 'text-boot-muted'}`}>
        최근 신청 계정 기준 · 친구 신청은 팀원이 확정되기 전 1건으로 집계해요.
      </p>
    </div>
  )
}

function PartyButton({
  active,
  label,
  onClick,
  dark,
}: {
  active: boolean
  label: string
  onClick: () => void
  dark: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-lg border px-3 text-sm font-black transition-colors ${active ? 'border-[#35D3B7] bg-[#35D3B7] text-[#10221F]' : dark ? 'border-white/20 bg-white/5 text-white hover:border-white/45' : 'border-boot-hairline bg-white text-boot-body hover:border-boot-primary'}`}
    >
      {label}
    </button>
  )
}

function getWheelStyle(offset: number | null): React.CSSProperties {
  if (offset === null) {
    return {
      transform: 'translate3d(-50%, 58px, -560px) rotateY(88deg) scale(0.62)',
      transformStyle: 'preserve-3d',
      zIndex: 0,
    }
  }

  const styles: Record<number, React.CSSProperties> = {
    [-2]: {
      transform: 'translate3d(calc(-50% - clamp(340px, 90vw, 720px)), 44px, -390px) rotateY(-76deg) scale(0.72)',
      transformOrigin: '100% 50%',
      transformStyle: 'preserve-3d',
      opacity: 0.34,
      filter: 'saturate(0.56) brightness(0.58)',
      zIndex: 5,
    },
    [-1]: {
      transform: 'translate3d(calc(-50% - clamp(260px, 68vw, 520px)), 18px, -155px) rotateY(-48deg) scale(0.88)',
      transformOrigin: '100% 50%',
      transformStyle: 'preserve-3d',
      opacity: 0.76,
      filter: 'saturate(0.78) brightness(0.74)',
      zIndex: 15,
    },
    [0]: {
      transform: 'translate3d(-50%, 0, 70px) rotateY(0deg) scale(1)',
      transformOrigin: '50% 50%',
      transformStyle: 'preserve-3d',
      opacity: 1,
      filter: 'none',
      zIndex: 30,
    },
    [1]: {
      transform: 'translate3d(calc(-50% + clamp(260px, 68vw, 520px)), 18px, -155px) rotateY(48deg) scale(0.88)',
      transformOrigin: '0% 50%',
      transformStyle: 'preserve-3d',
      opacity: 0.76,
      filter: 'saturate(0.78) brightness(0.74)',
      zIndex: 15,
    },
    [2]: {
      transform: 'translate3d(calc(-50% + clamp(340px, 90vw, 720px)), 44px, -390px) rotateY(76deg) scale(0.72)',
      transformOrigin: '0% 50%',
      transformStyle: 'preserve-3d',
      opacity: 0.34,
      filter: 'saturate(0.56) brightness(0.58)',
      zIndex: 5,
    },
  }

  return styles[offset]
}

function getJoinLabel({
  isTonight,
  isCurrentParticipation,
  hasOtherParticipation,
}: {
  isTonight: boolean
  isCurrentParticipation: boolean
  hasOtherParticipation: boolean
}) {
  if (isCurrentParticipation) return '참여 계속하기'
  if (hasOtherParticipation) return '이 활동으로 변경'
  return isTonight ? '오늘 밤 참여하기' : '이 약속 참여하기'
}

function getCancellationParticipation(value: unknown): QuantumEventParticipation | QuantumEventLifecycle | null {
  if (isQuantumEventLifecycle(value)) return value
  if (isQuantumEventParticipation(value)) return value
  return null
}
