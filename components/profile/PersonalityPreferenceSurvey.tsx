'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, Heart, Palette, Waves, Zap, type LucideIcon } from 'lucide-react'
import {
  buildPersonalityPreferenceProfile,
  type PersonalityPreferenceAnswer,
  type PersonalityPreferenceAxis,
  type PersonalityPreferenceProfile,
} from '@/lib/matching/personality-preference'

interface Props {
  onComplete: (profile: PersonalityPreferenceProfile) => void
}

interface Trait {
  axis: PersonalityPreferenceAxis
  label: string
  subtitle: string
  Icon: LucideIcon
  iconBg: string
  questions: { id: string; text: string }[]
}

const TRAITS: Trait[] = [
  {
    axis: 'openness',
    label: '새로움',
    subtitle: '취향과 호기심이 있는 사람',
    Icon: Palette,
    iconBg: 'from-boot-primary to-boot-coral',
    questions: [
      { id: 'open_new_places', text: '새로운 장소나 취미를 같이 시도하는 상대에게 끌려?' },
      { id: 'open_deep_taste', text: '자기만의 취향이나 세계관이 뚜렷한 사람이 좋아?' },
    ],
  },
  {
    axis: 'conscientiousness',
    label: '계획성',
    subtitle: '약속과 책임감이 있는 사람',
    Icon: ClipboardCheck,
    iconBg: 'from-sky-500 to-cyan-400',
    questions: [
      { id: 'plan_keeps_promises', text: '약속을 잘 지키고 말한 걸 책임지는 상대에게 끌려?' },
      { id: 'plan_dates', text: '데이트나 일정을 어느 정도 계획해주는 사람이 좋아?' },
    ],
  },
  {
    axis: 'extraversion',
    label: '활동성',
    subtitle: '분위기를 열어주는 사람',
    Icon: Zap,
    iconBg: 'from-orange-500 to-amber-500',
    questions: [
      { id: 'social_leads_mood', text: '먼저 말 걸고 분위기를 만들어주는 상대에게 끌려?' },
      { id: 'social_goes_out', text: '친구들과도 자연스럽게 어울리는 사람이 좋아?' },
    ],
  },
  {
    axis: 'agreeableness',
    label: '다정함',
    subtitle: '공감과 배려가 자연스러운 사람',
    Icon: Heart,
    iconBg: 'from-emerald-500 to-teal-400',
    questions: [
      { id: 'care_empathy', text: '내 감정을 잘 알아차리고 공감해주는 상대에게 끌려?' },
      { id: 'care_kind_conflict', text: '갈등이 생겨도 배려하면서 말하는 사람이 좋아?' },
    ],
  },
  {
    axis: 'emotional_stability',
    label: '안정감',
    subtitle: '감정선이 차분한 사람',
    Icon: Waves,
    iconBg: 'from-rose-600 to-pink-600',
    questions: [
      { id: 'stable_calm', text: '감정 기복이 크지 않고 차분한 상대에게 끌려?' },
      { id: 'stable_conflict', text: '예민한 상황에서도 침착하게 대화하는 사람이 좋아?' },
    ],
  },
]

const SCALE_LABELS = ['전혀\n아니야', '별로\n아니야', '보통\n이야', '그런\n편이야', '완전\n그래']

export default function PersonalityPreferenceSurvey({ onComplete }: Props) {
  const [traitIdx, setTraitIdx] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[][]>(
    TRAITS.map((trait) => trait.questions.map(() => null)),
  )

  const trait = TRAITS[traitIdx]
  const currentAnswers = answers[traitIdx]
  const bothAnswered = currentAnswers.every((answer) => answer !== null)
  const isLast = traitIdx === TRAITS.length - 1
  const progress = Math.round(((traitIdx + (bothAnswered ? 1 : 0)) / TRAITS.length) * 100)

  const setAnswer = useCallback((questionIdx: number, value: number) => {
    setAnswers((prev) => {
      const next = prev.map((row) => [...row])
      next[traitIdx][questionIdx] = value
      return next
    })
  }, [traitIdx])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const val = Number(e.key)
      if (val < 1 || val > 5) return
      const unansweredIdx = currentAnswers.findIndex((answer) => answer === null)
      if (unansweredIdx === -1) return
      setAnswer(unansweredIdx, val)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentAnswers, setAnswer])

  useEffect(() => {
    if (!bothAnswered || isLast) return
    const timer = setTimeout(() => handleNext(), 600)
    return () => clearTimeout(timer)
  // handleNext uses current state after both answers are set.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bothAnswered, traitIdx])

  function handleNext() {
    if (!bothAnswered) return
    if (!isLast) {
      setTraitIdx((idx) => idx + 1)
      return
    }

    const logs: PersonalityPreferenceAnswer[] = TRAITS.flatMap((t, tIdx) =>
      t.questions.map((question, qIdx) => ({
        axis: t.axis,
        answer: answers[tIdx][qIdx] as 1 | 2 | 3 | 4 | 5,
        questionId: question.id,
      })),
    )
    onComplete(buildPersonalityPreferenceProfile(logs))
  }

  function handleBack() {
    if (traitIdx > 0) setTraitIdx((idx) => idx - 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-xs font-bold text-boot-primary">{trait.label}</span>
          <span className="text-xs text-boot-muted">{traitIdx + 1} / {TRAITS.length}</span>
        </div>
        <div className="w-full bg-boot-hairline rounded-full h-1">
          <div
            className="h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'linear-gradient(135deg, #ff5a6f, #ff7e5f)' }}
          />
        </div>
      </div>

      <div className="glass-strong rounded-3xl p-5 text-center border border-boot-hairline bg-white/90">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${trait.iconBg} mb-3 shadow-lg`}>
          <trait.Icon className="w-8 h-8 text-white" strokeWidth={1.8} />
        </div>
        <h2 className="text-xl font-black mb-1">{trait.label}</h2>
        <p className="text-xs text-boot-muted">{trait.subtitle}</p>
      </div>

      {trait.questions.map((question, questionIdx) => (
        <div key={question.id} className="glass rounded-2xl p-4 border border-boot-hairline">
          <p className="text-sm font-bold mb-4 leading-relaxed">{question.text}</p>
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((value) => {
              const selected = currentAnswers[questionIdx] === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAnswer(questionIdx, value)}
                  className={`flex-1 py-3 rounded-xl text-center transition-all duration-200 border ${
                    selected
                      ? 'border-transparent shadow-sm'
                      : 'border-boot-hairline bg-white/80 hover:border-boot-primary/30'
                  }`}
                  style={selected ? { background: 'linear-gradient(135deg, #ff5a6f, #ff7e5f)' } : {}}
                >
                  <div className={`text-xs font-bold ${selected ? 'text-white' : 'text-boot-body'}`}>{value}</div>
                  <div className={`text-[9px] mt-0.5 whitespace-pre-line leading-tight ${selected ? 'text-white/80' : 'text-boot-muted'}`}>
                    {SCALE_LABELS[value - 1]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <div className="flex gap-3">
        {traitIdx > 0 && (
          <button
            type="button"
            onClick={handleBack}
            className="glass py-4 px-5 rounded-2xl font-medium text-sm text-boot-body hover:text-boot-primary border border-boot-hairline transition-colors"
          >
            이전
          </button>
        )}
        <button
          type="button"
          onClick={handleNext}
          disabled={!bothAnswered}
          className="btn-gradient flex-1 py-4 rounded-2xl font-bold text-base shadow-sm disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLast ? '결과 보기' : '다음'}
        </button>
      </div>
    </div>
  )
}
