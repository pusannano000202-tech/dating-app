'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown, Loader2, MapPin, MessageCircle, RefreshCw, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { featuredMeetupIdeas, getMeetupCategoryLabel } from '@/lib/community/catalog'
import { MEETUP_GENDER_LABELS } from '@/lib/community/meetup-gender'
import { parseDepartmentMeetups, presentDepartmentMeetups, type DepartmentMeetup } from './department-discovery'
import styles from './department-discovery.module.css'
import MentoringExperience from './MentoringExperience'

type LoadState = 'loading' | 'ready' | 'auth_required' | 'department_required' | 'profile_required' | 'unavailable' | 'error'

const departmentActivities = [
  { href: '/meetups/department/courses', title: '전공 같이 공부하기', subtitle: '내 수업부터, 함께 풀어봐요', image: '/images/meetups/meetup-study.webp' },
  { href: '/meetups/department/mentoring', title: '선후배 멘토링', subtitle: '먼저 해본 경험을 나눠요', image: '/images/quantum-campus-group.webp' },
  { href: '/meetups/department/social', title: '우리 과 가볍게 만나기', subtitle: '같은 학년 · 선후배 모두', image: '/images/meetups/meetup-cafe-friends-v1.webp' },
] as const

export default function DepartmentMeetupDiscovery({ mode = 'home' }: { mode?: 'home' | 'social' | 'mentoring' }) {
  if (mode === 'mentoring') return <MentoringExperience />
  return <DepartmentMeetupLegacyDiscovery mode={mode} />
}

function DepartmentMeetupLegacyDiscovery({ mode }: { mode: 'home' | 'social' | 'mentoring' }) {
  const [meetups, setMeetups] = useState<DepartmentMeetup[]>([])
  const [department, setDepartment] = useState('')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reload, setReload] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const timeout = window.setTimeout(() => controller.abort(), 12000)
    setLoadState('loading')
    setMeetups([])
    setDepartment('')

    async function load() {
      try {
        const response = await fetch('/api/meetups?scope_type=department&limit=30', { cache: 'no-store', signal: controller.signal })
        const payload = await response.json().catch(() => null) as { meetups?: unknown; availability?: string; error?: string } | null
        if (!active) return
        if (response.status === 401 || payload?.availability === 'auth_required') { setLoadState('auth_required'); return }
        if (payload?.error === 'profile_required') { setLoadState('profile_required'); return }
        if (payload?.error === 'department_identity_required') { setLoadState('department_required'); return }
        if (response.status === 503 || payload?.availability === 'schema_unavailable') { setLoadState('unavailable'); return }
        const parsed = response.ok && payload?.availability === 'ready' ? parseDepartmentMeetups(payload.meetups) : null
        if (!parsed) { setLoadState('error'); return }

        let label = parsed[0]?.department_label ?? ''
        // The existing list returns [] both for no rooms and for no department.
        // Check the user's own profile before calling an empty list "no recruitment".
        if (parsed.length === 0) {
          const profileResponse = await fetch('/api/profile/basic', { cache: 'no-store', signal: controller.signal })
          const profilePayload = await profileResponse.json().catch(() => null) as { profile?: { department?: unknown } } | null
          if (!active) return
          if (profileResponse.status === 401) { setLoadState('auth_required'); return }
          if (!profileResponse.ok || !profilePayload?.profile) { setLoadState('error'); return }
          const profileDepartment = profilePayload.profile.department
          if (typeof profileDepartment !== 'string' || !profileDepartment.trim()) { setLoadState('department_required'); return }
          label = profileDepartment.trim()
        }
        if (active) { setMeetups(parsed); setDepartment(label); setNow(Date.now()); setLoadState('ready') }
      } catch {
        if (active) setLoadState('error')
      } finally { window.clearTimeout(timeout) }
    }

    void load()
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [reload])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  // Legacy rooms have no mentoring type: title matches are discovery hints,
  // never a claim about a participant's role or an access-control condition.
  const filteredMeetups = mode === 'mentoring'
    ? meetups.filter(meetup => /멘토|멘티|선후배/.test(meetup.title))
    : meetups
  const presentation = presentDepartmentMeetups(filteredMeetups, now)
  const visible = showAll ? presentation.available : presentation.recommended
  const needsAll = presentation.available.length > presentation.recommended.length

  return <main className={styles.page}>
    <div className={styles.shell}>
      <Link href={mode === 'home' ? '/meetups' : '/meetups/department'} className={styles.back}><ArrowLeft size={17} />{mode === 'home' ? '모임 고르기' : '우리 과끼리'}</Link>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{department || '우리 과'} · 수업 밖에서도 가까이</p>
        <h1>{mode === 'home' ? '오늘, 우리 과에서' : mode === 'mentoring' ? '먼저 해본 선배와,' : '가볍게 만나, 더 가까이'}</h1>
        <p>{mode === 'home' ? '함께 공부하고, 경험을 나누고, 편하게 만나요.' : mode === 'mentoring' ? '혼자 고민하던 수업과 진로, 같이 이야기해요.' : '처음 보는 과 친구도 괜찮아요. 활동 하나로 시작해요.'}</p>
      </header>

      {mode === 'home' ? <nav className={styles.activityChoices} aria-label="우리 과에서 함께할 활동">
        {departmentActivities.map((activity, index) => <Link key={activity.href} href={activity.href} className={styles.activityChoice}>
          <Image src={activity.image} alt="" fill sizes="(max-width: 760px) 100vw, 740px" priority={index === 0} />
          <div className={styles.activityCaption}><span><strong>{activity.title}</strong><small>{activity.subtitle}</small></span><span className={styles.activityArrow}><ArrowRight size={20} /></span></div>
        </Link>)}
      </nav> : <div className={styles.introPhoto}>
        <Image src={mode === 'mentoring' ? '/images/quantum-campus-group.webp' : '/images/meetups/meetup-cafe-friends-v1.webp'} alt="학교 친구들이 모여 이야기하는 활동 분위기 예시" fill sizes="(max-width: 760px) 100vw, 740px" priority />
        <span>{mode === 'mentoring' ? '질문 하나도, 경험 하나도 좋은 시작' : '카페 · 식사 · 보드게임, 가벼운 약속부터'}</span>
      </div>}

      <Link href="/meetups#my-meetups" className={styles.continueLink}>
        <MessageCircle size={19} /><span>내가 참여 중인 모임 이어가기<small>이미 잡은 약속과 대화는 여기서</small></span><ArrowRight size={17} />
      </Link>

      {mode !== 'home' ? <>
      {mode === 'mentoring' ? <aside className={styles.mentoringStart}>
        <strong>어떤 만남으로 시작할까요?</strong>
        <p>도움을 구하거나 경험을 나누고 싶은 주제를 직접 적어요. 상대의 역할과 약속은 채팅에서 함께 확인해요.</p>
        <div>
          <Link href={`/meetups/create?category=study&scope=department&title=${encodeURIComponent('멘토링 · 선배에게 물어보고 싶어요')}`}>도움을 구할래요<ArrowRight size={16} /></Link>
          <Link href={`/meetups/create?category=study&scope=department&title=${encodeURIComponent('멘토링 · 제 경험을 나눌게요')}`}>경험을 나눌래요<ArrowRight size={16} /></Link>
        </div>
      </aside> : null}
      <section className={styles.section} aria-labelledby="department-meetups-title" aria-busy={loadState === 'loading'}>
        <div className={styles.sectionHeading}>
          <div><p className={styles.eyebrow}>{department || '우리 과'}의 열린 모임</p><h2 id="department-meetups-title">{mode === 'mentoring' ? '멘토링 관련 모집' : '지금 함께할 사람'}</h2></div>
          <button type="button" className={styles.iconButton} aria-label="학과 모임 새로고침" disabled={loadState === 'loading'} onClick={() => setReload(value => value + 1)}><RefreshCw size={18} className={loadState === 'loading' ? styles.spin : ''} /></button>
        </div>
        {loadState === 'loading' ? <div className={styles.status} role="status"><Loader2 size={21} className={styles.spin} />우리 과 모집을 확인하고 있어요.</div> : null}
        {loadState === 'auth_required' ? <div className={styles.status}><strong>로그인하고 우리 과 모임을 찾아요</strong><p>가입할 때 선택한 학과의 모임을 보여드려요.</p><Link className={styles.primary} href="/login?redirect=%2Fmeetups%2Fdepartment">로그인하기<ArrowRight size={16} /></Link></div> : null}
        {loadState === 'profile_required' || loadState === 'department_required' ? <div className={styles.status}><strong>{loadState === 'department_required' ? '어느 학과인지 알려주세요' : '기본정보를 먼저 확인해 주세요'}</strong><p>내 학과 정보가 있어야 같은 과 모임을 찾을 수 있어요.</p><Link className={styles.primary} href="/profile/edit">내 학과 확인하기<ArrowRight size={16} /></Link></div> : null}
        {loadState === 'error' || loadState === 'unavailable' ? <div className={styles.status} role="alert"><strong>모집 현황을 불러오지 못했어요</strong><p>잠시 후 다시 확인해 주세요.</p><button type="button" className={styles.secondary} onClick={() => setReload(value => value + 1)}>다시 불러오기<RefreshCw size={16} /></button></div> : null}
        {loadState === 'ready' ? <>
          {presentation.joined.length > 0 ? <div className={styles.joinedList} aria-label="참여 중인 학과 모임">{presentation.joined.map(meetup => <Link key={meetup.id} href={`/meetups/${meetup.id}`} className={styles.joinedLink}><MessageCircle size={17} /><span><small>참여 중 · {MEETUP_GENDER_LABELS[meetup.gender_mode]}</small><strong>{meetup.title}</strong></span><ArrowRight size={16} /></Link>)}</div> : null}
          {filteredMeetups.length === 0 ? <div className={styles.status}><strong>{mode === 'mentoring' ? '불러온 모임에 멘토링 모집이 없어요' : '아직 열린 우리 과 모임이 없어요'}</strong><p>{mode === 'mentoring' ? '모집 제목의 멘토·멘티·선후배 키워드로 모았어요. 관심 있는 주제로 직접 모집해 보세요.' : '새 모집이 열리면 여기서 확인할 수 있어요. 학교 전체 모임도 함께 둘러볼 수 있어요.'}</p><Link href="/meetups/explore?intent=play" className={styles.primary}>학교 전체 모임 살펴보기<ArrowRight size={16} /></Link></div> : <>
            {presentation.recommended.length > 0 ? <p className={styles.sectionNote}>참여 가능한 모임을 가까운 일정순으로 먼저 보여드려요.</p> : presentation.available.length > 0 ? <p className={styles.sectionNote}>지금 바로 참여 가능한 빈자리는 없어요. 불러온 모임에서 정원과 참가 조건을 확인해 주세요.</p> : <p className={styles.sectionNote}>불러온 학과 모임에 모두 참여 중이에요.</p>}
            <div className={styles.meetupList} id="department-meetup-list">{visible.map((meetup, index) => <MeetupCard key={meetup.id} meetup={meetup} featured={index === 0 && !showAll} now={now} />)}</div>
            {needsAll ? <button type="button" className={styles.showAll} aria-expanded={showAll} aria-controls="department-meetup-list" onClick={() => setShowAll(value => !value)}>{showAll ? '추천 모임만 보기' : `불러온 모임 모두 보기 (${presentation.available.length}개)`}<ChevronDown size={17} className={showAll ? styles.chevronOpen : ''} /></button> : null}
            <p className={styles.finePrint}>불러온 예정 모임 {meetups.length}개 기준 · 가까운 일정순 최대 30개{mode === 'mentoring' ? ' · 제목의 멘토·멘티·선후배 키워드 기준' : ''}</p>
          </>}
        </> : null}
      </section>
      </> : <p className={styles.homeNote}>친구 추가 없이, 원하는 활동에만 참여해요.<br />실제 참가 조건과 인원은 각 모집방에서 확인할 수 있어요.</p>}
      <div className={styles.secondaryRoute}><div><strong>생각해 둔 활동이 있나요?</strong><p>내 학과 모집으로 시작하고, 내용은 자유롭게 정해요.</p></div><Link href="/meetups/create?scope=department">직접 모임 열기<ArrowRight size={15} /></Link></div>
    </div>
  </main>
}

function MeetupCard({ meetup, featured, now }: { meetup: DepartmentMeetup; featured: boolean; now: number }) {
  const artwork = featuredMeetupIdeas.find(idea => idea.id === meetup.activity_key) ?? featuredMeetupIdeas.find(idea => idea.category === meetup.category)
  const full = meetup.status === 'full' || meetup.member_count >= meetup.capacity
  const begun = meetup.scheduled_at !== null && Date.parse(meetup.scheduled_at) <= now
  const condition = meetup.gender_eligibility === 'gender_required' ? '프로필 성별 확인 필요' : meetup.gender_eligibility === 'gender_restricted' ? '참가 성별 조건 확인' : begun ? '시작 시간이 지났어요' : full ? '정원이 찼어요' : '모집 중'
  return <Link href={`/meetups/${meetup.id}`} className={`${styles.meetupCard} ${featured ? styles.featured : ''}`}>
    <div className={styles.meetupPhoto}><Image src={artwork?.imageSrc ?? '/images/meetups/meetup-cafe-friends-v1.webp'} alt={`${getMeetupCategoryLabel(meetup.category)} 활동의 분위기 예시`} fill sizes={featured ? '(max-width: 580px) 100vw, 310px' : '130px'} /></div>
    <div className={styles.meetupBody}>
      <div className={styles.cardTags}><span>{getMeetupCategoryLabel(meetup.category)}</span><span>{MEETUP_GENDER_LABELS[meetup.gender_mode]}</span></div>
      <h3>{meetup.title}</h3>
      <p className={styles.cardMeta}><CalendarDays size={14} />{meetup.scheduled_at ? new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(meetup.scheduled_at)) : '채팅에서 함께 정하기'}</p>
      <p className={styles.cardMeta}><MapPin size={14} />{meetup.place_name?.trim() || '장소는 채팅에서 함께 정해요'}</p>
      <div className={styles.cardBottom}><span><UsersRound size={15} />{meetup.member_count}/{meetup.capacity}명 · {condition}</span><span>모임 보기<ArrowRight size={15} /></span></div>
    </div>
  </Link>
}
