'use client'

import { Check, Loader2, Sparkles } from 'lucide-react'
import { useRef, useState } from 'react'

import {
  parseQuantumMeetingMomentDraft,
  type QuantumMeetingMoment,
  type QuantumMeetingMomentDraft,
} from '@/lib/matching/quantum-profile-preferences'

type MeetingMomentDraft = {
  mood: QuantumMeetingMoment['mood'] | null
  expectation: QuantumMeetingMoment['expectation'] | null
  activityChoice: string | null
}

const MOOD_OPTIONS: ReadonlyArray<{ value: QuantumMeetingMoment['mood']; label: string; description: string }> = [
  { value: 'calm', label: '차분해요', description: '편하게 천천히' },
  { value: 'bright', label: '기분 좋아요', description: '가볍게 웃으며' },
  { value: 'curious', label: '궁금해요', description: '새 얘기를 듣고 싶어요' },
  { value: 'energetic', label: '활기 있어요', description: '같이 움직이고 싶어요' },
]

const EXPECTATION_OPTIONS: ReadonlyArray<{ value: QuantumMeetingMoment['expectation']; label: string; description: string }> = [
  { value: 'conversation', label: '편한 대화', description: '공통점을 찾아요' },
  { value: 'activity', label: '활동 몰입', description: '같이 해보며 친해져요' },
  { value: 'new_people', label: '새로운 사람', description: '다른 이야기를 만나요' },
  { value: 'easy_company', label: '부담 없는 동행', description: '조용히 함께 있어도 좋아요' },
]

const ACTIVITY_CHOICES: Record<string, ReadonlyArray<{ value: string; label: string }>> = {
  run: [
    { value: '편한 속도로 함께 달리기', label: '편한 속도' },
    { value: '중간에 쉬며 대화하기', label: '쉬며 대화' },
    { value: '끝나고 음료 마시기', label: '음료로 마무리' },
  ],
  'board-game': [
    { value: '규칙 쉬운 게임부터 시작하기', label: '쉬운 게임부터' },
    { value: '협동 게임 한 판 하기', label: '협동 게임' },
    { value: '취향 게임 하나 추천하기', label: '게임 추천' },
  ],
  drinks: [
    { value: '가벼운 안주를 나눠 먹기', label: '안주 나누기' },
    { value: '공통 질문으로 시작하기', label: '공통 질문' },
    { value: '정한 시간에 편하게 마무리하기', label: '편하게 마무리' },
  ],
  dinner: [
    { value: '메뉴 하나를 함께 고르기', label: '메뉴 함께 고르기' },
    { value: '맛집 이야기를 나누기', label: '맛집 이야기' },
    { value: '디저트로 마무리하기', label: '디저트' },
  ],
  walk: [
    { value: '밝은 길을 천천히 걷기', label: '천천히 걷기' },
    { value: '사진 포인트 하나 찾기', label: '사진 포인트' },
    { value: '카페에서 짧게 쉬기', label: '카페에서 쉬기' },
  ],
}

const ACTIVITY_ACCENTS: Record<keyof typeof ACTIVITY_CHOICES, { label: string; line: string; icon: string; text: string }> = {
  run: { label: '산책·조깅', line: 'border-[#2E7D63]', icon: 'text-[#2E7D63]', text: 'text-[#276A54]' },
  'board-game': { label: '보드게임', line: 'border-[#3B73AE]', icon: 'text-[#3B73AE]', text: 'text-[#315F91]' },
  drinks: { label: '가벼운 한잔', line: 'border-[#BA5A48]', icon: 'text-[#BA5A48]', text: 'text-[#984535]' },
  dinner: { label: '함께 식사', line: 'border-[#B7762F]', icon: 'text-[#B7762F]', text: 'text-[#8C5A20]' },
  walk: { label: '산책', line: 'border-[#2E7D63]', icon: 'text-[#2E7D63]', text: 'text-[#276A54]' },
}

export default function QuantumMeetingMomentWizard({
  activityKind,
  onContinue,
  submitting = false,
}: {
  activityKind: keyof typeof ACTIVITY_CHOICES
  onContinue: (meetingMoment: QuantumMeetingMomentDraft) => void | Promise<void>
  submitting?: boolean
}) {
  const continueInFlight = useRef(false)
  const [draft, setDraft] = useState<MeetingMomentDraft>(createEmptyDraft)
  const [error, setError] = useState<string | null>(null)
  const activityChoices = ACTIVITY_CHOICES[activityKind]
  const accent = ACTIVITY_ACCENTS[activityKind]

  async function continueWithMeetingMoment() {
    if (continueInFlight.current || submitting || !draft.mood || !draft.expectation || !draft.activityChoice) return
    const candidate = parseQuantumMeetingMomentDraft({
      mood: draft.mood,
      expectation: draft.expectation,
      activityChoice: draft.activityChoice,
    })
    if (!candidate) {
      setError('오늘의 기분, 기대하는 장면, 활동 선택을 다시 확인해 주세요.')
      return
    }

    continueInFlight.current = true
    setError(null)
    try {
      await onContinue(candidate)
    } catch {
      setError('신청을 이어가지 못했어요. 선택은 유지했으니 다시 시도해 주세요.')
    } finally {
      continueInFlight.current = false
    }
  }

  return (
    <section aria-labelledby="quantum-meeting-moment-title" className="border-y border-[#E8CEC7] bg-[#FFF9F7] py-5 sm:border sm:p-6">
      <header className={`border-l-2 pl-4 ${accent.line}`}>
        <p className={`text-[11px] font-black ${accent.text}`}>{accent.label} · 30 SECOND CHECK-IN</p>
        <h2 id="quantum-meeting-moment-title" className="mt-1 text-xl font-black text-[#281D1A]">오늘의 카드</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6F5D58]">평소 취향은 그대로 두고, 이번 만남에서의 내 상태만 골라요.</p>
      </header>

      <MomentChoiceGroup label="오늘의 기분" options={MOOD_OPTIONS} value={draft.mood} onChange={(mood) => setDraft((current) => ({ ...current, mood: mood as QuantumMeetingMoment['mood'] }))} />
      <MomentChoiceGroup label="기대하는 장면" options={EXPECTATION_OPTIONS} value={draft.expectation} onChange={(expectation) => setDraft((current) => ({ ...current, expectation: expectation as QuantumMeetingMoment['expectation'] }))} />

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <Sparkles size={17} className={accent.icon} aria-hidden="true" />
          <p className="text-base font-black text-[#281D1A]">활동에서 하고 싶은 선택</p>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {activityChoices.map((choice) => {
            const selected = draft.activityChoice === choice.value
            return <button key={choice.value} type="button" aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, activityChoice: choice.value }))} className={`min-h-12 rounded-lg border px-3 text-sm font-black ${selected ? 'border-[#D85C4E] bg-[#FFF0EB] text-[#A33E34]' : 'border-[#E5D3CE] bg-white text-[#5C4944]'}`}>{selected ? <Check size={15} className="mr-1 inline" aria-hidden="true" /> : null}{choice.label}</button>
          })}
        </div>
      </div>

      {error ? <p role="alert" className="mt-5 text-sm font-bold leading-6 text-[#9F3D33]">{error}</p> : null}
      <button type="button" disabled={submitting || !draft.mood || !draft.expectation || !draft.activityChoice} onClick={() => void continueWithMeetingMoment()} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-[#2E2928] px-5 text-base font-black text-white disabled:cursor-not-allowed disabled:bg-[#D9C9C4]">
        {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
        {submitting ? '참여 신청 중' : '오늘 카드 확인하고 참여 계속하기'}
      </button>
    </section>
  )
}

function MomentChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string | null
  options: ReadonlyArray<{ value: string; label: string; description: string }>
  onChange: (value: string) => void
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-base font-black text-[#281D1A]">{label}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = option.value === value
          return <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={`min-h-14 rounded-lg border px-3 py-2 text-left ${selected ? 'border-[#D85C4E] bg-[#FFF0EB]' : 'border-[#E5D3CE] bg-white'}`}><span className={`block text-sm font-black ${selected ? 'text-[#A33E34]' : 'text-[#41312C]'}`}>{option.label}</span><span className="mt-0.5 block text-xs font-bold text-[#79665F]">{option.description}</span></button>
        })}
      </div>
    </fieldset>
  )
}

function createEmptyDraft(): MeetingMomentDraft {
  return { mood: null, expectation: null, activityChoice: null }
}
