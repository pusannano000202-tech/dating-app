'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Dumbbell,
  Gamepad2,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  Sparkles,
  Utensils,
  UsersRound,
} from 'lucide-react'

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

const groupPresentation: Record<MeetupDiscoveryGroupId, {
  description: string
  icon: typeof Dumbbell
}> = {
  exercise: { description: '러닝, 구기 종목, 등산', icon: Dumbbell },
  games: { description: '보드게임, PC·콘솔 게임', icon: Gamepad2 },
  study: { description: '전공, 어학, 자격·프로젝트', icon: BookOpen },
  lifestyle: { description: '산책, 맛집, 자유 활동', icon: Utensils },
}

export default function CreateMeetupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedCategory = searchParams.get('category')
  const requestedIdea = searchParams.get('idea')
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
  const [title, setTitle] = useState(initialIdea?.title ?? '')
  const [description, setDescription] = useState(initialIdea?.description ?? '')
  const [placeName, setPlaceName] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [capacity, setCapacity] = useState(() => getMeetupCapacityRecommendation(initialCategory))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const minimumSchedule = useMemo(() => {
    const date = new Date(Date.now() + 60 * 60 * 1000)
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0)
    return toLocalDateTime(date)
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
    setSubmitting(true)
    setError('')

    const response = await fetch('/api/meetups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category,
        title,
        description,
        place_name: placeName,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : '',
        capacity,
      }),
    }).catch(() => null)

    if (!response) {
      setError('네트워크를 확인한 뒤 다시 시도해 주세요.')
      setSubmitting(false)
      return
    }

    const payload = await response.json().catch(() => ({})) as { error?: string }
    if (!response.ok) {
      if (response.status === 401) {
        router.push('/login?redirect=%2Fmeetups%2Fcreate')
        return
      }
      setError(getCreateError(payload.error))
      setSubmitting(false)
      return
    }

    router.push('/meetups?created=1')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-boot-canvas px-4 pb-28 pt-5 text-boot-ink">
      <div className="mx-auto w-full max-w-2xl">
        <header className="flex items-start gap-3 border-b border-boot-hairline pb-4">
          <Link
            href="/meetups"
            aria-label="모임 목록으로 돌아가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] border border-boot-hairline bg-white text-boot-muted"
          >
            <ArrowLeft size={19} />
          </Link>
          <div>
            <p className="text-xs font-black text-boot-primary">Quantum 모임</p>
            <h1 className="mt-1 text-2xl font-black">새 활동 모임 만들기</h1>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">성별 조건 없이, 같이 할 활동과 약속만 정해요.</p>
          </div>
        </header>

        <form onSubmit={submit} className="mt-5 space-y-6">
          {activePreset ? (
            <section className="border-l-4 border-boot-primary bg-boot-soft px-4 py-3" aria-label="추천에서 선택한 활동">
              <div className="flex items-start gap-3">
                <Sparkles size={18} className="mt-0.5 shrink-0 text-boot-primary" />
                <div>
                  <p className="text-[11px] font-black text-boot-primary">추천에서 이어서 만들기</p>
                  <p className="mt-1 text-base font-black">{activePreset.title}</p>
                  <p className="mt-1 text-xs font-bold text-boot-muted">
                    {getMeetupCategoryLabel(activePreset.category)} 활동이 미리 선택됐어요. 시간과 장소만 정하면 돼요.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <fieldset>
            <legend className="text-base font-black">어떤 종류의 모임인가요?</legend>
            <p className="mt-1 text-xs font-bold text-boot-muted">먼저 큰 분류를 고르면 필요한 활동만 보여드려요.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {meetupDiscoveryGroups.map((group) => {
                const presentation = groupPresentation[group.id]
                const Icon = presentation.icon
                const selected = discoveryGroup === group.id
                return (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => chooseDiscoveryGroup(group.id)}
                    className={`flex min-h-[76px] items-center gap-3 rounded-[8px] border px-3 py-3 text-left ${
                      selected
                        ? 'border-boot-primary bg-boot-soft text-boot-primary'
                        : 'border-boot-hairline bg-white text-boot-ink'
                    }`}
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-boot-primary text-white' : 'bg-[#EEF2F1] text-boot-muted'}`}>
                      <Icon size={19} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-black">{group.title}</span>
                      <span className="mt-1 block text-[11px] font-bold leading-4 text-boot-muted">{presentation.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-black">세부 활동</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {visibleCategories.map((categoryId) => (
                <button
                  key={categoryId}
                  type="button"
                  aria-pressed={category === categoryId}
                  onClick={() => chooseCategory(categoryId)}
                  className={`min-h-12 rounded-[8px] border px-3 text-sm font-black ${
                    category === categoryId
                      ? 'border-boot-primary bg-boot-primary text-white'
                      : 'border-boot-hairline bg-white text-boot-muted'
                  }`}
                >
                  {getMeetupCategoryLabel(categoryId)}
                </button>
              ))}
            </div>
          </fieldset>

          {category === 'study' ? (
            <fieldset>
              <legend className="text-sm font-black">스터디 주제</legend>
              <p className="mt-1 text-xs font-bold text-boot-muted">여러 과목을 함께 준비한다면 복수로 선택할 수 있어요.</p>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {studyTopicGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    aria-pressed={studyTopicGroup === group.id}
                    onClick={() => chooseStudyGroup(group.id)}
                    className={`min-h-10 shrink-0 rounded-[8px] border px-3 text-xs font-black ${studyTopicGroup === group.id ? 'border-boot-info bg-boot-info-soft text-boot-info' : 'border-boot-hairline bg-white text-boot-muted'}`}
                  >
                    {group.title}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {visibleStudyTopics.map((topic) => (
                  <button
                    key={topic}
                    type="button"
                    aria-pressed={selectedStudyTopics.includes(topic)}
                    onClick={() => toggleStudyTopic(topic)}
                    className={`min-h-11 rounded-[8px] border px-3 text-xs font-black ${selectedStudyTopics.includes(topic) ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-muted'}`}
                  >
                    {topic}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <label className="block">
            <span className="text-sm font-black">모임 제목</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={4}
              maxLength={60}
              required
              placeholder="예: 오늘 저녁 온천천 같이 달려요"
              className="mt-2 min-h-12 w-full rounded-[8px] border border-boot-hairline bg-white px-4 text-base font-bold outline-none focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/20"
            />
          </label>

          <label className="block">
            <span className="text-sm font-black">간단한 설명</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
              rows={4}
              placeholder="처음 오는 사람도 알 수 있게 속도, 준비물, 분위기를 알려주세요."
              className="mt-2 w-full resize-y rounded-[8px] border border-boot-hairline bg-white px-4 py-3 text-sm font-bold leading-6 outline-none focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/20"
            />
            <span className="mt-1 block text-right text-[11px] font-bold text-boot-muted">{description.length}/500</span>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-black"><MapPin size={16} /> 만날 장소</span>
              <input
                value={placeName}
                onChange={(event) => setPlaceName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
                placeholder="예: 부산대 정문"
                className="mt-2 min-h-12 w-full rounded-[8px] border border-boot-hairline bg-white px-4 text-sm font-bold outline-none focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/20"
              />
            </label>
            <label className="block">
              <span className="flex items-center gap-2 text-sm font-black"><CalendarDays size={16} /> 날짜와 시간</span>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(event) => setScheduledAt(event.target.value)}
                min={minimumSchedule}
                required
                className="mt-2 min-h-12 w-full rounded-[8px] border border-boot-hairline bg-white px-4 text-sm font-bold outline-none focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/20"
              />
            </label>
          </div>

          <fieldset>
            <legend className="flex items-center gap-2 text-sm font-black"><UsersRound size={16} /> 모집 인원</legend>
            <p className="mt-1 text-xs font-bold text-boot-muted">{getMeetupCategoryLabel(category)} 권장 인원은 {getMeetupCapacityRecommendation(category)}명이에요. 필요하면 바꿀 수 있어요.</p>
            <div className="mt-2 flex h-12 w-full items-center justify-between rounded-[8px] border border-boot-hairline bg-white px-2 sm:w-56">
              <button
                type="button"
                aria-label="모집 인원 줄이기"
                disabled={capacity <= 2}
                onClick={() => setCapacity((value) => Math.max(2, value - 1))}
                className="flex h-10 w-10 items-center justify-center text-boot-muted disabled:opacity-30"
              ><Minus size={18} /></button>
              <span className="text-base font-black">{capacity}명</span>
              <button
                type="button"
                aria-label="모집 인원 늘리기"
                disabled={capacity >= 20}
                onClick={() => setCapacity((value) => Math.min(20, value + 1))}
                className="flex h-10 w-10 items-center justify-center text-boot-primary disabled:opacity-30"
              ><Plus size={18} /></button>
            </div>
          </fieldset>

          <div className="flex items-start gap-3 border-y border-boot-hairline py-4">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#147A70]" />
            <p className="text-xs font-bold leading-5 text-boot-muted">
              연락처와 실명은 공개하지 마세요. 신고된 모임은 운영 확인 후 숨김 처리될 수 있어요.
            </p>
          </div>

          {error ? <p className="text-sm font-black text-boot-coral" role="alert">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-12 w-full rounded-[8px] bg-boot-primary px-5 text-base font-black text-white disabled:opacity-55"
          >
            {submitting ? '모임을 만들고 있어요...' : '모임 공개하기'}
          </button>
        </form>
      </div>
    </main>
  )
}

function toLocalDateTime(date: Date): string {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function getCreateError(error?: string): string {
  if (error === 'community_schema_unavailable') return '모임 저장소 연결 전이에요. DB 적용 후 바로 공개할 수 있어요.'
  if (error === 'profile_required') return '기본정보를 먼저 입력해 주세요.'
  if (error === 'schedule_too_soon') return '최소 30분 뒤 시간으로 정해 주세요.'
  if (error === 'invalid_title') return '제목을 4자 이상 입력해 주세요.'
  if (error === 'invalid_place') return '만날 장소를 2자 이상 입력해 주세요.'
  return '입력한 내용을 확인한 뒤 다시 시도해 주세요.'
}
