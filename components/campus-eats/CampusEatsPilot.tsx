'use client'

import Image from 'next/image'
import {
  ArrowLeft,
  ChevronDown,
  Coffee,
  ExternalLink,
  ListFilter,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  SkipForward,
  Trophy,
  UtensilsCrossed,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import NaverCampusMap from '@/components/campus-eats/NaverCampusMap'
import {
  applyBattleAction,
  createBracketSession,
  getNextPair,
  resumeBracketSession,
} from '@/lib/campus-eats/bracket'
import {
  applyPersonalRatingEvent,
  createPersonalRatingState,
  restorePersonalRatingState,
  type PersonalRatingState,
} from '@/lib/campus-eats/personal-rating'
import {
  CAMPUS_EATS_SCHOOLS,
  getCampusEatsCategory,
  getCampusEatsSchool,
  type CampusEatsCandidate,
  type CampusEatsCategory,
  type CampusEatsCategoryId,
  type CampusEatsSchool,
} from '@/lib/campus-eats/fixtures/regional'
import type { BattleAction, BracketSession, CandidateChoice, CandidatePair } from '@/lib/campus-eats/types'

const STORAGE_VERSION = 2
const BATTLE_CANDIDATE_COUNT = 8

type PilotView = 'map' | 'battle' | 'result'

type StoredPilot = {
  version: number
  session: BracketSession
  view: PilotView
  selectedCandidateId: string | null
  eventSequence: number
}

const validSessionStatuses = ['active', 'paused_needs_visits', 'completed', 'completed_without_winner'] as const

type DirectEntryRequest = {
  categoryId: CampusEatsCategoryId | null
  mode: 'battle' | null
}

const directEntryModes = ['battle'] as const

function parseDirectEntry(): DirectEntryRequest {
  if (typeof window === 'undefined') {
    return { categoryId: null, mode: null }
  }

  const params = new URLSearchParams(window.location.search)
  const category = params.get('category')
  const mode = params.get('mode')

  const categoryId = category === 'donkatsu' || category === 'coffee'
    ? category
    : null

  const validMode = directEntryModes.includes((mode ?? '') as 'battle')
    ? mode as 'battle'
    : null

  return { categoryId, mode: validMode }
}

function resolveAutoView(request: DirectEntryRequest, targetCategoryId: CampusEatsCategoryId, session: BracketSession): PilotView {
  if (request.mode !== 'battle' || request.categoryId !== targetCategoryId) {
    return 'map'
  }

  return session.status === 'active' ? 'battle' : 'result'
}

function subjectParticle(value: string) {
  const lastHangul = Array.from(value).reverse().find((character) => {
    const code = character.charCodeAt(0)
    return code >= 0xac00 && code <= 0xd7a3
  })
  if (!lastHangul) return '이'
  return (lastHangul.charCodeAt(0) - 0xac00) % 28 === 0 ? '가' : '이'
}

const candidateChoices: Array<{
  choice: CandidateChoice
  label: (candidateA: string, candidateB: string) => string
  className: string
}> = [
  {
    choice: 'both_visited_prefer_a',
    label: (candidateA) => `둘 다 가봤어요 · ${candidateA}${subjectParticle(candidateA)} 더 좋음`,
    className: 'border-[#ff7668] bg-[#fff1ed] text-[#a4372c] hover:bg-[#ffe4de]',
  },
  {
    choice: 'both_visited_prefer_b',
    label: (_, candidateB) => `둘 다 가봤어요 · ${candidateB}${subjectParticle(candidateB)} 더 좋음`,
    className: 'border-[#0f9089] bg-[#e9fbf8] text-[#126b67] hover:bg-[#d6f4ef]',
  },
  {
    choice: 'only_visited_a',
    label: (candidateA) => `한 곳만 가봤어요 · ${candidateA}만 방문`,
    className: 'border-[#bed35b] bg-[#f5fad8] text-[#526515] hover:bg-[#edf6bc]',
  },
  {
    choice: 'only_visited_b',
    label: (_, candidateB) => `한 곳만 가봤어요 · ${candidateB}만 방문`,
    className: 'border-[#f2b45d] bg-[#fff7df] text-[#8a5410] hover:bg-[#ffefbb]',
  },
]

function storageKey(schoolId: string, categoryId: CampusEatsCategoryId) {
  return `quantum-campus-eats-${schoolId}-${categoryId}-v2`
}

function personalRatingStorageKey(schoolId: string, categoryId: CampusEatsCategoryId) {
  return `quantum-campus-eats-personal-rating-${schoolId}-${categoryId}-v1`
}

function battleCandidates(category: CampusEatsCategory) {
  return category.candidates.slice(0, BATTLE_CANDIDATE_COUNT)
}

function createInitialSession(category: CampusEatsCategory) {
  return createBracketSession({ candidateIds: battleCandidates(category).map((candidate) => candidate.id) })
}

function findCandidate(category: CampusEatsCategory, id: string | undefined) {
  return category.candidates.find((candidate) => candidate.id === id)
}

function isStoredPilot(value: unknown, category: CampusEatsCategory): value is StoredPilot {
  if (!value || typeof value !== 'object') return false
  const stored = value as Partial<StoredPilot>
  const candidateIds = battleCandidates(category).map((candidate) => candidate.id)
  return stored.version === STORAGE_VERSION
    && typeof stored.eventSequence === 'number'
    && (stored.view === 'map' || stored.view === 'battle' || stored.view === 'result')
    && !!stored.session
    && Array.isArray(stored.session.candidateIds)
    && validSessionStatuses.includes(stored.session.status)
    && stored.session.candidateIds.join(',') === candidateIds.join(',')
}

function normalizeStoredPilot(stored: StoredPilot, category: CampusEatsCategory): StoredPilot {
  let view = stored.view
  const selectedCandidateId = typeof stored.selectedCandidateId === 'string' && findCandidate(category, stored.selectedCandidateId)
    ? stored.selectedCandidateId
    : category.candidates[0]?.id ?? null

  if (stored.session.status !== 'active' && view === 'battle') view = 'result'
  if (stored.session.status === 'active' && view === 'result') view = 'map'

  return { ...stored, view, selectedCandidateId }
}

export default function CampusEatsPilot() {
  const initialSchool = getCampusEatsSchool('pnu')
  const initialCategory = getCampusEatsCategory(initialSchool, 'donkatsu')
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchool.id)
  const [selectedCategoryId, setSelectedCategoryId] = useState<CampusEatsCategoryId>(initialCategory.id)
  const pendingDirectEntryRef = useRef<DirectEntryRequest>({ categoryId: null, mode: null })
  const selectedSchool = getCampusEatsSchool(selectedSchoolId)
  const selectedCategory = getCampusEatsCategory(selectedSchool, selectedCategoryId)
  const [session, setSession] = useState<BracketSession>(() => createInitialSession(initialCategory))
  const [personalRating, setPersonalRating] = useState<PersonalRatingState>(() => (
    createPersonalRatingState(initialCategory.candidates.map((candidate) => candidate.id))
  ))
  const [view, setView] = useState<PilotView>('map')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(initialCategory.candidates[0]?.id ?? null)
  const [rankingOpen, setRankingOpen] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const eventSequenceRef = useRef(0)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const [visiblePair, setVisiblePair] = useState<CandidatePair | undefined>(() => getNextPair(createInitialSession(initialCategory)))

  useEffect(() => {
    const request = parseDirectEntry()
    pendingDirectEntryRef.current = request
    if (request.categoryId) setSelectedCategoryId(request.categoryId)
  }, [])

  const currentPair = useMemo(() => getNextPair(session), [session])
  const displayedPair = visiblePair ?? currentPair
  const candidateA = findCandidate(selectedCategory, displayedPair?.candidateAId)
  const candidateB = findCandidate(selectedCategory, displayedPair?.candidateBId)

  useEffect(() => {
    try {
      const initialSession = createInitialSession(selectedCategory)
      const initialPersonalRating = createPersonalRatingState(selectedCategory.candidates.map((candidate) => candidate.id))
      const requestedView = resolveAutoView(pendingDirectEntryRef.current, selectedCategory.id, initialSession)
      setSession(initialSession)
      setPersonalRating(initialPersonalRating)
      setVisiblePair(getNextPair(initialSession))
      setView(requestedView)
      setSelectedCandidateId(selectedCategory.candidates[0]?.id ?? null)
      setFeedback(null)
      setIsResolving(false)
      eventSequenceRef.current = 0
      const ratingKey = personalRatingStorageKey(selectedSchool.id, selectedCategory.id)
      const rawPersonalRating = window.localStorage.getItem(ratingKey)
      if (rawPersonalRating) {
        try {
          setPersonalRating(restorePersonalRatingState(
            JSON.parse(rawPersonalRating) as unknown,
            selectedCategory.candidates.map((candidate) => candidate.id),
          ))
        } catch {
          window.localStorage.removeItem(ratingKey)
        }
      }
      const raw = window.localStorage.getItem(storageKey(selectedSchool.id, selectedCategory.id))
      if (!raw) return
      const stored = JSON.parse(raw) as unknown
      if (!isStoredPilot(stored, selectedCategory)) return
      const restored = normalizeStoredPilot(stored, selectedCategory)
      setSession(restored.session)
      setVisiblePair(getNextPair(restored.session))
      setView(resolveAutoView(pendingDirectEntryRef.current, selectedCategory.id, restored.session))
      setSelectedCandidateId(restored.selectedCandidateId)
      eventSequenceRef.current = restored.eventSequence
    } catch {
      window.localStorage.removeItem(storageKey(selectedSchool.id, selectedCategory.id))
    } finally {
      setHydrated(true)
    }
  }, [selectedCategory, selectedSchool.id])

  useEffect(() => {
    if (!hydrated) return
    const stored: StoredPilot = {
      version: STORAGE_VERSION,
      session,
      view,
      selectedCandidateId,
      eventSequence: eventSequenceRef.current,
    }
    window.localStorage.setItem(storageKey(selectedSchool.id, selectedCategory.id), JSON.stringify(stored))
  }, [hydrated, selectedCandidateId, selectedCategory.id, selectedSchool.id, session, view])

  useEffect(() => {
    if (!hydrated) return
    window.localStorage.setItem(
      personalRatingStorageKey(selectedSchool.id, selectedCategory.id),
      JSON.stringify(personalRating),
    )
  }, [hydrated, personalRating, selectedCategory.id, selectedSchool.id])

  useEffect(() => () => {
    if (feedbackTimeoutRef.current !== null) window.clearTimeout(feedbackTimeoutRef.current)
  }, [])

  function clearFeedbackTimer() {
    if (feedbackTimeoutRef.current !== null) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }

  function selectSchool(nextSchoolId: string) {
    if (nextSchoolId === selectedSchool.id) return
    clearFeedbackTimer()
    const nextSchool = getCampusEatsSchool(nextSchoolId)
    setHydrated(false)
    setSelectedSchoolId(nextSchool.id)
    setSelectedCategoryId(nextSchool.categories[0].id)
  }

  function selectCategory(categoryId: CampusEatsCategoryId) {
    if (categoryId === selectedCategory.id) return
    clearFeedbackTimer()
    setHydrated(false)
    setSelectedCategoryId(categoryId)
  }

  function startBattle() {
    setView(session.status === 'active' ? 'battle' : 'result')
  }

  function finishFeedback(nextSession: BracketSession) {
    clearFeedbackTimer()
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const nextPair = getNextPair(nextSession)
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setVisiblePair(nextPair)
      setFeedback(null)
      setIsResolving(false)
      feedbackTimeoutRef.current = null
      if (nextSession.status !== 'active') setView('result')
    }, reduceMotion ? 120 : 620)
  }

  function submitAction(action: BattleAction) {
    if (isResolving) return
    const transition = applyBattleAction(session, action)
    if (!transition.accepted) return

    eventSequenceRef.current += 1
    setSession(transition.state)
    setIsResolving(true)
    if (transition.outcome.ratingEligible && transition.outcome.winnerId && transition.outcome.loserId) {
      const ratingTransition = applyPersonalRatingEvent(personalRating, {
        eventId: action.eventId,
        winnerId: transition.outcome.winnerId,
        loserId: transition.outcome.loserId,
      })
      const winner = findCandidate(selectedCategory, transition.outcome.winnerId)
      setPersonalRating(ratingTransition.state)
      setFeedback(
        ratingTransition.applied
          ? `내 기기 점수 · ${winner?.name ?? '선택한 후보'} +${ratingTransition.winnerDelta} · 이 기기에만 저장`
          : '이미 반영한 비교예요. 다음 대결로 넘어갑니다.',
      )
    } else {
      setFeedback('방문 상태만 기록했어요. 승자와 내 기기 점수 변화는 없어요.')
    }
    finishFeedback(transition.state)
  }

  function choose(choice: CandidateChoice) {
    if (!currentPair) return
    submitAction({
      type: 'candidate_choice',
      eventId: `${selectedSchool.id}-${selectedCategory.id}-local-${eventSequenceRef.current + 1}`,
      pair: currentPair,
      choice,
    })
  }

  function skipCurrentPair() {
    if (!currentPair) return
    submitAction({
      type: 'neutral_skip',
      eventId: `${selectedSchool.id}-${selectedCategory.id}-local-${eventSequenceRef.current + 1}`,
      pair: currentPair,
    })
  }

  function resumeOnce() {
    if (session.status !== 'paused_needs_visits' || session.generation !== 0) return
    const resumedSession = resumeBracketSession(session)
    setSession(resumedSession)
    setVisiblePair(getNextPair(resumedSession))
    setView('battle')
  }

  function resetPilot() {
    clearFeedbackTimer()
    const nextSession = createInitialSession(selectedCategory)
    eventSequenceRef.current = 0
    setSession(nextSession)
    setVisiblePair(getNextPair(nextSession))
    setFeedback(null)
    setIsResolving(false)
    setSelectedCandidateId(selectedCategory.candidates[0]?.id ?? null)
    setView('map')
    window.localStorage.removeItem(storageKey(selectedSchool.id, selectedCategory.id))
  }

  return (
    <main className="min-h-screen bg-[#f5f8f7] pb-20 text-[#173b3a]">
      <header className="border-b border-[#d8e5e2] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
          <button type="button" onClick={() => setView('map')} className="flex min-h-10 items-center gap-2 text-left" aria-label="캠퍼스 맛집 지도">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#087f78] text-white"><UtensilsCrossed size={18} /></span>
            <span>
              <span className="block text-xs font-black text-[#087f78]">CAMPUS EATS</span>
              <span className="block text-sm font-black">{selectedSchool.name} 맛집 지도</span>
            </span>
          </button>
          <label className="flex items-center gap-2 text-xs font-black">
            <span className="sr-only">학교 선택</span>
            <select value={selectedSchool.id} onChange={(event) => selectSchool(event.target.value)} className="h-10 max-w-36 rounded-md border border-[#cddfdb] bg-white px-3 text-xs font-black text-[#173b3a] sm:max-w-none">
              {CAMPUS_EATS_SCHOOLS.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>
        </div>
      </header>

      {view === 'map' && (
        <MapView
          school={selectedSchool}
          category={selectedCategory}
          selectedCandidateId={selectedCandidateId}
          rankingOpen={rankingOpen}
          hydrated={hydrated}
          session={session}
          personalRating={personalRating}
          onSelectCandidate={setSelectedCandidateId}
          onToggleRanking={() => setRankingOpen((open) => !open)}
          onSelectCategory={selectCategory}
          onStart={startBattle}
        />
      )}
      {view === 'battle' && candidateA && candidateB && (
        <BattleView
          category={selectedCategory}
          candidateA={candidateA}
          candidateB={candidateB}
          isResolving={isResolving}
          feedback={feedback}
          onBack={() => setView('map')}
          onChoose={choose}
          onSkip={skipCurrentPair}
        />
      )}
      {view === 'result' && (
        <ResultView category={selectedCategory} session={session} personalRating={personalRating} onMap={() => setView('map')} onResume={resumeOnce} onRestart={resetPilot} />
      )}
    </main>
  )
}

function CandidateVisual({ candidate, disclosure, priority = false }: { candidate: CampusEatsCandidate; disclosure: string; priority?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#dce9e6]">
      {candidate.imageSrc ? (
        <Image src={candidate.imageSrc} alt={candidate.imageAlt} fill sizes="(max-width: 768px) 50vw, 420px" className="object-cover" priority={priority} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-[#dff4ef] px-4 text-center text-[#087f78]">
          <Coffee size={36} strokeWidth={2.25} />
          <span className="mt-3 text-sm font-black">{candidate.name}</span>
          <span className="mt-1 text-xs font-bold text-[#4d7470]">사진 권리 확인 중</span>
        </div>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-[#173b3a] px-2 py-1.5 text-[10px] font-black leading-4 text-white">{disclosure}</span>
    </div>
  )
}

function BattleView({ category, candidateA, candidateB, isResolving, feedback, onBack, onChoose, onSkip }: {
  category: CampusEatsCategory
  candidateA: CampusEatsCandidate
  candidateB: CampusEatsCandidate
  isResolving: boolean
  feedback: string | null
  onBack: () => void
  onChoose: (choice: CandidateChoice) => void
  onSkip: () => void
}) {
  return (
    <section className="px-3 py-4 sm:px-6 sm:py-7">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 rounded-md px-2 text-sm font-black text-[#315a57] hover:bg-white"><ArrowLeft size={17} />지도</button>
          <div className="text-right">
            <p className="text-xs font-black text-[#087f78]">{category.label} 8강 개인 대진</p>
            <p className="text-xs font-bold text-[#607875]">한 번 선택하면 자동으로 다음 대결</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {[candidateA, candidateB].map((candidate, index) => (
            <figure key={candidate.id} className="min-w-0 overflow-hidden rounded-md border border-[#cddfdb] bg-white">
              <div className="aspect-[4/5]"><CandidateVisual candidate={candidate} disclosure={category.imageDisclosure} priority={index === 0} /></div>
              <figcaption className="min-h-[88px] px-3 py-3 sm:min-h-[82px]">
                <p className="text-[10px] font-black text-[#087f78]">후보 {String(candidate.candidateNumber).padStart(2, '0')}</p>
                <h2 className="mt-1 break-keep text-sm font-black leading-5 text-[#173b3a] sm:text-lg">{candidate.name}</h2>
                <p className="mt-1 text-[11px] font-bold text-[#607875]">{candidate.neighborhood}</p>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-4 sm:gap-3">
          {candidateChoices.map((option) => (
            <button
              key={option.choice}
              type="button"
              onClick={() => onChoose(option.choice)}
              disabled={isResolving}
              className={`min-h-[76px] rounded-md border-2 px-3 py-3 text-left text-[11px] font-black leading-5 transition sm:min-h-16 sm:text-sm disabled:cursor-wait disabled:opacity-55 ${option.className}`}
            >
              {option.label(candidateA.name, candidateB.name)}
            </button>
          ))}
        </div>

        <div className="mt-3 flex min-h-10 items-center justify-between gap-3 border-t border-[#cddfdb] pt-3">
          <p className="text-xs font-black text-[#126b67] sm:text-sm" aria-live="polite">{feedback}</p>
          <button type="button" onClick={onSkip} disabled={isResolving} title="이번 대결 건너뛰기" aria-label="이번 대결 건너뛰기" className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-black text-[#607875] hover:bg-[#fff7df] disabled:opacity-50">
            <SkipForward size={16} />건너뛰기
          </button>
        </div>
      </div>
    </section>
  )
}

function MapView({ school, category, selectedCandidateId, rankingOpen, hydrated, session, personalRating, onSelectCandidate, onToggleRanking, onSelectCategory, onStart }: {
  school: CampusEatsSchool
  category: CampusEatsCategory
  selectedCandidateId: string | null
  rankingOpen: boolean
  hydrated: boolean
  session: BracketSession
  personalRating: PersonalRatingState
  onSelectCandidate: (candidateId: string) => void
  onToggleRanking: () => void
  onSelectCategory: (categoryId: CampusEatsCategoryId) => void
  onStart: () => void
}) {
  const selectedCandidate = findCandidate(category, selectedCandidateId ?? undefined) ?? category.candidates[0]
  const hasProgress = session.acceptedComparisonCount > 0 || session.status !== 'active'

  return (
    <section className="mx-auto w-full max-w-[1440px] px-0 sm:px-4 sm:py-4">
      <div className="border-b border-[#cddfdb] bg-white px-4 py-3 sm:rounded-t-md sm:border sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#087f78]">
              {category.id === 'coffee' ? <Coffee size={18} /> : <UtensilsCrossed size={18} />}
              <p className="text-xs font-black">{school.name} 생활권 · {category.candidates.length}곳 주소 확인</p>
            </div>
            <h1 className="mt-1 text-2xl font-black text-[#173b3a] sm:text-3xl">{school.name} {category.label} 지도</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {school.categories.map((item) => (
              <button key={item.id} type="button" onClick={() => onSelectCategory(item.id)} className={`h-10 rounded-md border px-4 text-sm font-black ${item.id === category.id ? 'border-[#087f78] bg-[#087f78] text-white' : 'border-[#cddfdb] bg-white text-[#315a57] hover:bg-[#eef7f5]'}`}>
                {item.label}
              </button>
            ))}
            <button type="button" onClick={onStart} disabled={!hydrated} className="flex h-10 items-center gap-2 rounded-md bg-[#ff6258] px-4 text-sm font-black text-white hover:bg-[#e95047] disabled:opacity-50">
              <Play size={16} fill="currentColor" />{hasProgress ? '내 대진 이어하기' : `${category.label} 8강 시작`}
            </button>
          </div>
        </div>
      </div>

      <div className={`grid min-h-[calc(100vh-194px)] bg-white sm:border sm:border-t-0 lg:h-[calc(100vh-162px)] lg:min-h-[620px] ${rankingOpen ? 'lg:grid-cols-[400px_minmax(0,1fr)]' : 'lg:grid-cols-[0_minmax(0,1fr)]'}`}>
        <aside className={`${rankingOpen ? 'block' : 'hidden'} order-2 min-h-0 border-b border-[#cddfdb] bg-white lg:order-1 lg:block lg:overflow-hidden lg:border-b-0 lg:border-r`} aria-label={`${category.label} 랭킹 목록`}>
          <div className={`${rankingOpen ? 'lg:w-[400px]' : 'lg:w-0'} flex h-full min-h-0 flex-col transition-[width]`}>
            <div className="flex items-center justify-between border-b border-[#dce7e4] px-4 py-3">
              <div>
                <p className="text-xs font-black text-[#087f78]">학교 순위 · 집계 중</p>
                <h2 className="mt-0.5 text-lg font-black">{category.label} 후보 {category.candidates.length}</h2>
              </div>
              <span className="rounded-md bg-[#f0f5d8] px-2 py-1 text-[11px] font-black text-[#536416]">내 기기 기준 1500</span>
            </div>

            <div className="max-h-[42vh] flex-1 overflow-y-auto lg:max-h-none">
              {category.candidates.map((candidate) => {
                const active = candidate.id === selectedCandidate?.id
                return (
                  <button key={candidate.id} type="button" onClick={() => onSelectCandidate(candidate.id)} className={`grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2 border-b border-[#e2ebe9] px-3 py-3 text-left transition ${active ? 'bg-[#fff0ed]' : 'bg-white hover:bg-[#eef7f5]'}`}>
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-white ${active ? 'bg-[#ff6258]' : 'bg-[#087f78]'}`}>{candidate.candidateNumber}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#173b3a]">{candidate.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-[#607875]">{candidate.neighborhood}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs font-black text-[#315a57]">내 기기 점수 {personalRating.ratings[candidate.id] ?? 1500}</span>
                      <span className="block text-[10px] font-bold text-[#82918f]">학교 순위 집계 중</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedCandidate && (
              <div className="border-t border-[#cddfdb] bg-[#f7faf9] p-4">
                <p className="text-[11px] font-black text-[#ff6258]">후보 {String(selectedCandidate.candidateNumber).padStart(2, '0')} · 장소 확인</p>
                <h3 className="mt-1 text-lg font-black text-[#173b3a]">{selectedCandidate.name}</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-[#607875]">{selectedCandidate.roadAddress || `${selectedCandidate.neighborhood} · 정확한 주소 확인 중`}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-black text-[#087f78]">내 기기 점수 {personalRating.ratings[selectedCandidate.id] ?? 1500} · 내 기기 전체 유효 비교 {personalRating.validComparisonCount}회</span>
                  <a href={selectedCandidate.naverSearchUrl} target="_blank" rel="noreferrer" className="flex h-9 items-center gap-1 rounded-md bg-[#087f78] px-3 text-xs font-black text-white hover:bg-[#066c66]">
                    <ExternalLink size={14} />네이버지도에서 장소 열기
                  </a>
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className="relative order-1 min-h-[520px] lg:order-2 lg:min-h-0">
          <NaverCampusMap candidates={category.candidates} selectedCandidateId={selectedCandidate?.id ?? null} onSelect={onSelectCandidate} />
          <button type="button" onClick={onToggleRanking} aria-expanded={rankingOpen} className="absolute left-3 top-3 z-20 hidden h-10 items-center gap-2 rounded-md bg-white px-3 text-xs font-black text-[#173b3a] shadow-md hover:bg-[#eef7f5] lg:flex">
            {rankingOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}{rankingOpen ? '랭킹 접기' : '랭킹 열기'}
          </button>
        </div>
      </div>

      <button type="button" onClick={onToggleRanking} aria-expanded={rankingOpen} className="sticky bottom-20 z-20 mx-3 mt-3 flex h-12 w-[calc(100%-1.5rem)] items-center justify-between rounded-md border border-[#cddfdb] bg-white px-4 text-sm font-black text-[#173b3a] shadow-lg lg:hidden">
        <span className="flex items-center gap-2"><ListFilter size={17} />{category.label} 랭킹 {rankingOpen ? '닫기' : '열기'}</span><ChevronDown className={rankingOpen ? 'rotate-180' : ''} size={18} />
      </button>
    </section>
  )
}

function ResultView({ category, session, personalRating, onMap, onResume, onRestart }: { category: CampusEatsCategory; session: BracketSession; personalRating: PersonalRatingState; onMap: () => void; onResume: () => void; onRestart: () => void }) {
  const winner = findCandidate(category, session.winnerId)
  const canResume = session.status === 'paused_needs_visits' && session.generation === 0
  return (
    <section className="px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-2xl border-y-4 border-[#173b3a] bg-[#f0f5d8] px-5 py-8 text-center sm:px-10">
        <Trophy className="mx-auto text-[#ff6258]" size={40} />
        {winner ? (
          <><p className="mt-5 text-xs font-black text-[#087f78]">MY {category.label.toUpperCase()} BRACKET</p><h2 className="mt-2 text-3xl font-black">{winner.name}</h2><p className="mt-3 text-sm font-bold text-[#607875]">내가 직접 비교해 고른 개인 대진 우승이에요.</p></>
        ) : canResume ? (
          <><h2 className="mt-5 text-3xl font-black">방문 경험이 더 필요해요</h2><p className="mt-3 text-sm font-bold text-[#607875]">한 번만 다시 보고 결정하거나 지도에서 가볼 곳을 확인할 수 있어요.</p></>
        ) : (
          <><h2 className="mt-5 text-3xl font-black">이번에는 우승 없이 마쳤어요</h2><p className="mt-3 text-sm font-bold text-[#607875]">가보지 않은 곳을 억지로 선택하지 않아도 됩니다.</p></>
        )}
        <div className="mt-6 rounded-md bg-white px-4 py-3">
          <p className="text-sm font-black text-[#536416]">학교 결과는 집계 중</p>
          <p className="mt-1 text-xs font-bold text-[#607875]">내 기기 유효 비교 {personalRating.validComparisonCount}회 · 이 기기에만 저장</p>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {canResume && <button type="button" onClick={onResume} className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#087f78] px-4 text-sm font-black text-white"><RotateCcw size={17} />한 번만 다시 보기</button>}
          <button type="button" onClick={onMap} className="flex h-12 items-center justify-center gap-2 rounded-md border border-[#087f78] bg-white px-4 text-sm font-black text-[#087f78]"><MapPinned size={17} />지도와 랭킹</button>
          <button type="button" onClick={onRestart} className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#173b3a] px-4 text-sm font-black text-white sm:col-span-2"><RotateCcw size={17} />내 대진 처음부터</button>
        </div>
      </div>
    </section>
  )
}
