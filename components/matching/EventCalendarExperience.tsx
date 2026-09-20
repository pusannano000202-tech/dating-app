'use client'

import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock3, CreditCard, MapPin, RefreshCw, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useRelationshipState } from '@/components/relationship/useRelationshipState'
import MeetingCoachingCards from '@/components/matching/MeetingCoachingCards'
import CalendarParticipation from '@/components/matching/CalendarParticipation'
import { parseEventCalendar, type CalendarAudience, type CalendarEvent, type EventCalendarResponse } from '@/lib/matching/event-calendar'
import { calendarMonthCells, calendarSelectedDay, canShowCalendarCoaching, canStartCalendarParticipation, formatCalendarCount, isCalendarEventOpen, seoulDateKey, shiftCalendarMonth } from '@/lib/matching/calendar-navigation'
import s from './match-journey.module.css'

export default function EventCalendarExperience({ initialMonth, previewData }: {
  initialMonth: string; previewData?: EventCalendarResponse
}) {
  const router = useRouter()
  const params = useSearchParams()
  const relationship = useRelationshipState()
  const audience: CalendarAudience = previewData
    ? previewData.relationshipStatus === 'in_relationship' ? 'couple' : 'single'
    : relationship.state?.status === 'in_relationship' || params.get('audience') === 'couple' ? 'couple' : 'single'
  const requestedMonth = params.get('month')
  const month = requestedMonth && /^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth) ? requestedMonth : initialMonth
  const eventId = params.get('event')
  const stage = eventId && ['details', 'guide', 'participation'].includes(params.get('step') ?? '') ? params.get('step')! : 'calendar'
  const scope = `${relationship.owner ?? ''}:${audience}:${month}`
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const epoch = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const [snapshot, setSnapshot] = useState<{scope: string; data: EventCalendarResponse; at: number} | null>(null)
  const [loading, setLoading] = useState(!previewData)
  const [failure, setFailure] = useState<'auth' | 'unavailable' | null>(null)
  const [eventIndex, setEventIndex] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const headingRef = useRef<HTMLHeadingElement>(null)
  const preview = Boolean(previewData)

  const reload = useCallback(async () => {
    if (previewData) return
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const ticket = ++epoch.current
    const timeout = window.setTimeout(() => abort.abort(), 12_000)
    try {
      const response = await fetch(`/api/match/calendar?month=${month}&audience=${audience}`, { cache: 'no-store', signal: abort.signal })
      const value: unknown = await response.json().catch(() => null)
      if (ticket !== epoch.current || scopeRef.current !== scope) return
      if (response.status === 401) { setFailure('auth'); setSnapshot(null); return }
      const parsed = response.ok ? parseEventCalendar(value, audience) : null
      if (!parsed) throw new Error('calendar_unavailable')
      // A newly changed private setting takes effect without exposing it in the URL to others.
      if (parsed.relationshipStatus === 'in_relationship' && audience === 'single') {
        router.replace(`/match/calendar?month=${month}&audience=couple`)
        return
      }
      setSnapshot({ scope, data: parsed, at: Date.now() })
      setFailure(null)
    } catch {
      if (ticket === epoch.current && scopeRef.current === scope) setFailure('unavailable')
    } finally {
      window.clearTimeout(timeout)
      if (ticket === epoch.current) { controller.current = null; setLoading(false) }
    }
  }, [audience, month, previewData, router, scope])

  useEffect(() => {
    epoch.current += 1
    controller.current?.abort()
    setSnapshot(null)
    setFailure(null)
    setLoading(!previewData)
    setEventIndex(0)
    void reload()
    const focus = () => { if (document.visibilityState === 'visible' && !controller.current) void reload() }
    const interval = window.setInterval(focus, 30_000)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    return () => {
      epoch.current += 1
      controller.current?.abort()
      window.clearInterval(interval)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
    }
  }, [reload, previewData])
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 15_000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    headingRef.current?.focus({ preventScroll: true })
  }, [stage, eventId])

  const data = previewData ?? (snapshot?.scope === scope ? snapshot.data : null)
  const stale = !preview && (Boolean(failure) || !snapshot || clock - snapshot.at > 75_000)
  const serverNow = data ? new Date(Date.parse(data.serverNow) + (preview ? 0 : Math.max(0, clock - (snapshot?.at ?? clock)))).toISOString() : new Date(clock).toISOString()
  const today = seoulDateKey(serverNow)
  const events = useMemo(() => [...(data?.events ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [data])
  const dayParam = params.get('day')
  const nextEventDay = seoulDateKey(events.find(event => (seoulDateKey(event.startsAt) ?? '') >= (today ?? ''))?.startsAt ?? '')
  const selectedEvent = events.find(event => event.id === eventId)
  const chosenDay = calendarSelectedDay({ month, requestedDay: dayParam, eventStartsAt: selectedEvent?.startsAt, nextEventDay, today })
  const eventsForDay = events.filter(event => seoulDateKey(event.startsAt) === chosenDay)
  const currentCard = eventsForDay[Math.min(eventIndex, eventsForDay.length - 1)]
  const activeStage = selectedEvent ? stage : 'calendar'

  function href(step = 'calendar', event?: CalendarEvent) {
    const next = new URLSearchParams({ audience, month })
    if (preview) next.set('preview', '1')
    if (chosenDay) next.set('day', chosenDay)
    if (event && step !== 'calendar') { next.set('event', event.id); next.set('step', step) }
    return `/match/calendar?${next}`
  }
  // These steps use the same fetched event. Keep URL/back history without a server round-trip.
  function navigateStep(click: MouseEvent<HTMLAnchorElement>) {
    if (click.button !== 0 || click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return
    const next = new URL(click.currentTarget.href)
    if (next.pathname !== '/match/calendar') return
    click.preventDefault()
    window.history.pushState(null, '', `${next.pathname}${next.search}`)
  }
  const backHref = activeStage === 'calendar' ? '/match'
    : activeStage === 'details' ? href() : href('details', selectedEvent)
  const open = selectedEvent ? isCalendarEventOpen(selectedEvent, serverNow, stale) : false
  const eligible = canStartCalendarParticipation(audience, data?.relationshipStatus ?? null)
  const coachingUnlocked = Boolean(!preview && selectedEvent && canShowCalendarCoaching(selectedEvent, serverNow, stale))

  return <main className={s.shell}>
    <div className={`${s.content} ${activeStage === 'calendar' ? s.calendarContent : ''}`}>
      <header className={s.header}>
        <Link className={s.back} href={backHref} onClick={navigateStep} prefetch={false} aria-label={activeStage === 'calendar' ? '매칭으로 돌아가기' : '이전 단계'}><ArrowLeft size={23} /></Link>
        <h1 ref={headingRef} tabIndex={-1}>{activeStage === 'guide' ? '만나면 이렇게 해요' : activeStage === 'participation' ? '참가 확인' : audience === 'couple' ? '커플 이벤트 캘린더' : '이벤트 캘린더'}</h1>
      </header>
      {preview ? <p className={s.previewFlag}>화면 검수용 예시 · 인원·일정은 실제 모집이 아니며 신청·결제되지 않아요.</p> : null}
      {!data && loading ? <div className={s.empty} role="status"><RefreshCw size={24} className="animate-spin" /><p>행사 일정을 불러오고 있어요.</p></div> : null}
      {!data && !loading ? <div className={s.empty} role="status">
        <CalendarDays size={28} /><h2>{failure === 'auth' ? '내 학교의 일정을 확인해요' : '일정을 불러오지 못했어요'}</h2>
        <p>{failure === 'auth' ? '로그인 후 참가 가능한 행사와 내 신청을 확인할 수 있어요.' : '연결을 확인한 뒤 다시 시도해 주세요. 모집 인원을 0명으로 표시하지 않아요.'}</p>
        {failure === 'auth' ? <Link className={s.button} href={`/login?redirect=${encodeURIComponent(`/match/calendar?${params.toString()}`)}`}>로그인하고 이어보기</Link> : <button className={s.button} onClick={() => void reload()}>다시 불러오기</button>}
      </div> : null}

      {data && activeStage === 'calendar' ? <>
        {eventId && !selectedEvent ? <p className={s.notice} role="status">선택한 행사를 이번 달 일정에서 확인하지 못했어요. 이전 신청은 아래의 신청 확인에서 확인할 수 있어요.</p> : null}
        <div className={s.stepHeading}><h2 style={{fontSize: 18}}>{audience === 'couple' ? '우리 커플과 함께할 날을 골라요' : '마음에 드는 날을 골라요'}</h2></div>
        <div className={s.calendarGrid}>
        <section className={s.calendar} aria-label="행사 날짜 선택">
          <div className={s.monthHeader}>
            <button className={s.back} aria-label="이전 달" onClick={() => router.push(`/match/calendar?month=${shiftCalendarMonth(month, -1)}&audience=${audience}${preview ? '&preview=1' : ''}`)}><ChevronLeft size={21} /></button>
            <strong>{Number(month.slice(0,4))}년 {Number(month.slice(5))}월</strong>
            <button className={s.back} aria-label="다음 달" onClick={() => router.push(`/match/calendar?month=${shiftCalendarMonth(month, 1)}&audience=${audience}${preview ? '&preview=1' : ''}`)}><ChevronRight size={21} /></button>
          </div>
          <div className={s.week} aria-hidden="true">{['일','월','화','수','목','금','토'].map(day => <span key={day}>{day}</span>)}</div>
          <div className={s.days}>{calendarMonthCells(month).map((date, index) => date ? <button key={date}
            className={`${s.day} ${date === today ? s.today : ''} ${date === chosenDay ? s.selectedDay : ''}`}
            aria-pressed={date === chosenDay} aria-current={date === today ? 'date' : undefined}
            aria-label={`${Number(date.slice(5,7))}월 ${Number(date.slice(8))}일${events.some(event => seoulDateKey(event.startsAt) === date) ? ', 행사 있음' : ', 등록된 행사 없음'}`}
            onClick={() => {
              const next = new URLSearchParams({audience,month,day:date})
              if(preview)next.set('preview','1')
              window.history.pushState(null,'',`/match/calendar?${next}`)
              setEventIndex(0)
            }}>
            {Number(date.slice(8))}{events.some(event => seoulDateKey(event.startsAt) === date) ? <span className={s.eventDot} /> : null}
          </button> : <span key={`blank-${index}`} />)}</div>
        </section>
        <div>{currentCard ? <>
          <Link href={href('details', currentCard)} onClick={navigateStep} prefetch={false} className={s.eventCard}>
            <div className={s.eventPhoto}><Image src={photo(currentCard)} alt={`${currentCard.title} 활동 분위기 예시 · AI 생성`} fill sizes="(max-width: 580px) 100vw, 540px" className={s.coverImage} /></div>
            <div className={s.eventDetails}><small>{formatDate(currentCard.startsAt)}</small><h3>{currentCard.title}</h3>
              <p>{audience === 'couple' ? '두 커플 · 2대2 · ' : ''}{formatTime(currentCard.startsAt)}</p>
              <p><strong>{formatCalendarCount(currentCard.applicantCount, stale)}</strong></p>
              <span className={s.entryArrow} aria-hidden="true"><ArrowRight size={21} /></span>
            </div>
          </Link>
          {eventsForDay.length > 1 ? <div className={s.monthHeader}>
            <button className={s.back} disabled={eventIndex === 0} aria-label="이날의 이전 행사" onClick={() => setEventIndex(index => Math.max(0,index-1))}><ChevronLeft size={18} /></button>
            <small>이날의 행사 {Math.min(eventIndex+1, eventsForDay.length)} / {eventsForDay.length}</small>
            <button className={s.back} disabled={eventIndex >= eventsForDay.length-1} aria-label="이날의 다음 행사" onClick={() => setEventIndex(index => Math.min(eventsForDay.length-1,index+1))}><ChevronRight size={18} /></button>
          </div> : null}
        </> : <div className={s.empty}><CalendarDays size={24} /><p>{data.events.length === 0 ? '이번 달에 등록된 행사가 아직 없어요.' : '이날은 등록된 행사가 없어요. 점이 있는 날짜를 골라보세요.'}</p></div>}</div>
        </div>
        <Freshness now={data.serverNow} stale={stale} preview={preview} reload={reload} />
        <Link href={audience === 'couple' ? '/match/couples/double-date' : '/match/weekly'} className={s.quietButton}>{audience === 'couple' ? '기존 커플 신청 확인' : '기존 친구 동반 신청 확인'} <ArrowRight size={15} /></Link>
      </> : null}

      {data && selectedEvent && activeStage === 'details' ? <>
        <div className={s.detailPhoto}><Image src={photo(selectedEvent)} alt={`${selectedEvent.title} 활동 분위기 예시 · AI 생성`} fill priority sizes="(max-width: 580px) 100vw, 540px" className={s.coverImage} /></div>
        <div className={s.stepHeading}><span className={s.eyebrow}>{audience === 'couple' ? '우리 커플과 새로운 커플의 만남' : '날짜를 정해 만나는 특별한 하루'}</span><h2>{selectedEvent.title}</h2><p>{selectedEvent.summary}</p></div>
        <div className={s.facts}>
          <div className={s.fact}><Clock3 size={19} /><span>{formatDate(selectedEvent.startsAt)} · {formatTime(selectedEvent.startsAt)}<small>신청 마감 {formatDate(selectedEvent.applicationClosesAt)} {formatTime(selectedEvent.applicationClosesAt)}</small></span></div>
          <div className={s.fact}><MapPin size={19} /><span>{selectedEvent.locationName || '장소 확인 중'}</span></div>
          <div className={s.fact}><Users size={19} /><span>{formatCalendarCount(selectedEvent.applicantCount, stale)}{audience === 'couple' ? <small>한 만남에 두 커플, 총 4명</small> : null}</span></div>
          <div className={s.fact}><CreditCard size={19} /><span>각자 보증금 10,000원<small>본인 결제 확인과 참가 절차를 마쳐야 신청이 완료돼요.</small></span></div>
        </div>
        <div className={s.actions}>
          <Link href={href('guide', selectedEvent)} onClick={navigateStep} prefetch={false} className={`${s.button} ${s.secondary}`}>{coachingUnlocked ? '지금 만남 안내 카드 열기' : '만나면 무엇을 하나요?'} <ArrowRight size={17} /></Link>
          {selectedEvent.myApplication || open && eligible ? <Link href={href('participation', selectedEvent)} onClick={navigateStep} prefetch={false} className={s.button}>{selectedEvent.myApplication ? '내 신청 상태 확인' : audience === 'couple' ? '연인과 참가 준비하기' : '참가 준비하기'} <ArrowRight size={17} /></Link> : !eligible ? <Link href="/profile/relationship" className={s.button}>내 연애 상태 확인하기 <ArrowRight size={17} /></Link> : <button className={s.button} disabled>{stale ? '최신 상태 확인이 필요해요' : '신청이 마감됐어요'}</button>}
        </div>
        {!eligible && !selectedEvent.myApplication ? <p className={s.notice}>{audience === 'couple' ? '커플 행사는 두 사람 모두 연애 중 상태여야 참가할 수 있어요. 연인도 직접 수락하고 각자의 자격과 보증금을 확인해요.' : '이 행사는 싱글 참가자를 위한 일정이에요. 내 연애 상태에 맞는 행사를 확인해 주세요.'}</p> : null}
        <Freshness now={data.serverNow} stale={stale} preview={preview} reload={reload} />
      </> : null}
      {data && selectedEvent && activeStage === 'guide' ? <>
        <MeetingCoachingCards audience={audience === 'couple' ? 'couples' : 'singles'} preview={!coachingUnlocked} unlocked={coachingUnlocked} activityKind={/보드|board|게임/i.test(selectedEvent.title) ? 'board_game' : undefined} />
        <Link href={href('details', selectedEvent)} onClick={navigateStep} prefetch={false} className={`${s.button} ${s.secondary}`}><ArrowLeft size={17} /> 행사로 돌아가기</Link>
      </> : null}
      {data && selectedEvent && activeStage === 'participation' ? <CalendarParticipation key={`${scope}:${selectedEvent.id}`} event={selectedEvent} eligible={eligible} preview={preview} stale={stale} serverNow={serverNow} ownerId={typeof relationship.owner === 'string' && relationship.owner !== 'unavailable' ? relationship.owner : null} onRefresh={reload} /> : null}
    </div>
  </main>
}

function photo(event: CalendarEvent) {
  return event.audience === 'couple' ? '/images/match/couple-play-20260915.webp'
    : /보드|board|게임/i.test(`${event.title} ${event.imageUrl}`) ? '/images/match/calendar-play-20260915.webp'
      : event.imageUrl || '/images/match/calendar-play-20260915.webp'
}
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(new Date(value)) }
function formatTime(value: string) { return new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)) }
function Freshness({now,stale,preview,reload}:{now:string;stale:boolean;preview:boolean;reload:()=>Promise<void>}) {
  return <div className={s.freshness}><span>{preview ? '예시 인원 · 실시간 데이터 아님' : stale ? '이전 조회 결과 · 최신 인원 재확인 필요' : `${formatTime(now)} 조회 · 30초마다 갱신`}</span>{!preview ? <button className={s.quietButton} onClick={() => void reload()} aria-label="행사와 신청 인원 새로고침"><RefreshCw size={15} /> 새로고침</button> : null}</div>
}
