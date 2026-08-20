'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CircleAlert,
  Clock3,
  MapPin,
  Plus,
  Sparkles,
  UsersRound,
} from 'lucide-react'

import MeetupIdeaCylinder from '@/components/meetups/MeetupIdeaCylinder'

import {
  featuredMeetupIdeas,
  getMeetupCategoryLabel,
  getMeetupDiscoveryCategories,
  launchWeekConcentrationStrip,
  meetupDiscoveryGroups,
  studyTopicGroups,
} from '@/lib/community/catalog'
import type { MeetupDiscoveryGroupId, StudyTopicGroupId } from '@/lib/community/catalog'
import type { MeetupCategory } from '@/lib/community/contracts'

type MeetupRecord = {
  id: string
  category: MeetupCategory
  title: string
  description: string
  place_name: string
  scheduled_at: string
  capacity: number
  status: 'open' | 'full'
  member_count: number
  joined: boolean
  is_host: boolean
  created_at: string
}

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable' | 'error'
type MeetupDiscoveryScope = 'all' | MeetupDiscoveryGroupId
type MeetupCategoryFilter = MeetupCategory | 'all'
type StudyTopicFilter = StudyTopicGroupId | 'all'

export default function MeetupHub() {
  const [discoveryScope, setDiscoveryScope] = useState<MeetupDiscoveryScope>('all')
  const [category, setCategory] = useState<MeetupCategoryFilter>('all')
  const [studyTopic, setStudyTopic] = useState<StudyTopicFilter>('all')
  const [meetups, setMeetups] = useState<MeetupRecord[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const openMeetupsRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let active = true
    const query = category === 'all' ? '' : `?category=${category}`

    setLoadState('loading')
    fetch(`/api/meetups${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          meetups?: MeetupRecord[]
          error?: string
          availability?: 'ready' | 'auth_required' | 'schema_unavailable'
        }
        if (!active) return
        if (response.ok) {
          if (payload.availability === 'auth_required') {
            setMeetups([])
            setLoadState('unauthorized')
            return
          }
          if (payload.availability === 'schema_unavailable') {
            setMeetups([])
            setLoadState('unavailable')
            return
          }
          setMeetups(payload.meetups ?? [])
          setLoadState('ready')
          return
        }
        if (response.status === 401) setLoadState('unauthorized')
        else if (response.status === 503) setLoadState('unavailable')
        else setLoadState('error')
      })
      .catch(() => active && setLoadState('error'))

    return () => {
      active = false
    }
  }, [category])

  const activeCategories = useMemo(
    () => (discoveryScope === 'all' ? null : getMeetupDiscoveryCategories(discoveryScope)),
    [discoveryScope],
  )

  const visibleIdeas = useMemo(() => {
    const categoryIdeas = category === 'all'
      ? (discoveryScope === 'all'
        ? featuredMeetupIdeas
        : featuredMeetupIdeas.filter((idea) => (activeCategories ?? []).includes(idea.category)))
      : featuredMeetupIdeas.filter((idea) => idea.category === category)

    if (discoveryScope !== 'study' || studyTopic === 'all') return categoryIdeas
    return categoryIdeas.filter((idea) => idea.topicGroup === studyTopic)
  }, [category, activeCategories, discoveryScope, studyTopic])

  const visibleMeetups = useMemo(() => {
    if (category !== 'all') return meetups.filter((meetup) => meetup.category === category)
    if (!activeCategories) return meetups
    const allowed = new Set(activeCategories)
    return meetups.filter((meetup) => allowed.has(meetup.category))
  }, [category, activeCategories, meetups])

  async function toggleMembership(meetup: MeetupRecord) {
    if (meetup.is_host) return
    setBusyId(meetup.id)
    setNotice('')

    const response = await fetch(`/api/meetups/${meetup.id}/join`, {
      method: meetup.joined ? 'DELETE' : 'POST',
    }).catch(() => null)

    if (!response) {
      setNotice('요청 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
      setBusyId(null)
      return
    }

    const payload = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) {
      setNotice(getMembershipError(payload.error))
      setBusyId(null)
      return
    }

    setMeetups((current) => current.map((item) => item.id === meetup.id
      ? {
          ...item,
          joined: !item.joined,
          member_count: Math.max(1, item.member_count + (item.joined ? -1 : 1)),
        }
      : item))
    setNotice(meetup.joined ? '참여 취소 처리되었습니다.' : '참여 등록했습니다.')
    setBusyId(null)
  }

  function browseIdeaCategory(nextCategory: MeetupCategory) {
    setDiscoveryScope('all')
    setCategory(nextCategory)
    setStudyTopic('all')
    setNotice(`${getMeetupCategoryLabel(nextCategory)} 모임을 모아봤어요.`)
    window.requestAnimationFrame(() => {
      openMeetupsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 sm:pt-7">
        <header className="flex items-end justify-between gap-4 border-b border-boot-hairline pb-4">
          <div>
            <p className="text-xs font-black text-boot-primary">Quantum 모임</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">지금 같이할 사람을 찾아요</h1>
            <p className="mt-2 max-w-xl text-sm font-bold leading-6 text-boot-muted">
              운동, 게임, 스터디처럼 하고 싶은 일을 고르고 바로 참여하거나 직접 열 수 있어요.
            </p>
          </div>
          <a
            href="/meetups/create"
            className="hidden min-h-11 shrink-0 items-center gap-2 rounded-[8px] bg-boot-primary px-4 py-3 text-sm font-black text-white sm:flex"
          >
            <Plus size={18} />
            모임 만들기
          </a>
        </header>

        <section className="py-5" aria-labelledby="meetup-ideas-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="meetup-ideas-heading" className="text-lg font-black">새로운 모임 아이디어</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">관심 있는 활동으로 바로 사람을 모아보세요.</p>
            </div>
          </div>

          <div className="mt-3 rounded-[8px] border border-boot-hairline bg-white p-4">
            <div className="flex items-start gap-2 text-xs font-black text-boot-info">
              <Sparkles size={15} />
              이번 주 집중 모집
            </div>
            <p className="mt-1 text-[11px] font-bold leading-5 text-boot-muted">초기에는 요일별 한 활동에 신청을 모아요. 실제 신청 인원이 아닌 운영 예정표예요.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {launchWeekConcentrationStrip.map((item) => (
                <div
                  key={`${item.day}-${item.category}`}
                  className="min-h-11 rounded-[8px] border border-[#BEE2EF] bg-[#F4FAFD] px-3 py-2 text-xs font-bold"
                >
                  <span className="text-boot-primary">{item.day}</span>
                  <span className="ml-2 text-boot-ink">{item.label}</span>
                  <span className="ml-2 block text-[11px] font-black text-boot-muted">카테고리: {getMeetupCategoryLabel(item.category)}</span>
                  <span className="mt-0.5 block text-[11px] text-boot-muted">{item.note}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="모임 카테고리 그룹">
            <button
              type="button"
              role="tab"
              aria-selected={discoveryScope === 'all'}
              onClick={() => {
                setDiscoveryScope('all')
                setCategory('all')
                setStudyTopic('all')
              }}
              className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${
                discoveryScope === 'all'
                  ? 'border-boot-primary bg-boot-primary text-white'
                  : 'border-boot-hairline bg-white text-boot-muted'
              }`}
            >
              전체
            </button>
            {meetupDiscoveryGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={discoveryScope === group.id}
                onClick={() => {
                  setDiscoveryScope(group.id)
                  setCategory('all')
                  setStudyTopic('all')
                }}
                className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${
                  discoveryScope === group.id
                    ? 'border-boot-primary bg-boot-primary text-white'
                    : 'border-boot-hairline bg-white text-boot-muted'
                }`}
              >
                {group.title}
              </button>
            ))}
          </div>

          {discoveryScope !== 'all' ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setCategory('all')}
                className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${
                  category === 'all'
                    ? 'border-boot-primary bg-boot-primary text-white'
                    : 'border-boot-hairline bg-white text-boot-muted'
                }`}
              >
                그룹 전체 보기
              </button>
              {activeCategories?.map((categoryId) => {
                const label = getMeetupCategoryLabel(categoryId)
                return (
                  <button
                    key={categoryId}
                    type="button"
                    aria-current={category === categoryId ? 'page' : undefined}
                    onClick={() => setCategory(categoryId)}
                    className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${
                      category === categoryId
                        ? 'border-boot-primary bg-boot-primary text-white'
                        : 'border-boot-hairline bg-white text-boot-muted'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          ) : null}

          {discoveryScope === 'study' ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="스터디 주제">
              <button
                type="button"
                aria-pressed={studyTopic === 'all'}
                onClick={() => setStudyTopic('all')}
                className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black ${studyTopic === 'all' ? 'border-boot-info bg-boot-info-soft text-boot-info' : 'border-boot-hairline bg-white text-boot-muted'}`}
              >
                스터디 전체
              </button>
              {studyTopicGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={studyTopic === group.id}
                  onClick={() => setStudyTopic(group.id)}
                  className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black ${studyTopic === group.id ? 'border-boot-info bg-boot-info-soft text-boot-info' : 'border-boot-hairline bg-white text-boot-muted'}`}
                >
                  {group.title}
                </button>
              ))}
            </div>
          ) : null}

          {visibleIdeas.length > 0 ? (
            <MeetupIdeaCylinder ideas={visibleIdeas} onBrowseCategory={browseIdeaCategory} />
          ) : (
            <a
              href={category === 'all' ? '/meetups/create' : `/meetups/create?category=${category}`}
              className="mt-4 flex min-h-20 items-center justify-between rounded-[8px] border border-boot-hairline bg-white px-4"
            >
              <span>
                <span className="block text-sm font-black">
                  {category === 'all' ? '모든 카테고리' : `${getMeetupCategoryLabel(category)} 모임 만들기`}
                </span>
                <span className="mt-1 block text-xs font-bold text-boot-muted">현재 표시된 카테고리에 등록된 아이디어가 없습니다.</span>
              </span>
              <ArrowRight size={18} className="text-boot-primary" />
            </a>
          )}
        </section>

        <section ref={openMeetupsRef} className="scroll-mt-20 border-t border-boot-hairline py-5" aria-labelledby="open-meetups-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="open-meetups-heading" className="text-lg font-black">실제 모임 목록</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">현재 만들어져 참여할 수 있는 모임이에요.</p>
            </div>
            <a href="/meetups/create" className="flex min-h-11 items-center gap-1 text-xs font-black text-boot-primary sm:hidden">
              <Plus size={16} /> 모임 만들기
            </a>
          </div>

          {notice ? <p className="mt-3 rounded-[8px] bg-white px-3 py-2 text-xs font-bold text-boot-primary" role="status">{notice}</p> : null}
          <MeetupListState state={loadState} />

          {loadState === 'ready' && visibleMeetups.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleMeetups.map((meetup) => (
                <article key={meetup.id} className="rounded-[8px] border border-boot-hairline bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-boot-primary">{getMeetupCategoryLabel(meetup.category)}</p>
                      <h3 className="mt-1 break-words text-base font-black">{meetup.title}</h3>
                    </div>
                    <span className="shrink-0 rounded-[6px] bg-[#EAF6F4] px-2 py-1 text-[10px] font-black text-[#147A70]">
                      {meetup.status === 'full' ? '마감' : '모집중'}
                    </span>
                  </div>
                  {meetup.description ? <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{meetup.description}</p> : null}
                  <dl className="mt-3 grid gap-2 text-xs font-bold text-boot-muted">
                    <div className="flex items-center gap-2"><CalendarDays size={15} /><span>{formatDate(meetup.scheduled_at)}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={15} /><span className="break-words">{meetup.place_name}</span></div>
                    <div className="flex items-center gap-2"><UsersRound size={15} /><span>{meetup.member_count}/{meetup.capacity}명</span></div>
                  </dl>
                  <button
                    type="button"
                    disabled={busyId === meetup.id || meetup.is_host || (!meetup.joined && meetup.status === 'full')}
                    onClick={() => toggleMembership(meetup)}
                    className={`mt-4 min-h-11 w-full rounded-[8px] px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-55 ${
                      meetup.joined ? 'border border-boot-hairline bg-white text-boot-muted' : 'bg-boot-primary text-white'
                    }`}
                  >
                    {busyId === meetup.id
                      ? '요청 처리중...'
                      : meetup.is_host
                        ? '내가 만든 모임'
                        : meetup.joined
                          ? '참여 취소'
                          : meetup.status === 'full'
                            ? '참여 마감'
                            : '참여하기'}
                  </button>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function MeetupListState({ state }: { state: LoadState }) {
  if (state === 'loading') {
    return <p className="mt-4 flex min-h-20 items-center gap-2 text-sm font-bold text-boot-muted"><Clock3 size={17} /> 모임 목록을 불러오는 중이에요.</p>
  }
  if (state === 'unauthorized') {
    return (
      <div className="mt-4 flex min-h-24 items-center justify-between gap-4 rounded-[8px] border border-boot-hairline bg-white p-4">
        <p className="text-sm font-bold leading-6 text-boot-muted">모임에 참여하려면 다시 로그인해 주세요.</p>
        <a href="/login?redirect=%2Fmeetups" className="shrink-0 text-sm font-black text-boot-primary">로그인</a>
      </div>
    )
  }
  if (state === 'unavailable') {
    return <StatusBox text="모임 기능을 준비 중이에요. 잠시 뒤 다시 확인해 주세요." />
  }
  if (state === 'error') {
    return <StatusBox text="모임 목록을 가져오지 못했어요. 잠시 뒤 다시 시도해 주세요." />
  }
  return null
}

function StatusBox({ text }: { text: string }) {
  return (
    <div className="mt-4 flex min-h-20 items-center gap-3 rounded-[8px] border border-boot-hairline bg-white p-4">
      <CircleAlert size={18} className="shrink-0 text-boot-coral" />
      <p className="text-sm font-bold leading-6 text-boot-muted">{text}</p>
    </div>
  )
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function getMembershipError(error?: string): string {
  if (error === 'meetup_full') return '현재 팀이 마감되어 참여할 수 없습니다.'
  if (error === 'meetup_closed') return '모임이 종료되어 참여할 수 없습니다.'
  if (error === 'profile_required') return '내 프로필 정보가 필요합니다. 설정 후 다시 시도해 주세요.'
  return '참여 동작에 실패했습니다. 다시 시도해 주세요.'
}
