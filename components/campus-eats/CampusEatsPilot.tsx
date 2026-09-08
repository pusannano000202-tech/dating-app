'use client'

import Image from 'next/image'
import Link from 'next/link'
import { campusEatsModeForView, resolveAutoView, type PilotView } from '@/lib/campus-eats/entry-policy'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ListFilter,
  MapPinned,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Trophy,
  UtensilsCrossed,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import CampusEatsCategoryIcon from '@/components/campus-eats/CampusEatsCategoryIcon'
import CampusEatsBattleGuide from '@/components/campus-eats/CampusEatsBattleGuide'
import NaverCampusMap, { type CampusEatsMapStatus } from '@/components/campus-eats/NaverCampusMap'
import PlaceLinks from '@/components/places/PlaceLinks'
import {
  applyBattleAction,
  createBracketSession,
  createVisitedTournamentSession,
  getNextPair,
  getTournamentProgress,
} from '@/lib/campus-eats/bracket'
import {
  applyPersonalRatingEvent,
  createPersonalRatingState,
  markPersonalRatingVisits,
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
import type { CampusEatsCategoryResponse } from '@/lib/campus-eats/repository'
import {
  summarizeCampusEatsMapCoverage,
  toCampusEatsPublicPlace,
  type CampusEatsMapCoverage,
} from '@/lib/campus-eats/place-adapter'
import {
  normalizeCampusEatsSelectedRestaurantId,
  readCampusEatsUrlState,
  writeCampusEatsUrlState,
} from '@/lib/campus-eats/url-state'
import type { BattleAction, BracketSession, CandidateChoice, CandidatePair } from '@/lib/campus-eats/types'
import { buildPreservedRecordExport, isSupportedPersonalRatingRecord, isSupportedPilotRecord, readPreservedRecord, type PreservedRecord } from '@/lib/campus-eats/preserved-storage'

const STORAGE_VERSION = 4

type StoredPilot = {
  version: number
  session: BracketSession
  view: PilotView
  selectedCandidateId: string | null
  selectedVisitedCandidateIds: string[]
  tournamentStarted: boolean
  tournamentId: string
  eventSequence: number
}

type DirectEntryRequest = {
  categoryId: CampusEatsCategoryId
  selectedRestaurantId: string | null
  rankingOpen: boolean
  mode: 'map' | 'setup' | 'battle'
}

function parseDirectEntry(): DirectEntryRequest {
  if (typeof window === 'undefined') {
    return { categoryId: 'donkatsu', selectedRestaurantId: null, rankingOpen: true, mode: 'map' }
  }

  return readCampusEatsUrlState(window.location.search)
}

type CategoryDataStatus = 'loading' | 'ready' | 'error'

function toClientCategory(response: CampusEatsCategoryResponse): CampusEatsCategory {
  return {
    ...response.category,
    candidates: response.candidates.map(({ restaurant_id, include_status: _includeStatus, ...candidate }) => ({
      ...candidate,
      id: restaurant_id,
    })),
  }
}

function storageKey(schoolId: string, categoryId: CampusEatsCategoryId) {
  return `quantum-campus-eats-${schoolId}-${categoryId}-v4`
}

function personalRatingStorageKey(schoolId: string, categoryId: CampusEatsCategoryId) {
  return `quantum-campus-eats-personal-rating-${schoolId}-${categoryId}-v1`
}

function battleGuideStorageKey(schoolId: string) {
  return `quantum-campus-eats-battle-guide-${schoolId}-v4`
}

function hasCompletedBattleGuide(schoolId: string) {
  try {
    return window.localStorage.getItem(battleGuideStorageKey(schoolId)) === 'complete'
  } catch {
    return false
  }
}

function createInitialSession(category: CampusEatsCategory) {
  return createBracketSession({ candidateIds: category.candidates.map((candidate) => candidate.id) })
}

function createTournamentId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function findCandidate(category: CampusEatsCategory, id: string | undefined) {
  return category.candidates.find((candidate) => candidate.id === id)
}

function isStoredPilot(value: unknown, category: CampusEatsCategory): value is StoredPilot {
  return isSupportedPilotRecord(value, category.candidates.map(candidate => candidate.id))
}

function normalizeStoredPilot(stored: StoredPilot, category: CampusEatsCategory): StoredPilot {
  let view = stored.view
  const selectedCandidateId = typeof stored.selectedCandidateId === 'string' && findCandidate(category, stored.selectedCandidateId)
    ? stored.selectedCandidateId
    : category.candidates[0]?.id ?? null

  if (stored.session.status !== 'active' && view === 'battle') view = 'result'
  if (stored.session.status !== 'active' && view === 'setup') view = 'result'
  if (stored.session.status === 'active' && view === 'result') view = 'map'

  return { ...stored, view, selectedCandidateId }
}

export default function CampusEatsPilot() {
  const initialSchool = getCampusEatsSchool('pnu')
  const initialCategory = getCampusEatsCategory(initialSchool, 'donkatsu')
  const [selectedSchoolId, setSelectedSchoolId] = useState(initialSchool.id)
  const [selectedCategoryId, setSelectedCategoryId] = useState<CampusEatsCategoryId>(initialCategory.id)
  const pendingDirectEntryRef = useRef<DirectEntryRequest>({
    categoryId: 'donkatsu',
    selectedRestaurantId: null,
    rankingOpen: true,
    mode: 'map',
  })
  const selectedSchool = getCampusEatsSchool(selectedSchoolId)
  const fallbackCategory = getCampusEatsCategory(selectedSchool, selectedCategoryId)
  const [categoryCache, setCategoryCache] = useState<Partial<Record<CampusEatsCategoryId, CampusEatsCategory>>>({})
  const [categoryDataStatus, setCategoryDataStatus] = useState<CategoryDataStatus>('loading')
  const selectedCategory = selectedSchool.id === initialSchool.id
    ? categoryCache[selectedCategoryId] ?? fallbackCategory
    : fallbackCategory
  const selectedCategoryCandidateIds = selectedCategory.candidates.map((candidate) => candidate.id).join('|')
  const categoryScope = `${selectedSchool.id}:${selectedCategory.id}:${selectedCategoryCandidateIds}`
  const hydratedScopeRef = useRef<string | null>(null)
  const [hydratedScope, setHydratedScope] = useState<string | null>(null)
  const [session, setSession] = useState<BracketSession>(() => createInitialSession(initialCategory))
  const [personalRating, setPersonalRating] = useState<PersonalRatingState>(() => (
    createPersonalRatingState(initialCategory.candidates.map((candidate) => candidate.id))
  ))
  const [view, setView] = useState<PilotView>('map')
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(initialCategory.candidates[0]?.id ?? null)
  const [selectedVisitedCandidateIds, setSelectedVisitedCandidateIds] = useState<string[]>([])
  const [tournamentStarted, setTournamentStarted] = useState(false)
  const [tournamentId, setTournamentId] = useState('not-started')
  const [rankingOpen, setRankingOpen] = useState(true)
  const [hydrated, setHydrated] = useState(false)
  const [storageProtected, setStorageProtected] = useState(false)
  const [backupNotice, setBackupNotice] = useState('')
  const [backupSource, setBackupSource] = useState('')
  const sessionRecordRef = useRef<PreservedRecord<StoredPilot> | null>(null)
  const ratingRecordRef = useRef<PreservedRecord<PersonalRatingState> | null>(null)
  const [isResolving, setIsResolving] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [battleGuideOpen, setBattleGuideOpen] = useState(false)
  const [battleGuideRequired, setBattleGuideRequired] = useState(false)
  const battleGuideNextViewRef = useRef<PilotView>('setup')
  const eventSequenceRef = useRef(0)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const [visiblePair, setVisiblePair] = useState<CandidatePair | undefined>(() => getNextPair(createInitialSession(initialCategory)))
  const normalizedSelectedCandidateId = normalizeCampusEatsSelectedRestaurantId(
    selectedCategory.candidates.map((candidate) => candidate.id),
    selectedCandidateId,
  )

  useEffect(() => {
    const request = parseDirectEntry()
    pendingDirectEntryRef.current = request
    setSelectedCategoryId(request.categoryId)
    setSelectedCandidateId(request.selectedRestaurantId)
    setRankingOpen(request.rankingOpen)
  }, [])

  useEffect(() => {
    if (selectedSchool.id !== initialSchool.id) {
      setCategoryDataStatus('ready')
      return
    }

    let cancelled = false
    setCategoryDataStatus('loading')

    fetch(`/api/campus-eats?category=${selectedCategoryId}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('campus_eats_api_unavailable')
        return response.json() as Promise<CampusEatsCategoryResponse>
      })
      .then((response) => {
        if (cancelled || response.category.id !== selectedCategoryId || response.candidates.length === 0) return
        setCategoryCache((previous) => ({ ...previous, [selectedCategoryId]: toClientCategory(response) }))
        setCategoryDataStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setCategoryDataStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [initialSchool.id, selectedCategoryId, selectedSchool.id])

  const currentPair = useMemo(() => getNextPair(session), [session])
  const displayedPair = visiblePair ?? currentPair
  const candidateA = findCandidate(selectedCategory, displayedPair?.candidateAId)
  const candidateB = findCandidate(selectedCategory, displayedPair?.candidateBId)

  useEffect(() => {
    if (hydratedScopeRef.current === categoryScope) return
    setBackupNotice('')
    setBackupSource('')
    sessionRecordRef.current = null
    ratingRecordRef.current = null
    setStorageProtected(false)
    try {
      const initialSession = createInitialSession(selectedCategory)
      const initialPersonalRating = createPersonalRatingState(selectedCategory.candidates.map((candidate) => candidate.id))
      const requestedView = resolveAutoView(pendingDirectEntryRef.current, selectedCategory.id, initialSession)
      const requestedCandidateId = pendingDirectEntryRef.current.categoryId === selectedCategory.id
        ? pendingDirectEntryRef.current.selectedRestaurantId
        : null
      setSession(initialSession)
      setPersonalRating(initialPersonalRating)
      setSelectedVisitedCandidateIds([])
      setTournamentStarted(false)
      setTournamentId('not-started')
      setVisiblePair(getNextPair(initialSession))
      const requiresBattleGuide = pendingDirectEntryRef.current.mode !== 'map'
        && !hasCompletedBattleGuide(selectedSchool.id)
      battleGuideNextViewRef.current = requestedView
      setView(requiresBattleGuide ? 'map' : requestedView)
      setBattleGuideRequired(requiresBattleGuide)
      setBattleGuideOpen(requiresBattleGuide)
      setSelectedCandidateId(
        findCandidate(selectedCategory, requestedCandidateId ?? undefined)?.id
          ?? selectedCategory.candidates[0]?.id
          ?? null,
      )
      setFeedback(null)
      setIsResolving(false)
      eventSequenceRef.current = 0
      const ratingKey = personalRatingStorageKey(selectedSchool.id, selectedCategory.id)
      const candidateIds = selectedCategory.candidates.map((candidate) => candidate.id)
      const ratingRecord = readPreservedRecord(window.localStorage, ratingKey, (value) => (
        isSupportedPersonalRatingRecord(value, candidateIds) ? restorePersonalRatingState(value, candidateIds) : null
      ))
      ratingRecordRef.current = ratingRecord
      if (ratingRecord.value) {
        setPersonalRating(ratingRecord.value)
        setSelectedVisitedCandidateIds([...ratingRecord.value.visitedCandidateIds])
      }
      const sessionRecord = readPreservedRecord(window.localStorage, storageKey(selectedSchool.id, selectedCategory.id), (value) => (
        isStoredPilot(value, selectedCategory) ? normalizeStoredPilot(value, selectedCategory) : null
      ))
      sessionRecordRef.current = sessionRecord
      setStorageProtected(ratingRecord.status !== 'ready' || sessionRecord.status !== 'ready')
      const restored = sessionRecord.value
      if (!restored) return
      const restoredPair = getNextPair(restored.session)
      setSession(restored.session)
      setVisiblePair(restoredPair)
      setSelectedVisitedCandidateIds(restored.selectedVisitedCandidateIds)
      setTournamentStarted(restored.tournamentStarted)
      setTournamentId(restored.tournamentId)
      const restoredView = resolveAutoView(
        pendingDirectEntryRef.current,
        selectedCategory.id,
        restored.session,
        restored.tournamentStarted,
      )
      const restoredRequiresBattleGuide = pendingDirectEntryRef.current.mode !== 'map'
        && !hasCompletedBattleGuide(selectedSchool.id)
      battleGuideNextViewRef.current = restoredView
      setView(restoredRequiresBattleGuide ? 'map' : restoredView)
      setBattleGuideRequired(restoredRequiresBattleGuide)
      setBattleGuideOpen(restoredRequiresBattleGuide)
      setSelectedCandidateId(findCandidate(selectedCategory, requestedCandidateId ?? undefined)?.id
        ?? restored.selectedCandidateId)
      eventSequenceRef.current = restored.eventSequence
    } catch {
      sessionRecordRef.current?.protect()
      ratingRecordRef.current?.protect()
      // Reset only the in-memory view; persisted bytes stay protected and untouched.
      const safeSession = createInitialSession(selectedCategory)
      setSession(safeSession)
      setVisiblePair(getNextPair(safeSession))
      setView('map')
      setTournamentStarted(false)
      setTournamentId('not-started')
      eventSequenceRef.current = 0
      setStorageProtected(true)
    } finally {
      hydratedScopeRef.current = categoryScope
      setHydratedScope(categoryScope)
      setHydrated(true)
    }
  }, [categoryScope, selectedCategory, selectedCategoryCandidateIds, selectedSchool.id])

  useEffect(() => {
    if (!hydrated || hydratedScope !== categoryScope) return
    const stored: StoredPilot = {
      version: STORAGE_VERSION,
      session,
      view,
      selectedCandidateId,
      selectedVisitedCandidateIds,
      tournamentStarted,
      tournamentId,
      eventSequence: eventSequenceRef.current,
    }
    if (sessionRecordRef.current?.write(stored) !== 'saved') setStorageProtected(true)
  }, [categoryScope, hydratedScope, hydrated, selectedCandidateId, selectedCategory.id, selectedSchool.id, selectedVisitedCandidateIds, session, tournamentId, tournamentStarted, view])

  useEffect(() => {
    if (!hydrated || hydratedScope !== categoryScope) return
    if (ratingRecordRef.current?.write(personalRating) !== 'saved') setStorageProtected(true)
  }, [categoryScope, hydratedScope, hydrated, personalRating, selectedCategory.id, selectedSchool.id])

  useEffect(() => {
    if (!hydrated || hydratedScope !== categoryScope) return
    const search = writeCampusEatsUrlState({
      categoryId: selectedCategory.id,
      selectedRestaurantId: normalizedSelectedCandidateId,
      rankingOpen,
      mode: campusEatsModeForView(battleGuideRequired ? battleGuideNextViewRef.current : view),
    })
    if (window.location.search !== search) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
    }
  }, [categoryScope, hydratedScope, battleGuideRequired, hydrated, normalizedSelectedCandidateId, rankingOpen, selectedCategory.id, view])

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
    setBackupNotice('')
    setBackupSource('')
    clearFeedbackTimer()
    const nextSchool = getCampusEatsSchool(nextSchoolId)
    pendingDirectEntryRef.current = {
      categoryId: nextSchool.categories[0].id,
      selectedRestaurantId: null,
      rankingOpen,
      mode: 'map',
    }
    setHydrated(false)
    setSelectedSchoolId(nextSchool.id)
    setSelectedCategoryId(nextSchool.categories[0].id)
  }

  function selectCategory(categoryId: CampusEatsCategoryId) {
    if (categoryId === selectedCategory.id) return
    setBackupNotice('')
    setBackupSource('')
    clearFeedbackTimer()
    pendingDirectEntryRef.current = {
      categoryId,
      selectedRestaurantId: null,
      rankingOpen,
      mode: 'map',
    }
    setHydrated(false)
    setSelectedCategoryId(categoryId)
  }

  function startBattle() {
    const nextView: PilotView = tournamentStarted
      ? session.status === 'active' ? 'battle' : 'result'
      : 'setup'
    const requiresBattleGuide =
      !tournamentStarted
      && !hasCompletedBattleGuide(selectedSchool.id)
    if (requiresBattleGuide) {
      battleGuideNextViewRef.current = nextView
      setBattleGuideRequired(true)
      setBattleGuideOpen(true)
      return
    }
    setView(nextView)
  }

  function completeBattleGuide() {
    try {
      window.localStorage.setItem(battleGuideStorageKey(selectedSchool.id), 'complete')
    } catch {
      // The guide should still close when private browsing blocks local storage.
    }
    if (battleGuideRequired) {
      setView(battleGuideNextViewRef.current)
    }
    setBattleGuideRequired(false)
    setBattleGuideOpen(false)
  }

  function openBattleGuideReplay() {
    setBattleGuideRequired(false)
    setBattleGuideOpen(true)
  }

  function toggleVisitedCandidate(candidateId: string) {
    setSelectedVisitedCandidateIds((current) => current.includes(candidateId)
      ? current.filter((id) => id !== candidateId)
      : [...current, candidateId])
  }

  function beginVisitedTournament() {
    const categoryCandidateIds = new Set(selectedCategory.candidates.map((candidate) => candidate.id))
    const validVisitedCandidateIds = selectedVisitedCandidateIds.filter((candidateId) => categoryCandidateIds.has(candidateId))
    if (validVisitedCandidateIds.length < 2) {
      setFeedback('월드컵을 시작하려면 실제로 먹어본 곳을 최소 2곳 골라주세요.')
      return
    }

    const nextSession = createVisitedTournamentSession({
      visitedCandidateIds: validVisitedCandidateIds,
      ratings: personalRating.ratings,
    })
    const ratingBase = markPersonalRatingVisits(personalRating, validVisitedCandidateIds)
    clearFeedbackTimer()
    eventSequenceRef.current = 0
    setPersonalRating(ratingBase)
    setSession(nextSession)
    setVisiblePair(getNextPair(nextSession))
    setTournamentStarted(true)
    setTournamentId(createTournamentId())
    setFeedback(null)
    setIsResolving(false)
    setView('battle')
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

  function submitAction(action: BattleAction, ratingBase: PersonalRatingState = personalRating) {
    if (isResolving) return
    const transition = applyBattleAction(session, action)
    if (!transition.accepted) return

    eventSequenceRef.current += 1
    setSession(transition.state)
    setIsResolving(true)
    if (transition.outcome.ratingEligible && transition.outcome.winnerId && transition.outcome.loserId) {
      const ratingTransition = applyPersonalRatingEvent(ratingBase, {
        eventId: action.eventId,
        winnerId: transition.outcome.winnerId,
        loserId: transition.outcome.loserId,
      })
      const winner = findCandidate(selectedCategory, transition.outcome.winnerId)
      setPersonalRating(ratingTransition.state)
      setFeedback(
        ratingTransition.applied
          ? `내 기기 점수 · ${winner?.name ?? '선택한 후보'} +${ratingTransition.winnerDelta} · 근거 ${Math.round(ratingTransition.evidenceWeight * 100)}%`
          : '이미 반영한 비교예요. 다음 대결로 넘어갑니다.',
      )
    } else {
      setPersonalRating(ratingBase)
      setFeedback('방문 기록만 남겼어요. 승자 점수 반영은 건너뛰었습니다.')
    }
    finishFeedback(transition.state)
  }

  function choose(choice: Extract<CandidateChoice, 'both_visited_prefer_a' | 'both_visited_prefer_b'>) {
    if (!currentPair) return
    const ratingBase = markPersonalRatingVisits(personalRating, session.candidateIds)
    submitAction({
      type: 'candidate_choice',
      eventId: `${selectedSchool.id}-${selectedCategory.id}-${tournamentId}-${eventSequenceRef.current + 1}`,
      pair: currentPair,
      choice,
    }, ratingBase)
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
    setTournamentStarted(false)
    setTournamentId('not-started')
    setView('setup')
  }

  if (!hydrated || hydratedScope !== categoryScope) {
    return (
      <main className="min-h-screen bg-[#fff8f5] p-6 text-sm font-bold text-[#665C58]" role="status">
        선택한 음식의 월드컵을 준비하고 있어요.
      </main>
    )
  }

  function exportCurrentFoodRecords() {
    setBackupSource('')
    try {
      const backup = buildPreservedRecordExport(window.localStorage, selectedSchool.id, selectedCategory.id, new Date().toISOString())
      if (backup.records.length === 0) {
        setBackupNotice('이 학교·음식에 저장된 기록이 아직 없어요. 원래 기록은 변경하지 않았어요.')
        return
      }
      const serialized = JSON.stringify(backup, null, 2)
      setBackupSource(serialized)
      const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json;charset=utf-8' }))
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `quantum-${selectedSchool.id}-${selectedCategory.id}-backup-${Date.now()}.json`
        document.body.appendChild(anchor)
        try { anchor.click() } finally { anchor.remove() }
        setBackupNotice('백업 파일 다운로드를 요청했어요. 이 학교·음식의 저장 원문만 포함하며, 자동 복구나 다른 기기 동기화는 아니에요. 원본은 그대로 유지돼요.')
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } catch {
      setBackupNotice('저장 기록을 읽거나 백업 파일을 만들지 못했어요. 다운로드 설정을 확인해 주세요. 기존 기록은 변경하지 않았어요.')
    }
  }

  return (
    <main className="min-h-screen bg-[#fff8f5] pb-20 text-[#211b1a]">
      {storageProtected && <p role="status" className="mx-auto max-w-5xl border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        복원하지 못한 기존 기록은 덮어쓰지 않아요. 이전 기록의 형식이나 다른 창의 변경을 확인하지 못했거나 저장 공간을 사용할 수 없어, 새 선택 일부는 이 창에서만 유지돼요.
      </p>}
      <header className="border-b border-[#ecdcd4] bg-[#fffdfb] px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
          <button type="button" onClick={() => setView('map')} className="flex min-h-10 items-center gap-2 text-left" aria-label="캠퍼스 맛집 지도">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#c94d42] text-white"><UtensilsCrossed size={18} /></span>
            <span>
              <span className="block text-xs font-black text-[#c94d42]">CAMPUS EATS</span>
              <span className="block text-sm font-black">{selectedSchool.name} 맛집 지도</span>
            </span>
          </button>
          <label className="flex items-center gap-2 text-xs font-black">
            <span className="sr-only">학교 선택</span>
            <select value={selectedSchool.id} onChange={(event) => selectSchool(event.target.value)} className="h-10 max-w-36 rounded-md border border-[#e5d1c8] bg-white px-3 text-xs font-black text-[#211b1a] sm:max-w-none">
              {CAMPUS_EATS_SCHOOLS.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mx-auto mt-2 flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2">
          <Link href="/community/campus-eats?mode=choose" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-[#665C58] hover:bg-[#fff0e9] focus-visible:outline-2 focus-visible:outline-[#B94B3F]"><ArrowLeft size={15} aria-hidden="true" />다른 음식 고르기</Link>
          <button type="button" onClick={exportCurrentFoodRecords} disabled={!hydrated} className="min-h-11 rounded-lg border border-[#e5d1c8] px-3 text-xs font-bold text-[#665C58] hover:bg-[#fff0e9] focus-visible:outline-2 focus-visible:outline-[#B94B3F] disabled:opacity-50">이 음식 기록 백업</button>
        </div>
        {backupNotice ? <p role="status" className="mx-auto mt-2 max-w-[1440px] rounded-xl bg-[#fff0e9] p-3 text-xs leading-5 text-[#665C58]">{backupNotice}</p> : null}
        {backupSource ? <details className="mx-auto mt-2 max-w-[1440px] rounded-xl border border-[#e5d1c8] p-3">
          <summary className="min-h-8 cursor-pointer text-xs font-bold text-[#665C58]">다운로드가 안 되면 백업 원문 보기</summary>
          <p className="mb-2 mt-2 text-xs leading-5 text-[#665C58]">아래 내용을 전체 선택해 개인 파일로 보관할 수 있어요. 내 방문·선택 기록이 포함되니 공개 게시판에는 올리지 마세요. 서버로 전송하지 않습니다.</p>
          <textarea aria-label="이 음식 기록 백업 원문" readOnly value={backupSource} rows={5} className="w-full min-w-0 rounded-lg border border-[#e5d1c8] bg-white p-3 font-mono text-xs" />
        </details> : null}
      </header>

      {view === 'map' && (
        <MapView
          school={selectedSchool}
          category={selectedCategory}
          selectedCandidateId={selectedCandidateId}
          rankingOpen={rankingOpen}
          categoryDataStatus={categoryDataStatus}
          hydrated={hydrated}
          session={session}
          personalRating={personalRating}
          tournamentStarted={tournamentStarted}
          onSelectCandidate={setSelectedCandidateId}
          onToggleRanking={() => setRankingOpen((open) => !open)}
          onSelectCategory={selectCategory}
          onStart={startBattle}
        />
      )}
      {view === 'setup' && (
        <TournamentSetupView
          category={selectedCategory}
          selectedVisitedCandidateIds={selectedVisitedCandidateIds}
          feedback={feedback}
          savedProgressLabel={tournamentStarted ? session.status === 'active' ? '진행 중인 월드컵 이어하기' : '지난 결과 보기' : null}
          onOpenSaved={() => setView(session.status === 'active' ? 'battle' : 'result')}
          onBack={() => setView('map')}
          onOpenGuide={openBattleGuideReplay}
          onToggleCandidate={toggleVisitedCandidate}
          onStart={beginVisitedTournament}
        />
      )}
      {view === 'battle' && candidateA && candidateB && (
        <BattleView
          school={selectedSchool}
          category={selectedCategory}
          session={session}
          candidateA={candidateA}
          candidateB={candidateB}
          isResolving={isResolving}
          feedback={feedback}
          onBack={() => setView('map')}
          onOpenGuide={openBattleGuideReplay}
          onChoose={choose}
        />
      )}
      {view === 'result' && (
        <ResultView
          school={selectedSchool}
          category={selectedCategory}
          session={session}
          personalRating={personalRating}
          onMap={() => {
            setSelectedCandidateId(session.winnerId ?? null)
            setRankingOpen(false)
            setView('map')
          }}
          onRestart={resetPilot}
        />
      )}
      {battleGuideOpen ? (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-[#211b1a]/84 px-3 py-4 backdrop-blur-sm sm:px-6 sm:py-8" role="dialog" aria-modal="true" aria-label="맛집 월드컵 진행 방법">
          <div className="mx-auto w-full max-w-3xl">
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <div>
                <p className="text-xs font-black text-[#f3b95f]">진짜 1등을 뽑는 방식이에요</p>
                <p className="mt-1 text-sm font-bold">먹어본 곳을 모아 대진을 만들고, 결승까지 이긴 한 곳을 내 챔피언으로 뽑아요.</p>
              </div>
            </div>
            <CampusEatsBattleGuide
              onComplete={completeBattleGuide}
              onClose={!battleGuideRequired ? () => setBattleGuideOpen(false) : undefined}
            />
          </div>
        </div>
      ) : null}
    </main>
  )
}

function CandidateVisual({ candidate, priority = false }: { candidate: CampusEatsCandidate; priority?: boolean }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f0e9e4]">
      {candidate.imageSrc ? (
        <Image src={candidate.imageSrc} alt={candidate.imageAlt} fill sizes="(max-width: 768px) 50vw, 420px" className="object-contain" priority={priority} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-[#f6ede8] px-4 text-center text-[#c94d42]">
          <CampusEatsCategoryIcon categoryId={candidate.categoryId} size={36} />
          <span className="mt-3 text-sm font-black">{candidate.name}</span>
          <span className="mt-1 text-xs font-bold text-[#806f68]">사진 권리 확인 중</span>
        </div>
      )}
    </div>
  )
}

function TournamentSetupView({ category, selectedVisitedCandidateIds, feedback, savedProgressLabel, onOpenSaved, onBack, onOpenGuide, onToggleCandidate, onStart }: {
  category: CampusEatsCategory
  selectedVisitedCandidateIds: string[]
  feedback: string | null
  savedProgressLabel: string | null
  onOpenSaved: () => void
  onBack: () => void
  onOpenGuide: () => void
  onToggleCandidate: (candidateId: string) => void
  onStart: () => void
}) {
  const selectedCount = selectedVisitedCandidateIds.length
  const selectedCandidateIds = new Set(selectedVisitedCandidateIds)

  return (
    <section className="px-3 pb-36 pt-4 sm:px-6 lg:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex min-h-10 items-center gap-1 rounded-md px-2 text-sm font-black text-[#6f5d56] hover:bg-white"><ArrowLeft size={17} />맛집 지도</button>
          <button type="button" onClick={onOpenGuide} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-[#e5d1c8] bg-white px-3 text-xs font-black text-[#6f5d56] hover:bg-[#fff0e9]"><BookOpen size={15} />진행 방법</button>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
          <div>
            <div className="border-l-4 border-[#d96a5d] pl-4">
              <p className="text-xs font-black text-[#c94d42]">{category.label} · 새 월드컵 대진 만들기</p>
              <h1 className="mt-1 break-keep text-2xl font-black leading-tight text-[#211b1a] sm:text-3xl">먹어본 곳을 먼저 모두 골라주세요</h1>
              <p className="mt-2 break-keep text-sm font-bold leading-6 text-[#7d6d66]">선택한 곳만 월드컵에 들어갑니다. 7곳을 고르면 6번의 승부 끝에 반드시 한 곳이 우승해요.</p>
            </div>

            {savedProgressLabel && (
              <aside className="mt-4 rounded-xl border border-[#e5d1c8] bg-white p-4">
                <p className="text-sm font-bold text-[#665C58]">이 기기에 저장된 {category.label} 월드컵이 있어요.</p>
                <p className="mt-1 text-xs leading-5 text-[#665C58]">아래에서 새 대진을 만들 수 있어요. 새로 시작해도 누적 취향 순위는 유지돼요.</p>
                <button type="button" onClick={onOpenSaved} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#e5d1c8] px-3 text-sm font-bold text-[#a43e35] focus-visible:outline-2 focus-visible:outline-[#B94B3F]"><Trophy size={16} aria-hidden="true" />{savedProgressLabel}</button>
              </aside>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-4">
              {category.candidates.map((candidate) => {
                const selected = selectedCandidateIds.has(candidate.id)
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={selected}
                    data-visit-state={selected ? 'visited' : 'unvisited'}
                    onClick={() => onToggleCandidate(candidate.id)}
                    className={`group min-w-0 overflow-hidden rounded-md border-2 text-left transition ${selected ? 'border-[#d95c51] bg-[#fff1ed] shadow-[0_0_0_3px_rgba(217,92,81,0.12)]' : 'border-[#e2d1c9] bg-white hover:border-[#c9aaa0]'}`}
                  >
                    <span className="relative block aspect-[4/3] overflow-hidden bg-[#f0e9e4]">
                      <CandidateVisual candidate={candidate} />
                    </span>
                    <span className={`flex min-h-11 items-center justify-center gap-1 border-t px-2 text-center text-xs font-black ${selected ? 'border-[#d95c51] bg-[#d95c51] text-white' : 'border-[#ead8d0] bg-[#fffaf7] text-[#6f5d56]'}`}>
                      {selected ? <><Check size={16} strokeWidth={3} />먹어본 곳이에요</> : '먹어봤다면 선택'}
                    </span>
                    <span className="block min-h-[70px] px-3 py-2.5">
                      <span className="block break-keep text-sm font-black leading-5 text-[#211b1a]">{candidate.name}</span>
                      <span className="mt-1 block text-[11px] font-bold text-[#806f68]">{candidate.neighborhood}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <aside className="sticky top-5 hidden rounded-2xl border border-[#e3cfc6] bg-[#211b1a] p-5 text-white shadow-[0_18px_45px_rgba(63,40,31,0.18)] lg:block">
            <p className="text-xs font-black text-[#f3b95f]">내 {category.label} 대진</p>
            <p className="mt-2 text-3xl font-black">선택한 {selectedCount}곳</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-white/12 bg-white/7 p-3">
                <p className="text-[11px] font-bold text-white/65">우승까지</p>
                <p className="mt-1 text-lg font-black">총 {Math.max(0, selectedCount - 1)}번 승부</p>
              </div>
              <div className="rounded-md border border-white/12 bg-white/7 p-3">
                <p className="text-[11px] font-bold text-white/65">시작 조건</p>
                <p className="mt-1 text-lg font-black">최소 2곳</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-white/12 pt-4 text-xs font-bold leading-5 text-white/72">
              <p>고른 곳을 내 누적 취향 점수에 따라 대진에 배치해요.</p>
              <p>짝이 맞지 않으면 일부 가게는 다음 라운드로 바로 올라가요.</p>
              <p>마지막 결승 승자가 이번 월드컵 1등이에요.</p>
            </div>
            {feedback ? <p className="mt-3 rounded-md bg-[#fff1ed] px-3 py-2 text-xs font-black text-[#a63f36]" role="alert">{feedback}</p> : null}
            <button type="button" onClick={onStart} disabled={selectedCount < 2} className="mt-5 flex min-h-[54px] w-full items-center justify-center gap-2 rounded-md bg-[#f3b95f] px-4 text-sm font-black text-[#211b1a] hover:bg-[#ffc96f] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/45">
              <Play size={17} fill="currentColor" />{`${selectedCount}곳으로 ${category.label} 월드컵 시작`}
            </button>
          </aside>
        </div>
        <div aria-label="선택한 맛집으로 시작" className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 border-t border-[#e3cfc6] bg-[#fffaf7]/95 px-4 py-3 shadow-[0_-4px_20px_rgba(63,40,31,0.06)] backdrop-blur-sm lg:hidden">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <div className="shrink-0" aria-live="polite"><p className="text-sm font-black text-[#211b1a]">{selectedCount}곳 선택</p><p className="mt-1 text-[11px] font-bold text-[#806f68]">{selectedCount < 2 ? '최소 2곳을 골라요' : `우승까지 ${selectedCount - 1}번 비교`}</p></div>
            <button type="button" onClick={onStart} disabled={selectedCount < 2} className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#B94B3F] px-3 text-sm font-black text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B94B3F] disabled:cursor-not-allowed disabled:opacity-40"><Play size={16} aria-hidden="true" />{`${selectedCount}곳으로 ${category.label} 월드컵 시작`}</button>
          </div>
          {feedback && <p role="alert" className="mx-auto mt-2 max-w-3xl text-xs font-bold text-[#a63f36]">{feedback}</p>}
        </div>
      </div>
    </section>
  )
}

function BattleView({ school, category, session, candidateA, candidateB, isResolving, feedback, onBack, onOpenGuide, onChoose }: {
  school: CampusEatsSchool
  category: CampusEatsCategory
  session: BracketSession
  candidateA: CampusEatsCandidate
  candidateB: CampusEatsCandidate
  isResolving: boolean
  feedback: string | null
  onBack: () => void
  onOpenGuide: () => void
  onChoose: (choice: Extract<CandidateChoice, 'both_visited_prefer_a' | 'both_visited_prefer_b'>) => void
}) {
  const progress = getTournamentProgress(session)

  return (
    <section className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="flex h-10 items-center gap-1 rounded-md px-2 text-sm font-black text-[#6f5d56] hover:bg-white"><ArrowLeft size={17} />맛집 지도</button>
          <div className="flex items-center gap-2 text-right">
            <button type="button" onClick={onOpenGuide} className="inline-flex min-h-10 items-center gap-1 rounded-md border border-[#e5d1c8] bg-white px-2.5 text-xs font-black text-[#6f5d56] hover:bg-[#fff0e9]"><BookOpen size={15} />진행 방법</button>
            <div>
            <p className="text-xs font-black text-[#c94d42]">{category.label} {session.candidateIds.length}곳 월드컵</p>
            <p className="text-xs font-bold text-[#8a756d]">전체 {progress.completedComparisonCount} / {progress.totalComparisonCount}</p>
            </div>
          </div>
        </div>

        <div className="mb-5 border-l-4 border-[#d96a5d] pl-4">
          <p className="text-xs font-black text-[#c94d42]">{progress.roundLabel} · {progress.currentRoundMatchNumber} / {progress.currentRoundMatchCount}</p>
          <h1 className="mt-1 break-keep text-2xl font-black leading-tight text-[#211b1a] sm:text-3xl">
            둘 중 더 맛있었던 곳은?
          </h1>
          <p className="mt-2 text-sm font-bold text-[#7d6d66]">더 맛있었던 한 곳을 골라요. 다음 라운드로 올라가고 내 취향 순위에도 반영돼요.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4">
          {[candidateA, candidateB].map((candidate, index) => {
            const candidatePlace = toCampusEatsPublicPlace(candidate, { schoolName: school.name })
            const locationHref = candidatePlace.providerLinks.naver?.url ?? candidate.naverSearchUrl
            return (
              <article
                key={candidate.id}
                className={`group min-w-0 overflow-hidden rounded-md border-2 bg-white text-left transition ${index === 0 ? 'border-[#d95c51] hover:shadow-[0_0_0_4px_rgba(217,92,81,0.13)]' : 'border-[#d39a25] hover:shadow-[0_0_0_4px_rgba(211,154,37,0.13)]'}`}
              >
                <button
                  type="button"
                  onClick={() => onChoose(index === 0 ? 'both_visited_prefer_a' : 'both_visited_prefer_b')}
                  disabled={isResolving}
                  className="block w-full text-left transition disabled:pointer-events-none disabled:opacity-65"
                >
                  <span className="relative block aspect-[4/5] min-h-[200px]">
                    <CandidateVisual candidate={candidate} priority />
                  </span>
                  <span
                    data-ui="battle-action-strip"
                    className={`flex min-h-[54px] w-full items-center justify-center gap-1 border-y px-2 text-center text-xs font-black text-white transition sm:text-sm ${index === 0 ? 'border-[#c94d42] bg-[#c94d42] group-hover:bg-[#ad4037]' : 'border-[#b57b11] bg-[#b57b11] group-hover:bg-[#976508]'}`}
                  >
                    <>{candidate.name}<br className="sm:hidden" /> 더 맛있어요</>
                  </span>
                </button>
                <div className="min-h-8 bg-[#2b2523] px-2 py-1.5 text-[9px] font-black leading-4 text-white sm:text-[10px]">
                  {category.imageDisclosure}
                </div>
                <div className="min-h-[126px] px-3 py-3 sm:min-h-[120px]">
                  <p className={`text-[10px] font-black ${index === 0 ? 'text-[#c94d42]' : 'text-[#a36d0b]'}`}>후보 {String(candidate.candidateNumber).padStart(2, '0')}</p>
                  <h2 className="mt-1 break-keep text-sm font-black leading-5 text-[#211b1a] sm:text-lg">{candidate.name}</h2>
                  <p className="mt-1 text-[11px] font-bold text-[#806f68]">{candidate.neighborhood}</p>
                  <a
                    href={locationHref}
                    target="_blank"
                    rel="noreferrer"
                    data-preserves-battle-state="true"
                    className="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-1 rounded-lg border border-[#d8c6be] bg-[#fffaf7] px-2 text-xs font-black text-[#315a57] hover:border-[#087f78] hover:bg-[#edf8f6]"
                  >
                    <MapPinned size={14} aria-hidden="true" /><span>위치 확인</span>
                  </a>
                </div>
              </article>
            )
          })}
        </div>

        <div className="mt-3 flex min-h-11 items-center rounded-md border border-[#dce2f1] bg-[#eef1fb] px-3 py-2">
          <p className="text-xs font-black text-[#243f8f] sm:text-sm" aria-live="polite">{feedback ?? `${progress.roundLabel} 승자를 골라주세요.`}</p>
        </div>
      </div>
    </section>
  )
}

function MapView({ school, category, selectedCandidateId, rankingOpen, categoryDataStatus, hydrated, session, personalRating, tournamentStarted, onSelectCandidate, onToggleRanking, onSelectCategory, onStart }: {
  school: CampusEatsSchool
  category: CampusEatsCategory
  selectedCandidateId: string | null
  rankingOpen: boolean
  categoryDataStatus: CategoryDataStatus
  hydrated: boolean
  session: BracketSession
  personalRating: PersonalRatingState
  tournamentStarted: boolean
  onSelectCandidate: (candidateId: string) => void
  onToggleRanking: () => void
  onSelectCategory: (categoryId: CampusEatsCategoryId) => void
  onStart: () => void
}) {
  const candidateIdKey = category.candidates.map((candidate) => candidate.id).join('|')
  const [mapCoverage, setMapCoverage] = useState<CampusEatsMapCoverage>(() => (
    summarizeCampusEatsMapCoverage(category.candidates.map((candidate) => candidate.id), [])
  ))
  const [mapStatus, setMapStatus] = useState<CampusEatsMapStatus>('loading')
  useEffect(() => {
    setMapCoverage(summarizeCampusEatsMapCoverage(category.candidates.map((candidate) => candidate.id), []))
    setMapStatus('loading')
  }, [candidateIdKey, category.candidates])
  const selectedCandidate = findCandidate(category, selectedCandidateId ?? undefined) ?? category.candidates[0]
  const selectedPlace = selectedCandidate
    ? toCampusEatsPublicPlace(selectedCandidate, { schoolName: school.name })
    : null
  const startLabel = !tournamentStarted
    ? `${category.label} 월드컵 시작`
    : session.status === 'active'
      ? `내 ${session.candidateIds.length}곳 대진 이어하기`
      : '내 월드컵 결과 보기'
  const rankedCandidates = useMemo(() => [...category.candidates].sort((candidateA, candidateB) => {
    const ratingDelta = (personalRating.ratings[candidateB.id] ?? 1500) - (personalRating.ratings[candidateA.id] ?? 1500)
    return ratingDelta || candidateA.candidateNumber - candidateB.candidateNumber
  }), [category.candidates, personalRating.ratings])
  const resolvedCandidateIdSet = useMemo(
    () => new Set(mapCoverage.resolvedCandidateIds),
    [mapCoverage.resolvedCandidateIds],
  )

  return (
    <section className="mx-auto w-full max-w-[1440px] px-0 sm:px-4 sm:py-4">
      <div className="border-b border-[#ead8d0] bg-[#fffdfb] px-4 py-4 sm:rounded-t-md sm:border sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#c94d42]">
              <CampusEatsCategoryIcon categoryId={category.id} />
              <p className="text-xs font-black">{school.name} 생활권 · {category.candidates.length}곳 주소 확인</p>
            </div>
            <h1 className="mt-1 text-2xl font-black text-[#211b1a] sm:text-3xl">{school.name} 맛집 월드컵</h1>
            <p className="mt-1 text-xs font-bold text-[#806f68]">먹어본 곳끼리 비교할수록 내 취향 순위가 정교해져요.</p>
          </div>
          <div className="min-w-0 lg:max-w-[760px]">
            <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:justify-end lg:overflow-visible">
              {school.categories.map((item) => (
                <button key={item.id} type="button" onClick={() => onSelectCategory(item.id)} className={`flex h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-black ${item.id === category.id ? 'border-[#c94d42] bg-[#c94d42] text-white shadow-sm' : 'border-[#e5d1c8] bg-white text-[#6f5d56] hover:bg-[#fff0e9]'}`}>
                  <CampusEatsCategoryIcon categoryId={item.id} size={16} />
                  <span>{item.label}</span>
                  <span className={`text-[10px] ${item.id === category.id ? 'text-white/75' : 'text-[#a38f86]'}`}>{item.candidates.length}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={onStart} disabled={!hydrated} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#243f8f] px-4 text-sm font-black text-white hover:bg-[#1d3478] disabled:opacity-50 lg:ml-auto lg:w-auto lg:min-w-56">
              <Play size={16} fill="currentColor" />{startLabel}
            </button>
          </div>
        </div>
      </div>

      <button type="button" onClick={onToggleRanking} aria-expanded={rankingOpen} className="flex h-12 w-full items-center justify-between border-x border-b border-[#ead8d0] bg-white px-4 text-sm font-black text-[#6f5d56] lg:hidden">
        <span className="flex items-center gap-2"><ListFilter size={17} />{rankingOpen ? `${category.label} 내 순위` : '지도에서 위치 보기'}</span>
        <span className="text-[#243f8f]">{rankingOpen ? '지도 보기' : '순위 보기'}</span>
      </button>

      <div className={`grid min-h-[calc(100vh-194px)] bg-white sm:border sm:border-t-0 lg:h-[calc(100vh-162px)] lg:min-h-[620px] ${rankingOpen ? 'lg:grid-cols-[400px_minmax(0,1fr)]' : 'lg:grid-cols-[0_minmax(0,1fr)]'}`}>
        <aside className={`${rankingOpen ? 'block' : 'hidden'} order-1 min-h-0 border-b border-[#ead8d0] bg-white lg:block lg:overflow-hidden lg:border-b-0 lg:border-r`} aria-label={`${category.label} 랭킹 목록`}>
          <div className={`${rankingOpen ? 'lg:w-[400px]' : 'lg:w-0'} flex h-full min-h-0 flex-col transition-[width]`}>
            <div className="flex items-center justify-between border-b border-[#eee0d9] px-4 py-3">
              <div>
                <p className="text-xs font-black text-[#c94d42]">내 취향 순위 · 이 기기에 저장</p>
                <h2 className="mt-0.5 text-lg font-black">{category.label} 후보 {category.candidates.length}</h2>
              </div>
              <span className="rounded-md bg-[#eef1fb] px-2 py-1 text-[11px] font-black text-[#243f8f]">시작 점수 1500</span>
            </div>

            {categoryDataStatus === 'loading' && <p className="border-b border-[#dce7e4] px-4 py-2 text-xs font-bold text-[#607875]">후보 목록을 불러오는 중입니다.</p>}
            {categoryDataStatus === 'error' && <p className="border-b border-[#f3c5bd] bg-[#fff4f1] px-4 py-2 text-xs font-bold text-[#a4372c]">후보 목록을 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.</p>}

            <div className="max-h-[42vh] flex-1 overflow-y-auto lg:max-h-none">
              {rankedCandidates.map((candidate, rankingIndex) => {
                const active = candidate.id === selectedCandidate?.id
                return (
                  <button key={candidate.id} type="button" onClick={() => onSelectCandidate(candidate.id)} className={`grid w-full grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[#eee0d9] px-3 py-3 text-left transition ${active ? 'bg-[#fff0eb]' : 'bg-white hover:bg-[#fff7f2]'}`}>
                    <span className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border ${active ? 'border-[#c94d42] bg-[#fff0eb]' : 'border-[#e5d1c8] bg-[#f4eeea]'}`}>
                      {candidate.imageSrc ? <Image src={candidate.imageSrc} alt="" fill sizes="48px" className="object-contain" /> : <span className="text-xs font-black">{rankingIndex + 1}</span>}
                      <span className="absolute left-0 top-0 flex h-5 min-w-5 items-center justify-center bg-[#211b1a]/82 px-1 text-[9px] font-black text-white">{rankingIndex + 1}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-[#211b1a]">{candidate.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-[#806f68]">{candidate.neighborhood}</span>
                      <span
                        data-map-candidate-state={resolvedCandidateIdSet.has(candidate.id) ? 'resolved' : 'unresolved'}
                        className={`mt-1 block text-[10px] font-black ${resolvedCandidateIdSet.has(candidate.id) ? 'text-[#087f78]' : 'text-[#b05a24]'}`}
                      >
                        {resolvedCandidateIdSet.has(candidate.id)
                          ? '지도 핀 표시'
                          : mapStatus === 'loading'
                            ? '위치 확인 중'
                            : '지도 핀 미표시'}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xs font-black text-[#243f8f]">취향 점수 {personalRating.ratings[candidate.id] ?? 1500}</span>
                      <span className="block text-[10px] font-bold text-[#9a8880]">내 기기 순위</span>
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedCandidate && (
              <div className="border-t border-[#ead8d0] bg-[#fff8f5] p-4">
                <p className="text-[11px] font-black text-[#c94d42]">후보 {String(selectedCandidate.candidateNumber).padStart(2, '0')} · 장소 확인</p>
                <h3 className="mt-1 text-lg font-black text-[#211b1a]">{selectedCandidate.name}</h3>
                <p className="mt-1 text-xs font-bold leading-5 text-[#806f68]">{selectedCandidate.roadAddress || `${selectedCandidate.neighborhood} · 정확한 주소 확인 중`}</p>
                <div className="mt-3 grid gap-3">
                  <span className="text-[11px] font-black text-[#243f8f]">취향 점수 {personalRating.ratings[selectedCandidate.id] ?? 1500} · 먹어본 곳 {personalRating.visitedCandidateIds.length} · 비교 {personalRating.validComparisonCount}회</span>
                  {selectedPlace && <PlaceLinks place={selectedPlace} />}
                </div>
              </div>
            )}
          </div>
        </aside>

        <div className={`${rankingOpen ? 'hidden lg:flex' : 'flex'} relative order-2 min-h-[520px] flex-col lg:min-h-0`}>
          <div className="relative min-h-[400px] flex-1">
            <NaverCampusMap
              schoolName={school.name}
              candidates={category.candidates}
              selectedCandidateId={selectedCandidate?.id ?? null}
              onSelect={onSelectCandidate}
              onCoverageChange={setMapCoverage}
              onStatusChange={setMapStatus}
            />
            <button type="button" onClick={onToggleRanking} aria-expanded={rankingOpen} className="absolute left-3 top-3 z-20 hidden h-10 items-center gap-2 rounded-md bg-white px-3 text-xs font-black text-[#173b3a] shadow-md hover:bg-[#eef7f5] lg:flex">
              {rankingOpen ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />} {rankingOpen ? '랭킹 접기' : '랭킹 열기'}
            </button>
          </div>
          {!rankingOpen && selectedCandidate && selectedPlace && (
            <section
              aria-label={`${selectedCandidate.name} 빠른 장소 안내`}
              data-ui="selected-place-panel"
              className="shrink-0 border-t border-[#ead8d0] bg-white p-3 shadow-[0_-8px_24px_rgba(33,27,26,0.08)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black text-[#c94d42]">후보 {String(selectedCandidate.candidateNumber).padStart(2, '0')} · 바로 찾아가기</p>
                  <h3 className="mt-0.5 truncate text-base font-black text-[#211b1a]">{selectedCandidate.name}</h3>
                  <p className="mt-0.5 line-clamp-1 text-[11px] font-bold text-[#806f68]">{selectedCandidate.roadAddress || `${selectedCandidate.neighborhood} · 정확한 주소 확인 중`}</p>
                </div>
                <button type="button" onClick={onToggleRanking} className="shrink-0 rounded-lg bg-[#fff0eb] px-2.5 py-2 text-[11px] font-black text-[#b84439]">
                  상세 보기
                </button>
              </div>
              <PlaceLinks place={selectedPlace} className="mt-2 [&>a]:min-h-10 [&>a]:flex-1 [&>a]:px-2 [&>a]:py-1.5 [&>a]:text-[11px]" />
            </section>
          )}
        </div>
      </div>

    </section>
  )
}

function ResultView({ school, category, session, personalRating, onMap, onRestart }: { school: CampusEatsSchool; category: CampusEatsCategory; session: BracketSession; personalRating: PersonalRatingState; onMap: () => void; onRestart: () => void }) {
  const winner = findCandidate(category, session.winnerId)
  const winnerPlace = winner
    ? toCampusEatsPublicPlace(winner, { schoolName: school.name })
    : null
  const tournamentCandidateIds = new Set(session.candidateIds)
  const tournamentRanking = category.candidates
    .filter((candidate) => tournamentCandidateIds.has(candidate.id))
    .sort((candidateA, candidateB) => {
      const ratingDelta = (personalRating.ratings[candidateB.id] ?? 1500) - (personalRating.ratings[candidateA.id] ?? 1500)
      return ratingDelta || candidateA.candidateNumber - candidateB.candidateNumber
    })
  return (
    <section className="px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-md border border-[#e3cfc6] bg-[#fffaf7] shadow-[0_18px_55px_rgba(82,49,38,0.12)] lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        {winner ? (
          <div className="border-b border-[#e3cfc6] lg:border-b-0 lg:border-r">
            <span className="flex min-h-12 items-center justify-center gap-2 bg-[#c94d42] px-3 text-xs font-black text-white">
              <Trophy size={18} aria-hidden="true" />이번 월드컵 챔피언
            </span>
            <div className="relative mx-auto aspect-[4/3] max-h-[460px] w-full bg-[#f0e9e4]">
              <CandidateVisual candidate={winner} priority />
            </div>
            <p className="bg-[#2b2523] px-3 py-2 text-[10px] font-black leading-4 text-white">{category.imageDisclosure}</p>
            <div className="px-5 py-6 text-center sm:px-8">
              <p className="text-xs font-black text-[#c94d42]">내가 고른 {category.label} 1위</p>
              <h1 className="mt-2 break-keep text-3xl font-black text-[#211b1a] sm:text-4xl">{winner.name}</h1>
              <p className="mt-3 text-sm font-bold text-[#806f68]">결승 승자가 이번 1위</p>
              {winnerPlace && (
                <div className="mt-5 rounded-xl border border-[#ead8d0] bg-white p-4 text-left">
                  <p className="text-xs font-black text-[#c94d42]">우승 장소 위치 확인</p>
                  <p className="mt-1 text-xs font-bold leading-5 text-[#806f68]">
                    {winnerPlace.address?.road ?? `${winnerPlace.areaLabel} · 정확한 주소는 지도에서 확인해 주세요.`}
                  </p>
                  <PlaceLinks place={winnerPlace} className="mt-3" />
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <div className="rounded-md bg-[#fff0eb] px-3 py-3"><p className="text-[11px] font-bold text-[#806f68]">참가 매장</p><p className="mt-1 text-xl font-black text-[#c94d42]">{session.candidateIds.length}곳</p></div>
                <div className="rounded-md bg-[#eef1fb] px-3 py-3"><p className="text-[11px] font-bold text-[#6f6d7d]">완료한 승부</p><p className="mt-1 text-xl font-black text-[#243f8f]">{session.acceptedComparisonCount}번</p></div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-80 flex-col items-center justify-center bg-[#fff0eb] p-8 text-center"><Trophy className="text-[#c94d42]" size={44} /><h1 className="mt-4 text-2xl font-black">결과를 불러오지 못했어요</h1><p className="mt-2 text-sm font-bold text-[#806f68]">새 월드컵을 시작해 다시 확인해 주세요.</p></div>
        )}
        <div className="flex flex-col px-4 py-6 sm:px-6 sm:py-8">
          <div>
            <p className="text-xs font-black text-[#243f8f]">누적 취향 순위</p>
            <h2 className="mt-1 text-2xl font-black text-[#211b1a]">내 누적 취향 순위</h2>
            <p className="mt-2 break-keep text-xs font-bold leading-5 text-[#806f68]">지금까지 내가 고른 결과를 모은 순위예요. 이번 월드컵 우승과는 다를 수 있어요.</p>
          </div>
          <ol className="mt-5 divide-y divide-[#ead8d0] border-y border-[#ead8d0]">
            {tournamentRanking.map((candidate, index) => (
              <li key={candidate.id} className={`grid min-h-[58px] grid-cols-[30px_minmax(0,1fr)_auto] items-center gap-2 px-1 py-2 ${winner?.id === candidate.id ? 'bg-[#fff0eb]' : ''}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${winner?.id === candidate.id ? 'bg-[#c94d42] text-white' : 'bg-[#eee7e2] text-[#6f5d56]'}`}>{index + 1}</span>
                <span className="min-w-0"><span className="block truncate text-sm font-black text-[#211b1a]">{candidate.name}</span><span className="block text-[10px] font-bold text-[#8a756d]">{winner?.id === candidate.id ? '이번 챔피언' : candidate.neighborhood}</span></span>
                <span className="text-xs font-black text-[#243f8f]">취향 점수 {personalRating.ratings[candidate.id] ?? 1500}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] font-bold text-[#8a756d]">이 기기에만 저장 · 누적 유효 비교 {personalRating.validComparisonCount}회</p>
          <div className="mt-auto grid gap-3 pt-6 sm:grid-cols-2">
            <button type="button" onClick={onMap} className="flex h-12 items-center justify-center gap-2 rounded-md border border-[#243f8f] bg-white px-4 text-sm font-black text-[#243f8f] hover:bg-[#eef1fb]"><MapPinned size={17} />지도와 내 누적 순위</button>
            <button type="button" onClick={onRestart} className="flex h-12 items-center justify-center gap-2 rounded-md bg-[#243f8f] px-4 text-sm font-black text-white hover:bg-[#1d3478]"><RotateCcw size={17} />새 월드컵 만들기</button>
          </div>
        </div>
      </div>
    </section>
  )
}
