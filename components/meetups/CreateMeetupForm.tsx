'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import LanguagePicker from '@/components/i18n/LanguagePicker'
import { useHistoryAccount } from '@/components/content-history/useHistoryAccount'
import { createdMeetupHref, getMeetupCreateBackHref, parseMeetupKoreanDate, meetupKoreanDateInput } from '@/lib/meetups/create-flow'
import { getStudyCourse, searchStudyCourses } from '@/lib/meetups/study-catalog'
import { validateMeetupCreateV3Input } from '@/lib/meetups/contracts'
import s from './create-meetup.module.css'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Minus, Plus } from 'lucide-react'

import {
  featuredMeetupIdeas,
  getMeetupCapacityRecommendation,
  getMeetupCategoryLabel,
  getMeetupDiscoveryCategories,
  meetupDiscoveryGroups,
  studyTopicGroups,
  type MeetupDiscoveryGroupId,
  type StudyTopicGroupId,
} from '@/lib/community/catalog'
import { isMeetupCategory, type MeetupCategory } from '@/lib/community/contracts'
import type { MeetupScope } from '@/lib/community/department-rooms'
import {
  MEETUP_GENDER_LABELS,
  MEETUP_GENDER_MODES,
  isMeetupGenderMode,
  type MeetupGenderMode,
} from '@/lib/community/meetup-gender'
import { resolveIdempotencyAttempt, type IdempotencyAttempt } from '@/lib/meetups/idempotency'
import { saveMeetupDraft, restoreMeetupDraft, removeMeetupDraft } from '@/lib/meetups/create-draft'

export default function CreateMeetupForm() {
  const router = useRouter()
  const account = useHistoryAccount()
  const { t } = useQuantumLocale()
  const [step, setStep] = useState(0)
  const submitLock = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const searchParams = useSearchParams()
  const requestedCategory = searchParams.get('category')
  const requestedIdea = searchParams.get('idea')
  // Discovery links provide editable defaults, not authorization. The server
  // still resolves the authenticated member's department for department scope.
  const initialScope: MeetupScope = searchParams.get('scope') === 'department' ? 'department' : 'school'
  const requestedTitle = (searchParams.get('title') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const initialIdea = featuredMeetupIdeas.find((idea) => idea.id === requestedIdea)
  const initialCategory = initialIdea?.category
    ?? (isMeetupCategory(requestedCategory) ? requestedCategory : 'running')
  const initialGroup = meetupDiscoveryGroups.find((group) => group.categories.includes(initialCategory))?.id
    ?? 'exercise'
  const initialStudyGroup = initialIdea?.topicGroup ?? 'major-foundation'
  const initialStudyTopics = initialIdea?.topicGroup
    ? (studyTopicGroups.find((group) => group.id === initialIdea.topicGroup)?.topics ?? [])
      .filter((topic) => initialIdea.title.includes(topic))
    : []

  const [discoveryGroup, setDiscoveryGroup] = useState<MeetupDiscoveryGroupId>(initialGroup)
  const [category, setCategory] = useState<MeetupCategory>(initialCategory)
  const [activePreset, setActivePreset] = useState(initialIdea ?? null)
  const [studyTopicGroup, setStudyTopicGroup] = useState<StudyTopicGroupId>(initialStudyGroup)
  const [selectedStudyTopics, setSelectedStudyTopics] = useState<string[]>([...initialStudyTopics])
  const [title, setTitle] = useState(initialIdea?.title ?? requestedTitle)
  const [description, setDescription] = useState(initialIdea?.description ?? '')
  const [placeName, setPlaceName] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [capacity, setCapacity] = useState(() => getMeetupCapacityRecommendation(initialCategory))
  const requestedGender = searchParams.get('gender_mode')
  const [genderMode, setGenderMode] = useState<MeetupGenderMode>(isMeetupGenderMode(requestedGender) ? requestedGender : 'all')
  const [scheduleStatus, setScheduleStatus] = useState<'confirmed'|'schedule_pending'>('schedule_pending')
  const [scopeType, setScopeType] = useState<MeetupScope>(initialScope)
  const [departmentProfile, setDepartmentProfile] = useState<{ owner: string; label: string } | null>(null)
  const departmentLabel = departmentProfile && departmentProfile.owner === account ? departmentProfile.label : ''
  const [studyMode, setStudyMode] = useState<'course' | 'free'>(initialIdea && initialIdea.topicGroup !== 'major-foundation' ? 'free' : 'course')
  const [courseQuery, setCourseQuery] = useState('')
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const backHref = getMeetupCreateBackHref(initialScope, searchParams.get('from'))
  const selectedCourse = getStudyCourse(selectedCourseId)
  const courseResults = searchStudyCourses(courseQuery, { department: departmentLabel }).slice(0, 8)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const createAttemptRef = useRef<IdempotencyAttempt | null>(null)
  const restoredToken = useRef<string|null>(null)
  useEffect(() => {
    const token=searchParams.get('resume')
    if(!token||restoredToken.current===token)return
    restoredToken.current=token
    let draft
    try{draft=restoreMeetupDraft(window.sessionStorage,token)}catch{draft=null}
    if(!draft){setError('임시 작성 내용이 만료됐거나 이 탭에서 찾을 수 없어요. 내용을 확인해 주세요.');return}
    setStep(draft.step);setDiscoveryGroup(draft.discoveryGroup);setCategory(draft.category)
    setActivePreset(featuredMeetupIdeas.find(p=>p.id===draft.presetId)??null)
    setStudyTopicGroup(draft.studyTopicGroup);setSelectedStudyTopics(draft.selectedStudyTopics)
    setTitle(draft.title);setDescription(draft.description);setPlaceName(draft.placeName)
    setScheduledAt(draft.scheduledAt);setEndsAt(draft.endsAt);setCapacity(draft.capacity)
    setGenderMode(draft.genderMode);setScopeType(draft.scopeType);setScheduleStatus(draft.scheduleStatus)
    // Only free-topic studies use the generic room API; official courses have
    // their own canonical room pool and never reach this saved request.
    if (draft.category === 'study') setStudyMode('free')
    createAttemptRef.current=draft.attempt
    removeMeetupDraft(window.sessionStorage,token)
  },[searchParams])

  useEffect(() => {
    setDepartmentProfile(null)
    if (!account || account === 'unavailable') return
    const controller = new AbortController()
    let active = true
    void fetch('/api/profile/basic', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then((payload: { profile?: { department?: unknown } } | null) => {
        const label = payload?.profile?.department
        if (active && typeof label === 'string') setDepartmentProfile({ owner: account, label: label.trim() })
      }).catch(() => { /* The server still validates the real department on create. */ })
    return () => { active = false; controller.abort() }
  }, [account])

  const minimumSchedule = useMemo(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000)
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
    return meetupKoreanDateInput(date)
  }, [])

  const visibleCategories = useMemo(
    () => getMeetupDiscoveryCategories(discoveryGroup),
    [discoveryGroup],
  )
  const visibleStudyTopics = studyTopicGroups.find((group) => group.id === studyTopicGroup)?.topics ?? []

  function chooseDiscoveryGroup(nextGroup: MeetupDiscoveryGroupId) {
    const nextCategory = getMeetupDiscoveryCategories(nextGroup)[0]
    if (!nextCategory) return

    setDiscoveryGroup(nextGroup)
    chooseCategory(nextCategory)
  }

  function chooseCategory(nextCategory: MeetupCategory) {
    if (nextCategory === category) return
    setCategory(nextCategory)
    setCapacity(getMeetupCapacityRecommendation(nextCategory))
    setActivePreset(null)
    setTitle('')
    setDescription('')
    if (nextCategory !== 'study') setSelectedStudyTopics([])
  }

  function chooseStudyGroup(nextGroup: StudyTopicGroupId) {
    setStudyTopicGroup(nextGroup)
    setCategory('study')
    setCapacity(getMeetupCapacityRecommendation('study'))
    setActivePreset(null)
    setSelectedStudyTopics([])
    setTitle('')
    setDescription('')
  }

  function toggleStudyTopic(topic: string) {
    setActivePreset(null)
    setSelectedStudyTopics((current) => {
      const next = current.includes(topic)
        ? current.filter((item) => item !== topic)
        : [...current, topic]
      setTitle(next.length > 0 ? `${next.join('·')} 스터디` : '')
      return next
    })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitLock.current) return
    if (category === 'study' && studyMode === 'course') return
    if (step < 3) { nextStep(); return }
    setError('')

    const requestPayload = {
      category,
      title,
      description,
      place_name: scheduleStatus==='schedule_pending'?null:placeName,
      scheduled_at: scheduleStatus==='schedule_pending'?null:parseMeetupKoreanDate(scheduledAt),
      ends_at: scheduleStatus==='schedule_pending'?null:parseMeetupKoreanDate(endsAt),
      schedule_status: scheduleStatus,
      capacity,
      gender_mode: genderMode,
      scope_type: scopeType,
      activity_key: activePreset?.id ?? null,
    }
    const attempt = resolveIdempotencyAttempt(
      createAttemptRef.current,
      JSON.stringify(requestPayload),
      () => crypto.randomUUID(),
    )
    const validation = validateMeetupCreateV3Input({ ...requestPayload, idempotency_key: attempt.idempotencyKey })
    if (!validation.ok) { setError(getCreateError(validation.error)); return }
    createAttemptRef.current = attempt
    submitLock.current = true
    setSubmitting(true)

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    const response = await fetch('/api/meetups', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...requestPayload,
        idempotency_key: attempt.idempotencyKey,
      }),
    }).catch(() => null)

    if (!response) {
      window.clearTimeout(timeout)
      submitLock.current = false
      setError('저장 여부를 확인하지 못했어요. 같은 내용으로 다시 확인하면 중복 생성 없이 결과를 확인해요.')
      setSubmitting(false)
      return
    }

    const payload = await response.json().catch(() => ({})) as { error?: string }
    window.clearTimeout(timeout)
    submitLock.current = false
    setSubmitting(false)
    if (!response.ok) {
      if (response.status === 401) {
        const token=crypto.randomUUID()
        let saved=false
        try{saved=saveMeetupDraft(window.sessionStorage,token,{step,discoveryGroup,category,presetId:activePreset?.id??null,studyTopicGroup,selectedStudyTopics,title,description,placeName,scheduledAt,endsAt,capacity,genderMode,scopeType,scheduleStatus,attempt})}catch{/* Keep the form when temporary storage is blocked. */}
        if(!saved){setError('로그인이 필요하지만 임시 작성 내용을 보관하지 못했어요. 이 창을 유지하고 새 탭에서 로그인한 뒤 다시 공개해 주세요.');return}
        const returnQuery = new URLSearchParams({ category, scope: scopeType, gender_mode:genderMode, resume:token })
        returnQuery.set('from', backHref)
        if (activePreset) returnQuery.set('idea', activePreset.id)
        router.push('/login?redirect=' + encodeURIComponent('/meetups/create?' + returnQuery))
        return
      }
      setError(getCreateError(payload.error))
      setSubmitting(false)
      return
    }

    const createdHref = createdMeetupHref(payload)
    if (!createdHref) { setError('저장 결과를 확인하지 못했어요. 같은 내용으로 다시 확인하거나 내 모임에서 찾아 주세요.'); return }
    router.push(createdHref)
    router.refresh()
  }

  const photo = activePreset?.imageSrc ?? featuredMeetupIdeas.find(idea => idea.category === category)?.imageSrc ?? (category==='soccer'?'/social-scenes/home-playmaker-football.webp':category==='baseball'?'/social-scenes/baseball.png':'/images/meetups/meetup-cafe-friends-v1.webp')
  function nextStep() {
    if (!formRef.current?.reportValidity()) return
    if(step===2&&scheduleStatus==='confirmed'){
      const begin=Date.parse(parseMeetupKoreanDate(scheduledAt)),end=Date.parse(parseMeetupKoreanDate(endsAt))
      if(!Number.isFinite(begin)||begin<Date.now()+30*60_000){setError(getCreateError('schedule_too_soon'));return}
      if(!Number.isFinite(end)||end-begin<30*60_000||end-begin>24*60*60_000){setError(getCreateError('invalid_end_time'));return}
    }
    setError('');setStep(value=>Math.min(3,value+1));window.scrollTo({top:0,behavior:'auto'})
  }
  const field = 'mt-2 min-h-12 w-full rounded-[14px] border border-boot-hairline bg-white px-4 text-base outline-none focus:ring-2 focus:ring-boot-primary/20'
  const choice = (selected:boolean) => 'min-h-12 rounded-[14px] border px-4 py-3 text-sm font-bold '+(selected?'border-boot-primary bg-boot-primary text-white':'border-boot-hairline bg-white text-boot-muted')
  const groupPhotos={exercise:'/images/meetups/meetup-badminton.webp',games:'/images/meetups/meetup-gaming.webp',study:'/images/meetups/meetup-study.webp',lifestyle:'/images/meetups/meetup-cafe-friends-v1.webp'}
  return <main className={s.page}><div className={s.shell}>
    <div className={s.top}><Link href={backHref} className={s.back}><ArrowLeft size={18}/>{t(backHref.startsWith('/meetups/department') ? '우리 과 모임으로' : '모임 둘러보기로')}</Link><LanguagePicker compact /></div>
    <header className={s.header}><small>CREATE A NEW MEETUP</small><h1>{t(scopeType === 'department' ? '우리 과 모임 만들기' : '새 모임 만들기')} <span className={s.stepCount}>{step + 1}/4</span></h1><p>{t(step===0?'새 방에서 함께할 활동을 골라주세요.':step===1?'누구와 함께할지 모집 조건을 정해요.':step===2?'약속을 지금 정하거나 모인 뒤 함께 정해요.':'공개할 모집 조건과 다음 참여 단계를 확인해 주세요.')}</p><div className={s.creationContext}><span>{scopeType === 'department' ? departmentLabel || '내 프로필의 학과' : '학교 전체'}</span><span>{t(getMeetupCategoryLabel(category))}{category === 'study' ? ` · ${studyMode === 'course' ? '전공 수업' : '자유 주제'}` : ''}</span></div></header>
    <ol className={s.progress}>{['활동','모집','약속','확인'].map((label,index)=><li key={label} aria-current={step===index?'step':undefined}>{index+1} · {t(label)}</li>)}</ol>
    <form ref={formRef} onSubmit={submit} className={s.form}>
      {step!==0&&step!==3?<div className={s.selected}><Image src={photo} alt="" width={180} height={140}/><span><strong>{t(getMeetupCategoryLabel(category))}</strong><small>{t(scopeType==='department'?'내 학과':'학교 전체')}</small></span></div>:null}
      {step===0 ? <>
        {activePreset?<p className={s.note}>{activePreset.title} · {activePreset.description}</p>:null}
        <div className={s.photos} role="group" aria-label={t('어떤 종류의 모임인가요?')}>
          {meetupDiscoveryGroups.map(group=><button key={group.id} type="button" className={s.photo} aria-pressed={discoveryGroup===group.id} onClick={()=>chooseDiscoveryGroup(group.id)}>
            <Image src={groupPhotos[group.id]} alt="" width={500} height={360}/><span><strong>{group.id==='study'?t('스터디 주제'):t('play.'+group.id)}</strong><small>{group.id==='study'?t('meetup.achieveSub'):t('play.'+group.id+'Sub')}</small><em>{discoveryGroup===group.id?'✓ ':''}{t('활동 고르기')}</em></span>
          </button>)}
        </div>
        <fieldset><legend>{t('세부 활동')}</legend><div className="mt-3 grid grid-cols-2 gap-2">{visibleCategories.map(item=><button key={item} type="button" className={choice(category===item)} aria-pressed={category===item} onClick={()=>chooseCategory(item)}>{t(getMeetupCategoryLabel(item))}</button>)}</div></fieldset>
        {category==='study'?<>
          <fieldset><legend>어떤 스터디를 만들까요?</legend><div className="mt-3 grid gap-2 sm:grid-cols-2"><button type="button" className={choice(studyMode==='course')} aria-pressed={studyMode==='course'} onClick={()=>setStudyMode('course')}>전공 수업 스터디</button><button type="button" className={choice(studyMode==='free')} aria-pressed={studyMode==='free'} onClick={()=>setStudyMode('free')}>자유 주제 스터디</button></div></fieldset>
          {studyMode === 'course' ? <section className={s.courseRoute} aria-label="공식 과목에 스터디 연결"><h2>같은 과목의 모집방으로 이어져요</h2><p>수업 이름이나 과목 코드를 골라요. 전공 같이 공부하기에서 찾는 모집 목록에 내 스터디도 함께 표시돼요.</p><label htmlFor="create-study-course">과목명 또는 과목 코드<input id="create-study-course" className={field} value={courseQuery} maxLength={80} placeholder="예: 공학미적분학, AN1600527" onChange={event=>{setCourseQuery(event.target.value);setSelectedCourseId('')}} /></label>{courseResults.length ? <ul className={s.courseResults}>{courseResults.map(course=><li key={course.id}><button type="button" aria-pressed={selectedCourseId===course.id} onClick={()=>setSelectedCourseId(course.id)}><span><strong>{course.title}</strong><small>{course.code}</small></span><span aria-hidden="true">{selectedCourseId===course.id?'✓':'선택'}</span></button></li>)}</ul> : courseQuery.trim() ? <p>연결된 공식 과목을 찾지 못했어요. 과목 목록에서 다른 이름으로 찾거나 직접 입력할 수 있어요.</p> : null}<Link href="/meetups/department/courses">학과·학년별 과목에서 고르기 →</Link><p className={s.courseNote}>자격증·독서·자율 공부 모임은 자유 주제 스터디로 만들어요.</p></section> : <fieldset><legend>{t('스터디 주제')}</legend><p className={s.note}>자유 주제 스터디는 일반 모임 목록에 표시돼요. 특정 수업의 모집방에 모이려면 전공 수업 스터디를 선택해 주세요.</p><div className="mt-3 flex flex-wrap gap-2">{studyTopicGroups.map(group=><button key={group.id} type="button" className={choice(studyTopicGroup===group.id)} aria-pressed={studyTopicGroup===group.id} onClick={()=>chooseStudyGroup(group.id)}>{group.title}</button>)}</div><div className="mt-3 grid grid-cols-2 gap-2">{visibleStudyTopics.map(topic=><button key={topic} type="button" className={choice(selectedStudyTopics.includes(topic))} aria-pressed={selectedStudyTopics.includes(topic)} onClick={()=>toggleStudyTopic(topic)}>{topic}</button>)}</div></fieldset>}
        </>:null}
      </>:null}
      {step===1?<>
        <label>{t('모임 제목')}<input className={field} value={title} onChange={event=>setTitle(event.target.value)} minLength={4} maxLength={60} required /></label>
        <label>{t('간단한 설명')}<textarea className={field+' py-3'} value={description} onChange={event=>setDescription(event.target.value)} maxLength={500} rows={3}/><span className="block text-right text-xs text-boot-muted">{description.length}/500</span></label>
        <fieldset><legend>{t('모집 인원')}</legend><div className="mt-3 flex items-center justify-between rounded-2xl border border-boot-hairline bg-white p-2"><button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" aria-label="인원 줄이기" disabled={capacity<=2} onClick={()=>setCapacity(value=>Math.max(2,value-1))}><Minus size={19}/></button><strong>{capacity}</strong><button type="button" className="flex h-11 w-11 items-center justify-center disabled:opacity-30" aria-label="인원 늘리기" disabled={capacity>=20} onClick={()=>setCapacity(value=>Math.min(20,value+1))}><Plus size={19}/></button></div></fieldset>
        <fieldset><legend>{t('모집 범위')}</legend><div className="mt-3 grid grid-cols-2 gap-2">{(['school','department'] as const).map(value=><button key={value} type="button" className={choice(scopeType===value)} aria-pressed={scopeType===value} onClick={()=>setScopeType(value)}>{t(value==='school'?'학교 전체':'내 학과')}</button>)}</div></fieldset>
        <fieldset><legend>{t('참여 성별 조건')}</legend><div className="mt-3 flex flex-wrap gap-2">{MEETUP_GENDER_MODES.map(value=><button key={value} type="button" className={choice(genderMode===value)} aria-pressed={genderMode===value} onClick={()=>setGenderMode(value)}>{t(MEETUP_GENDER_LABELS[value])}</button>)}</div></fieldset>
        <p className={s.note}>{t('등록 프로필 성별로 개설·참가 조건을 확인해요. 실명 인증 기능은 아니에요.')}</p>
      </>:null}
      {step===2?<>
        <fieldset><legend>{t('일정 정하기')}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{(['schedule_pending','confirmed'] as const).map(value=><button key={value} type="button" className={choice(scheduleStatus===value)} aria-pressed={scheduleStatus===value} onClick={()=>{setScheduleStatus(value);setError('')}}>{t(value==='schedule_pending'?'채팅에서 함께 정하기':'지금 장소와 시간 정하기')}</button>)}</div></fieldset>
        {scheduleStatus==='schedule_pending'?<p className={s.note}>{t('먼저 사람을 모아요. 참가자 채팅의 + 메뉴에서 날짜·장소 투표를 만들고, 함께 정한 약속을 주최자가 확정해요.')}</p>:<>
        <label>{t('만날 장소')}<input className={field} value={placeName} onChange={event=>setPlaceName(event.target.value)} minLength={2} maxLength={80} required /></label>
        <label>{t('날짜와 시간')}<input className={field} type="datetime-local" value={scheduledAt} onChange={event=>{const value=event.target.value;setScheduledAt(value);const iso=parseMeetupKoreanDate(value);if(!endsAt&&iso)setEndsAt(meetupKoreanDateInput(new Date(Date.parse(iso)+2*60*60_000)))}} min={minimumSchedule} required /></label>
        <label>{t('끝나는 시간')}<input className={field} type="datetime-local" value={endsAt} onChange={event=>setEndsAt(event.target.value)} min={scheduledAt||minimumSchedule} required /></label>
        <p className={s.note}>{t('한국 시간 기준이에요. 종료 시간은 시작 후 30분~24시간 사이로 정해요.')}</p>
        </>}
      </>:null}
      {step===3?<>
        <article className={s.review}><Image src={photo} alt="" width={900} height={600}/><div className={s.reviewBody}><h2>{title}</h2><dl><dt>{t('만날 장소')}</dt><dd>{scheduleStatus==='schedule_pending'?t('채팅에서 함께 정하기'):placeName}</dd><dt>{t('날짜와 시간')}</dt><dd>{scheduleStatus==='schedule_pending'?t('아직 정하지 않았어요'):scheduledAt.replace('T',' ')+' (UTC+9)'}</dd><dt>{t('끝나는 시간')}</dt><dd>{scheduleStatus==='schedule_pending'?t('아직 정하지 않았어요'):endsAt.replace('T',' ')+' (UTC+9)'}</dd><dt>{t('모집 인원')}</dt><dd>{capacity}</dd><dt>{t('모집 범위')}</dt><dd>{t(scopeType==='department'?'내 학과':'학교 전체')}</dd><dt>{t('참여 성별 조건')}</dt><dd>{t(MEETUP_GENDER_LABELS[genderMode])}</dd></dl><p className="mt-4 whitespace-pre-wrap text-sm text-boot-muted">{description}</p></div></article>
        <p className={s.note}>{t('공개하면 선택한 활동의 모집 목록과 내 모임에 표시돼요. 참가자는 보증금 확인 → 참가 신청 → 방장 수락 후 채팅에 참여해요. 모임 개설은 보증금 납부 완료를 뜻하지 않아요.')}</p>
      </>:null}
      <p className={s.note}>{t('연락처와 실명은 공개하지 마세요. 신고는 운영자가 확인해요.')}</p>
      {error?<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>:null}
      <div className={s.actions}>{step>0?<button type="button" className={s.previous} disabled={submitting} onClick={()=>{setError('');setStep(value=>value-1);window.scrollTo({top:0,behavior:'auto'})}}>{t('common.back')}</button>:null}{category === 'study' && studyMode === 'course' ? <Link className={s.next} href={selectedCourse ? `/meetups/study?course=${encodeURIComponent(selectedCourse.id)}` : '/meetups/department/courses'}>{selectedCourse ? `${selectedCourse.title} 모집방으로` : '과목 고르고 스터디 열기'}</Link> : <button type="submit" disabled={submitting} className={s.next}>{submitting?t('모임을 만들고 있어요...'):step===3?t('모임 공개하기'):t('common.next')}</button>}</div>
    </form>
  </div></main>
}

function getCreateError(error?: string): string {
  if (error === 'request_not_allowed') return '현재 앱 주소의 연결 보안을 확인하지 못했어요. 입력한 내용은 유지돼요. 공식 앱 주소를 새 탭에서 열어 확인한 뒤 다시 시도해 주세요.'
  if (error === 'community_unavailable') return '서버 연결을 확인하지 못했어요. 입력한 내용은 유지돼요. 잠시 후 같은 화면에서 다시 시도해 주세요.'
  if (error === 'community_schema_unavailable') return '모임 저장소 연결 전이에요. DB 적용 후 바로 공개할 수 있어요.'
  if (error === 'profile_required') return '기본정보를 먼저 입력해 주세요.'
  if (error === 'schedule_too_soon') return '최소 30분 뒤 시간으로 정해 주세요.'
  if (error === 'invalid_schedule') return '날짜와 시간을 다시 선택해 주세요.'
  if (error === 'invalid_end_time') return '끝나는 시간은 시작 뒤 30분~24시간 안으로 정해 주세요.'
  if (error === 'invalid_scope_type') return '학교 전체 또는 내 학과 중 하나를 선택해 주세요.'
  if (error === 'department_identity_required') return '학과 모임을 만들려면 가입 정보의 학과를 먼저 확인해 주세요.'
  if (error === 'invalid_title') return '제목을 4자 이상 입력해 주세요.'
  if (error === 'invalid_place') return '만날 장소를 2자 이상 입력해 주세요.'
  if (error === 'meetup_gender_required') return '등록 프로필 성별을 먼저 설정해야 이 조건으로 모임을 만들 수 있어요.'
  if (error === 'meetup_gender_restricted') return '등록 프로필 성별이 선택한 모임 조건과 맞지 않아요.'
  return '입력한 내용을 확인한 뒤 다시 시도해 주세요.'
}
