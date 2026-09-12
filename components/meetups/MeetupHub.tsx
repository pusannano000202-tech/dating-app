'use client'

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowLeft,
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
import DepartmentChallengeEntry from '@/components/meetups/DepartmentChallengeEntry'
import PlaceLinks from '@/components/places/PlaceLinks'

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
import {
  isMeetupGenderMode,
  MEETUP_GENDER_LABELS,
  MEETUP_GENDER_MODES,
  type MeetupGenderEligibility,
  type MeetupGenderMode,
} from '@/lib/community/meetup-gender'
import { projectLegacyMeetupPlace } from '@/lib/community/meetup-place'
import { buildMeetupExploreHref } from '@/lib/meetups/discovery-navigation'
import { parseMeetupPagination } from '@/lib/meetups/list-page'
import {
  getNextSocialRailIndex,
  getSocialRailScrollBehavior,
  getSocialRailSwipeDirection,
} from '@/lib/community/social-rail-navigation'
import {
  getSocialMeetupCategories,
  socialMeetupDiscoveryOptions,
  type SocialMeetupDiscoveryId,
} from '@/lib/community/social-meetup-discovery'

type MeetupRecord = {
  id: string
  category: MeetupCategory
  title: string
  description: string
  place_name: string | null
  scheduled_at: string | null
  schedule_status?: 'confirmed' | 'schedule_pending'
  capacity: number
  status: 'open' | 'full'
  member_count: number
  joined: boolean
  is_host: boolean
  created_at: string
  gender_mode?: MeetupGenderMode
  gender_eligibility?: MeetupGenderEligibility
  scope_type?: 'school' | 'department'
  department_label?: string | null
  activity_key?: string | null
  ends_at?: string | null
  revision?: number
}

type LoadState = 'loading' | 'ready' | 'unauthorized' | 'unavailable' | 'error'
type MeetupDiscoveryScope = 'all' | MeetupDiscoveryGroupId
type MeetupCategoryFilter = MeetupCategory | 'all'
type StudyTopicFilter = StudyTopicGroupId | 'all'
type MeetupGenderFilter = MeetupGenderMode | 'any'

export default function MeetupHub({ compact = false }: { compact?: boolean }) {
  const [socialLane, setSocialLane] = useState<SocialMeetupDiscoveryId>('mixed-social')
  const [discoveryScope, setDiscoveryScope] = useState<MeetupDiscoveryScope>('all')
  const [category, setCategory] = useState<MeetupCategoryFilter>('all')
  const [studyTopic, setStudyTopic] = useState<StudyTopicFilter>('all')
  const [genderFilter, setGenderFilter] = useState<MeetupGenderFilter>('any')
  const [memberScope, setMemberScope] = useState<'school' | 'department'>('school')
  const [meetups, setMeetups] = useState<MeetupRecord[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [reloadToken, setReloadToken] = useState(0)
  const [pageRequest, setPageRequest] = useState<{scope:string;cursor:string}|null>(null)
  const [nextCursor, setNextCursor] = useState<string|null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState(false)
  const listScope = `${category}:${genderFilter}:${reloadToken}:${compact}:${memberScope}`
  const pageCursor = pageRequest?.scope === listScope ? pageRequest.cursor : null
  const membershipRequestInFlight = useRef(false)
  const socialRailRef = useRef<HTMLDivElement | null>(null)
  const socialRailPointerStart = useRef<{ x: number; y: number } | null>(null)
  const suppressSocialRailClickRef = useRef(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const savedScope = params.get('scope')
    const savedCategory = params.get('category')
    const savedTopic = params.get('topic')
    const savedGenderMode = params.get('gender_mode')
    if (params.get('scope_type') === 'department') setMemberScope('department')
    if (meetupDiscoveryGroups.some((group) => group.id === savedScope)) setDiscoveryScope(savedScope as MeetupDiscoveryGroupId)
    const validCategories = meetupDiscoveryGroups.flatMap((group) => getMeetupDiscoveryCategories(group.id))
    if (validCategories.includes(savedCategory as MeetupCategory)) {
      setCategory(savedCategory as MeetupCategory)
      if (!meetupDiscoveryGroups.some((group) => group.id === savedScope)) {
        const categoryGroup = meetupDiscoveryGroups.find((group) => getMeetupDiscoveryCategories(group.id).includes(savedCategory as MeetupCategory))
        if (categoryGroup) setDiscoveryScope(categoryGroup.id)
      }
    }
    if (studyTopicGroups.some((group) => group.id === savedTopic)) setStudyTopic(savedTopic as StudyTopicGroupId)
    if (isMeetupGenderMode(savedGenderMode)) setGenderFilter(savedGenderMode)
  }, [])

  useEffect(() => {
    const rail = socialRailRef.current
    if (!rail) return
    function alignSocialRailToSelectedLane() {
      if (!rail) return
      const card = rail.querySelector<HTMLElement>(`[data-social-lane="${socialLane}"]`)
      if (!card) return
      const railRect = rail.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const nextLeft = rail.scrollLeft + cardRect.left - railRect.left - (rail.clientWidth - card.clientWidth) / 2
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({ left: nextLeft, behavior: getSocialRailScrollBehavior(reducedMotion) })
    }
    alignSocialRailToSelectedLane()
    const observer = new ResizeObserver(alignSocialRailToSelectedLane)
    observer.observe(rail)
    return () => { observer.disconnect() }
  }, [socialLane])

  useEffect(() => {
    const clearPointerStart = () => { socialRailPointerStart.current = null }
    const resetGesture = () => {
      socialRailPointerStart.current = null
      suppressSocialRailClickRef.current = false
    }
    window.addEventListener('pointerup', clearPointerStart)
    window.addEventListener('pointercancel', resetGesture)
    return () => {
      window.removeEventListener('pointerup', clearPointerStart)
      window.removeEventListener('pointercancel', resetGesture)
    }
  }, [])

  function rememberFilters(
    nextScope: MeetupDiscoveryScope,
    nextCategory: MeetupCategoryFilter,
    nextTopic: StudyTopicFilter,
    nextGenderFilter: MeetupGenderFilter = genderFilter,
  ) {
    const url = new URL(window.location.href)
    for (const [key, value] of [['scope', nextScope], ['category', nextCategory], ['topic', nextTopic]]) {
      if (value === 'all') url.searchParams.delete(key)
      else url.searchParams.set(key, value)
    }
    if (nextGenderFilter === 'any') url.searchParams.delete('gender_mode')
    else url.searchParams.set('gender_mode', nextGenderFilter)
    window.history.replaceState(null, '', url)
  }

  useEffect(() => { setPageRequest(null) }, [listScope])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 12000)
      const params = new URLSearchParams()
      if (compact) params.set('scope_type', memberScope)
    if (category !== 'all') params.set('category', category)
    if (genderFilter !== 'any') params.set('gender_mode', genderFilter)
    if (pageCursor) params.set('cursor', pageCursor)
    const query = params.size ? `?${params.toString()}` : ''

    setPageError(false)
    setLoadingMore(!!pageCursor)
    if (!pageCursor) { setMeetups([]); setNextCursor(null); setLoadState('loading') }
    fetch(`/api/meetups${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({})) as {
          meetups?: MeetupRecord[]
          error?: string
          availability?: 'ready' | 'auth_required' | 'schema_unavailable'
          has_more?: boolean
          next_cursor?: string | null
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
          const pagination = parseMeetupPagination(payload)
          if (!pagination || !Array.isArray(payload.meetups)) throw new Error('invalid_page')
          setMeetups(previous => Array.from(new Map([...(pageCursor ? previous : []), ...payload.meetups!].map(item => [item.id,item])).values()))
          setNextCursor(pagination.nextCursor)
          setLoadState('ready')
          return
        }
        if (response.status === 401) { setMeetups([]); setLoadState('unauthorized') }
        else if (pageCursor) setPageError(true)
        else if (response.status === 503) setLoadState('unavailable')
        else setLoadState('error')
      })
      .catch(() => { if (active) { if (pageCursor) setPageError(true); else setLoadState('error') } })
      .finally(() => { window.clearTimeout(timeout); if (active) setLoadingMore(false) })

    return () => {
      active = false
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [category, genderFilter, reloadToken, compact, memberScope, pageCursor, pageRequest])

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

  const recommendedIdeas = useMemo(() => {
    const categories = getSocialMeetupCategories(socialLane)
    return categories === null
      ? visibleIdeas
      : visibleIdeas.filter((idea) => categories.includes(idea.category))
  }, [socialLane, visibleIdeas])

  const visibleMeetups = useMemo(() => {
    if (category !== 'all') return meetups.filter((meetup) => meetup.category === category)
    if (!activeCategories) return meetups
    const allowed = new Set(activeCategories)
    return meetups.filter((meetup) => allowed.has(meetup.category))
  }, [category, activeCategories, meetups])

  async function toggleMembership(meetup: MeetupRecord) {
    if (meetup.is_host || !meetup.joined || membershipRequestInFlight.current) return
    membershipRequestInFlight.current = true
    setBusyId(meetup.id)
    setNotice('')

    try {
      const response = await fetch(`/api/meetups/${meetup.id}/join`, {
        method: 'DELETE',
      }).catch(() => null)

      if (!response) {
        setNotice('요청 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.')
        return
      }

      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setNotice(getMembershipError(payload.error))
        return
      }

      // Read the authoritative count/status after an idempotent mutation. A reused
      // response or a full-meetup cancellation must not invent a local headcount.
      setMeetups([])
      setLoadState('loading')
      setReloadToken((value) => value + 1)
      setNotice('참여 취소 처리되었습니다.')
    } finally {
      membershipRequestInFlight.current = false
      setBusyId(null)
    }
  }

  function chooseSocialLane(nextLane: SocialMeetupDiscoveryId) {
    setSocialLane(nextLane)
    setDiscoveryScope('all')
    setCategory('all')
    setStudyTopic('all')
    rememberFilters('all', 'all', 'all')
  }

  function chooseSocialLaneAt(index: number) {
    const nextLane = socialMeetupDiscoveryOptions[index]
    if (nextLane) chooseSocialLane(nextLane.id)
  }

  function moveSocialLane(direction: -1 | 1) {
    const activeIndex = Math.max(0, socialMeetupDiscoveryOptions.findIndex((option) => option.id === socialLane))
    chooseSocialLaneAt(getNextSocialRailIndex(activeIndex, direction, socialMeetupDiscoveryOptions.length))
  }

  function handleSocialRailPointerDown(event: PointerEvent<HTMLDivElement>) {
    suppressSocialRailClickRef.current = false
    socialRailPointerStart.current = { x: event.clientX, y: event.clientY }
  }

  function handleSocialRailPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = socialRailPointerStart.current
    clearSocialRailPointerStart()
    if (!start) return
    const direction = getSocialRailSwipeDirection(event.clientX - start.x, event.clientY - start.y)
    if (!direction) return
    suppressSocialRailClickRef.current = true
    moveSocialLane(direction)
    window.requestAnimationFrame(() => { suppressSocialRailClickRef.current = false })
  }

  function clearSocialRailPointerStart() {
    socialRailPointerStart.current = null
  }

  function resetSocialRailGesture() {
    clearSocialRailPointerStart()
    suppressSocialRailClickRef.current = false
  }

  function handleSocialRailKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const activeIndex = Math.max(0, socialMeetupDiscoveryOptions.findIndex((option) => option.id === socialLane))
    const nextIndex = event.key === 'ArrowLeft'
      ? getNextSocialRailIndex(activeIndex, -1, socialMeetupDiscoveryOptions.length)
      : event.key === 'ArrowRight'
        ? getNextSocialRailIndex(activeIndex, 1, socialMeetupDiscoveryOptions.length)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? socialMeetupDiscoveryOptions.length - 1
            : null
    if (nextIndex === null) return
    event.preventDefault()
    chooseSocialLaneAt(nextIndex)
  }

  const browseBackHref = buildMeetupExploreHref({
    intent: discoveryScope === 'study' ? 'achieve' : 'play',
    group: discoveryScope === 'study' ? (studyTopic === 'all' ? null : studyTopic) : (discoveryScope === 'all' ? null : discoveryScope),
    genderMode: genderFilter === 'any' ? 'all' : genderFilter,
  })
  const createParams = new URLSearchParams()
  if (category !== 'all') createParams.set('category', category)
  if (compact) createParams.set('scope', memberScope)
  if (genderFilter !== 'any') createParams.set('gender_mode', genderFilter)
  const createHref = '/meetups/create' + (createParams.size ? '?' + createParams : '')
  const returnParams = new URLSearchParams()
  if (compact) returnParams.set('scope_type', memberScope)
  if (discoveryScope !== 'all') returnParams.set('scope', discoveryScope)
  if (category !== 'all') returnParams.set('category', category)
  if (studyTopic !== 'all') returnParams.set('topic', studyTopic)
  if (genderFilter !== 'any') returnParams.set('gender_mode', genderFilter)
  const returnTo = `${compact ? '/meetups/browse' : '/meetups'}${returnParams.size ? `?${returnParams}` : ''}`

  return (
    <main className="min-h-screen bg-boot-canvas pb-28 text-boot-ink">
      <div className={`mx-auto w-full px-4 pt-5 sm:px-6 sm:pt-7 ${compact ? 'max-w-3xl' : 'max-w-6xl'}`}>
        <Link href={compact ? browseBackHref : '/meetups'} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-boot-muted"><ArrowLeft size={17} />{compact ? '활동 고르기' : '모임 첫 화면'}</Link>
        <header className="flex items-end justify-between gap-4 border-b border-boot-hairline pb-4">
          <div>
            <p className="text-xs font-black text-boot-primary">Quantum 모임</p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">{compact ? `${category === 'all' ? '함께할' : getMeetupCategoryLabel(category)} 모임` : '지금 같이할 사람을 찾아요'}</h1>
            <p className="mt-2 max-w-xl text-sm font-bold leading-6 text-boot-muted">
              {compact ? '열려 있는 모집에서 시간과 장소를 확인하고 참여해요.' : '운동, 게임, 스터디처럼 하고 싶은 일을 고르고 바로 참여하거나 직접 열 수 있어요.'}
            </p>
          </div>
          <div className="hidden shrink-0 gap-2 sm:flex">
            {!compact ? <Link href="/meetups/league" className="flex min-h-11 items-center rounded-[8px] border border-boot-primary/25 bg-white px-4 py-3 text-sm font-black text-boot-primary">학과 대항</Link> : null}
            {/* Full document navigation preserves auth redirect query parameters through middleware. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={createHref} className="flex min-h-11 items-center gap-2 rounded-[8px] bg-boot-primary px-4 py-3 text-sm font-black text-white"><Plus size={18} />모임 만들기</a>
          </div>
        </header>

        {!compact ? <DepartmentChallengeEntry /> : null}

        <section className="py-4" aria-label="모임 찾아보기">
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="모임 카테고리 필터">
            <button
              type="button"
              aria-pressed={discoveryScope === 'all'}
              onClick={() => {
                setSocialLane('mixed-social')
                setDiscoveryScope('all')
                setCategory('all')
                setStudyTopic('all')
                rememberFilters('all', 'all', 'all')
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
                aria-pressed={discoveryScope === group.id}
                onClick={() => {
                  setSocialLane('mixed-social')
                  setDiscoveryScope(group.id)
                  setCategory('all')
                  setStudyTopic('all')
                  rememberFilters(group.id, 'all', 'all')
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

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="참여 성별 조건 필터">
            <button
              type="button"
              aria-pressed={genderFilter === 'any'}
              onClick={() => {
                setGenderFilter('any')
                rememberFilters(discoveryScope, category, studyTopic, 'any')
              }}
              className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${genderFilter === 'any' ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline bg-white text-boot-muted'}`}
            >
              전체
            </button>
            {MEETUP_GENDER_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={genderFilter === mode}
                onClick={() => {
                  setGenderFilter(mode)
                  rememberFilters(discoveryScope, category, studyTopic, mode)
                }}
                className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black transition ${genderFilter === mode ? 'border-boot-primary bg-boot-primary text-white' : 'border-boot-hairline bg-white text-boot-muted'}`}
              >
                {MEETUP_GENDER_LABELS[mode]}
              </button>
            ))}
          </div>

          {discoveryScope !== 'all' ? (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => { setCategory('all'); rememberFilters(discoveryScope, 'all', studyTopic) }}
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
                    onClick={() => { setCategory(categoryId); rememberFilters(discoveryScope, categoryId, studyTopic) }}
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
                onClick={() => { setStudyTopic('all'); rememberFilters(discoveryScope, category, 'all') }}
                className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black ${studyTopic === 'all' ? 'border-boot-info bg-boot-info-soft text-boot-info' : 'border-boot-hairline bg-white text-boot-muted'}`}
              >
                스터디 전체
              </button>
              {studyTopicGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-pressed={studyTopic === group.id}
                  onClick={() => { setStudyTopic(group.id); rememberFilters(discoveryScope, category, group.id) }}
                  className={`min-h-11 shrink-0 rounded-[8px] border px-3 text-xs font-black ${studyTopic === group.id ? 'border-boot-info bg-boot-info-soft text-boot-info' : 'border-boot-hairline bg-white text-boot-muted'}`}
                >
                  {group.title}
                </button>
              ))}
            </div>
          ) : null}

        </section>

        <section className="scroll-mt-20 border-t border-boot-hairline py-5" aria-labelledby="open-meetups-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="open-meetups-heading" className="text-lg font-black">참여할 모임</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">현재 만들어져 참여할 수 있는 모임이에요.</p>
            </div>
            {/* Full document navigation preserves auth redirect query parameters through middleware. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href={createHref} className="flex min-h-11 items-center gap-1 text-xs font-black text-boot-primary sm:hidden">
              <Plus size={16} /> 모임 만들기
            </a>
          </div>

          {notice ? <p className="mt-3 rounded-[8px] bg-white px-3 py-2 text-xs font-bold text-boot-primary" role="status">{notice}</p> : null}
          <MeetupListState state={loadState} compact={compact} loginHref={`/login?redirect=${encodeURIComponent(returnTo)}`} onRetry={() => setReloadToken((value) => value + 1)} />
          {loadState === 'ready' && visibleMeetups.length === 0 ? <StatusBox text="아직 모집 중인 모임이 없어요. 다른 활동을 고르거나 첫 모임을 열어보세요." /> : null}

          {loadState === 'ready' && visibleMeetups.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {visibleMeetups.map((meetup) => {
                const genderEligibility = getMeetupGenderEligibility(meetup)
                const genderLabel = getMeetupGenderLabel(meetup)
                const genderNotice = getMeetupGenderNotice(genderEligibility)
                return (
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
                  <div className="mt-3 flex flex-wrap gap-2">
                    <p className="inline-flex rounded-[6px] bg-[#F4FAFD] px-2 py-1 text-[11px] font-black text-boot-info">{genderLabel}</p>
                    <p className="inline-flex rounded-[6px] bg-boot-soft px-2 py-1 text-[11px] font-black text-boot-primary">{meetup.scope_type === 'department' ? `${meetup.department_label ?? '내 학과'} 전용` : '학교 전체'}</p>
                  </div>
                  {!meetup.joined && genderNotice ? <p className="mt-2 text-xs font-bold leading-5 text-boot-coral">{genderNotice}</p> : null}
                  <dl className="mt-3 grid gap-2 text-xs font-bold text-boot-muted">
                    <div className="flex items-center gap-2"><CalendarDays size={15} /><span>{formatDate(meetup.scheduled_at)}</span></div>
                    <div className="flex items-center gap-2"><MapPin size={15} /><span className="break-words">{meetup.place_name??'채팅에서 함께 정하기'}</span></div>
                    <div className="flex items-center gap-2"><UsersRound size={15} /><span>{meetup.member_count}/{meetup.capacity}명</span></div>
                  </dl>
                  {meetup.place_name ? <PlaceLinks
                    place={projectLegacyMeetupPlace({
                      meetupId: meetup.id,
                      placeName: meetup.place_name,
                      category: meetup.category,
                    })}
                    className="mt-3"
                  /> : null}
                  {!meetup.is_host && !meetup.joined && meetup.status !== 'full' && genderEligibility === 'eligible' ? <Link href={`/meetups/${encodeURIComponent(meetup.id)}/apply`} className="mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-boot-primary px-4 text-sm font-black text-white">보증금 확인·신청</Link> : <button
                    type="button"
                    disabled={busyId !== null || meetup.is_host || (!meetup.joined && (meetup.status === 'full' || genderEligibility !== 'eligible'))}
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
                          : genderEligibility !== 'eligible'
                            ? '성별 조건 확인 필요'
                          : meetup.status === 'full'
                            ? '참여 마감'
                            : '참여하기'}
                  </button>}
                  <Link href={`/meetups/${meetup.id}`} className="mt-2 flex min-h-11 w-full items-center justify-center rounded-[8px] border border-boot-primary/25 bg-white px-4 text-sm font-black text-boot-primary">상세·채팅·진행 안내</Link>
                </article>
                )
              })}
            </div>
          ) : null}
          {pageError ? <p role="status" className="mt-3 text-sm text-boot-muted">다음 모임을 불러오지 못했어요. 더 보기로 다시 확인해 주세요.</p> : null}
          {loadState === 'ready' && nextCursor ? <button type="button" disabled={loadingMore} onClick={() => setPageRequest({scope:listScope,cursor:nextCursor})} className="mt-4 min-h-11 w-full rounded-[8px] border border-boot-hairline bg-white px-4 text-sm font-black disabled:opacity-50">{loadingMore ? '모임을 불러오는 중…' : '모임 더 보기'}</button> : null}
        </section>

        {!compact ? <section className="py-5" aria-labelledby="meetup-ideas-heading">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 id="meetup-ideas-heading" className="text-lg font-black">새로운 모임 아이디어</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">관심 있는 활동으로 바로 사람을 모아보세요.</p>
            </div>
          </div>

          <div className="mt-4" aria-label="친목 추천 방식">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black text-[#9f4a3e]">친목 추천 · 둘러보기</p>
              <p className="text-xs font-black text-[#74625b]" aria-live="polite" aria-atomic="true">
                {Math.max(0, socialMeetupDiscoveryOptions.findIndex((option) => option.id === socialLane)) + 1} / {socialMeetupDiscoveryOptions.length}
              </p>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2" role="group" aria-label="친목 추천 이동">
              <button
                type="button"
                aria-label="이전 친목 추천"
                aria-controls="social-recommendation-rail"
                onClick={() => moveSocialLane(-1)}
                className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full border border-[#EAD8CF] bg-white text-[#9F4A3E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C95A49]"
              >
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <div className="grid min-w-0 flex-1 grid-cols-3 gap-1" role="group" aria-label="친목 추천 직접 선택">
                {socialMeetupDiscoveryOptions.map((option) => {
                  const selected = socialLane === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      aria-controls={`social-recommendation-${option.id}`}
                      onClick={() => chooseSocialLane(option.id)}
                      className={`min-h-11 min-w-0 whitespace-normal break-keep rounded-full border px-1 py-1 text-[10px] font-black leading-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C95A49] sm:px-3 sm:text-[11px] ${
                        selected ? 'border-[#C95A49] bg-[#C95A49] text-white' : 'border-[#EAD8CF] bg-white text-[#74625B]'
                      }`}
                    >
                      {option.label}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                aria-label="다음 친목 추천"
                aria-controls="social-recommendation-rail"
                onClick={() => moveSocialLane(1)}
                className="flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-full border border-[#EAD8CF] bg-white text-[#9F4A3E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C95A49]"
              >
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div
              id="social-recommendation-rail"
              ref={socialRailRef}
              data-layout="social-photo-card-rail"
              data-swipe-surface="social-recommendations"
              tabIndex={0}
              onPointerDown={handleSocialRailPointerDown}
              onPointerUp={handleSocialRailPointerUp}
              onPointerCancel={resetSocialRailGesture}
              onLostPointerCapture={clearSocialRailPointerStart}
              onKeyDown={handleSocialRailKeyDown}
              className="-mr-4 mt-2 flex snap-x snap-mandatory touch-pan-y gap-3 overflow-x-auto pb-2 pr-4 outline-none [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C95A49] [&::-webkit-scrollbar]:hidden sm:mr-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pr-0 sm:snap-none"
              role="group"
              aria-label="친목 추천 분류"
            >
              {socialMeetupDiscoveryOptions.map((option) => {
                const selected = socialLane === option.id
                return (
                  <button
                    key={option.id}
                    id={`social-recommendation-${option.id}`}
                    data-social-lane={option.id}
                    data-layout="social-photo-card"
                    type="button"
                    aria-pressed={selected}
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => {
                      if (suppressSocialRailClickRef.current) {
                        suppressSocialRailClickRef.current = false
                        return
                      }
                      chooseSocialLane(option.id)
                    }}
                    className={`group w-[84%] shrink-0 snap-start overflow-hidden rounded-[24px] border-2 bg-white text-left transition sm:w-auto ${
                      selected
                        ? 'border-[#C95A49] shadow-[0_10px_24px_rgba(201,90,73,0.18)]'
                        : 'border-[#EAD8CF] text-[#74625B]'
                    }`}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-[#F4E7DF]">
                      <Image
                        src={option.imageSrc}
                        alt={option.imageAlt}
                        fill
                        priority={option.id === socialMeetupDiscoveryOptions[0].id}
                        sizes="(min-width: 640px) 33vw, 84vw"
                        draggable={false}
                        className="object-cover transition duration-300 group-hover:scale-[1.02]"
                      />
                    </div>
                    <div className="flex min-h-[132px] flex-col bg-white p-4">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-base font-black text-[#2F211C]">{option.label}</span>
                        {selected ? <span className="shrink-0 rounded-full bg-[#C95A49] px-2 py-1 text-[10px] font-black text-white">선택됨</span> : null}
                      </span>
                      <span className="mt-2 block text-xs font-bold leading-5 text-[#6F554A]">{option.description}</span>
                      <span className="mt-auto block pt-3 text-[11px] font-black leading-4 text-[#A4513F]">{option.examples}</span>
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-xs font-bold leading-5 text-[#74625b]">
              성별 제한이 아니라 처음 둘러보기 쉬운 추천이에요. 실제 모집의 참여 성별 조건은 위 목록에서 따로 확인해 주세요.
            </p>
          </div>

          <details className="mt-3 rounded-2xl border border-boot-hairline bg-white p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-bold text-boot-body focus-visible:outline-2 focus-visible:outline-boot-primary">
              <Sparkles size={15} />
              운영 예정표 <span className="ml-auto text-xs font-medium text-boot-muted">아직 모집 아님 · 펼치기</span>
            </summary>
            <p className="mt-2 text-xs font-medium leading-5 text-boot-muted">활동 아이디어를 모은 예정표예요. 확정된 모임과 참가 신청은 위의 ‘참여할 모임’에서 확인해 주세요.</p>
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
          </details>

          {recommendedIdeas.length > 0 ? (
            <MeetupIdeaCylinder ideas={recommendedIdeas} genderMode={genderFilter === 'any' ? 'all' : genderFilter} />
          ) : (
            /* Full document navigation preserves the selected category through the auth redirect. */
            /* eslint-disable-next-line @next/next/no-html-link-for-pages */
            <a
              href={createHref}
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
        </section> : null}
      </div>
    </main>
  )
}

function MeetupListState({ state, onRetry, compact = false, loginHref }: { state: LoadState; onRetry: () => void; compact?: boolean; loginHref: string }) {
  if (state === 'loading') {
    return <p className="mt-4 flex min-h-20 items-center gap-2 text-sm font-bold text-boot-muted"><Clock3 size={17} /> 모임 목록을 불러오는 중이에요.</p>
  }
  if (state === 'unauthorized') {
    return (
      <div className="mt-4 flex min-h-24 items-center justify-between gap-4 rounded-[8px] border border-boot-hairline bg-white p-4">
        <p className="text-sm font-bold leading-6 text-boot-muted">모임에 참여하려면 다시 로그인해 주세요.</p>
        <Link href={loginHref} className="shrink-0 text-sm font-black text-boot-primary">로그인</Link>
      </div>
    )
  }
  if (state === 'unavailable') {
    return <StatusBox text={compact ? '지금은 모임 목록에 연결하지 못했어요. 다시 확인하거나 활동 고르기로 돌아가 주세요.' : '지금은 모임 목록을 연결하지 못했어요. 다시 확인하거나 아래에서 활동 아이디어를 둘러보세요.'} onRetry={onRetry} />
  }
  if (state === 'error') {
    return <StatusBox text="모임 목록을 가져오지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요." onRetry={onRetry} />
  }
  return null
}

function StatusBox({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <div className="mt-4 rounded-2xl border border-boot-hairline bg-white p-4" role="status">
      <div className="flex items-start gap-3">
        <CircleAlert size={18} className="mt-1 shrink-0 text-boot-coral" />
        <p className="text-sm font-medium leading-6 text-boot-body">{text}</p>
      </div>
      {onRetry && <button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-xl border border-boot-primary px-4 text-sm font-bold text-boot-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-boot-primary">모임 목록 다시 확인</button>}
    </div>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '채팅에서 함께 정하기'
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

type MeetupGenderDisplayEligibility = MeetupGenderEligibility | 'unavailable'

function getMeetupGenderLabel(meetup: MeetupRecord): string {
  return isMeetupGenderMode(meetup.gender_mode)
    ? MEETUP_GENDER_LABELS[meetup.gender_mode]
    : '성별 조건 확인 필요'
}

function getMeetupGenderEligibility(meetup: MeetupRecord): MeetupGenderDisplayEligibility {
  if (!isMeetupGenderMode(meetup.gender_mode) || !isMeetupGenderEligibility(meetup.gender_eligibility)) return 'unavailable'
  return meetup.gender_eligibility
}

function isMeetupGenderEligibility(value: unknown): value is MeetupGenderEligibility {
  return value === 'eligible' || value === 'gender_required' || value === 'gender_restricted'
}

function getMeetupGenderNotice(eligibility: MeetupGenderDisplayEligibility): string | null {
  if (eligibility === 'eligible') return null
  if (eligibility === 'gender_required') return '등록 프로필 성별을 확인한 뒤 새로 참여할 수 있어요.'
  if (eligibility === 'gender_restricted') return '등록 프로필 성별이 이 모임 조건과 맞지 않아 새로 참여할 수 없어요.'
  return '성별 조건을 확인할 수 없어 참여할 수 없어요.'
}

function getMembershipError(error?: string): string {
  if (error === 'meetup_full') return '현재 팀이 마감되어 참여할 수 없습니다.'
  if (error === 'meetup_closed') return '모임이 종료되어 참여할 수 없습니다.'
  if (error === 'profile_required') return '내 프로필 정보가 필요합니다. 설정 후 다시 시도해 주세요.'
  if (error === 'meetup_gender_required') return '등록 프로필 성별을 확인한 뒤 다시 참여해 주세요.'
  if (error === 'meetup_gender_restricted') return '등록 프로필 성별이 이 모임 조건과 맞지 않아 참여할 수 없어요.'
  return '참여 동작에 실패했습니다. 다시 시도해 주세요.'
}
