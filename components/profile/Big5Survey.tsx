'use client'

import { useState } from 'react'

export interface Big5Scores {
  openness: number           // 0~1
  conscientiousness: number  // 0~1
  extraversion: number       // 0~1
  agreeableness: number      // 0~1
  neuroticism: number        // 0~1
}

interface Props {
  onComplete: (scores: Big5Scores) => void
}

interface Trait {
  key: keyof Big5Scores
  label: string
  emoji: string
  color: string
  questions: string[]
}

const TRAITS: Trait[] = [
  {
    key: 'openness',
    label: '개방성',
    emoji: '🎨',
    color: 'from-violet-500 to-fuchsia-500',
    questions: [
      '새로운 취미나 경험을 즐겨 찾는 편이야?',
      '창의적이거나 예술적인 것에 관심이 많아?',
    ],
  },
  {
    key: 'conscientiousness',
    label: '성실성',
    emoji: '📋',
    color: 'from-blue-500 to-cyan-500',
    questions: [
      '계획을 세우고 체계적으로 일하는 편이야?',
      '맡은 일은 끝까지 마무리하고 마는 편이야?',
    ],
  },
  {
    key: 'extraversion',
    label: '외향성',
    emoji: '🎉',
    color: 'from-orange-500 to-amber-500',
    questions: [
      '사람들과 어울릴 때 에너지가 충전되는 편이야?',
      '모임에서 먼저 말 걸고 분위기 만드는 편이야?',
    ],
  },
  {
    key: 'agreeableness',
    label: '친화성',
    emoji: '🤝',
    color: 'from-emerald-500 to-teal-500',
    questions: [
      '다른 사람 감정에 잘 공감하는 편이야?',
      '갈등보다는 타협과 배려를 선호해?',
    ],
  },
  {
    key: 'neuroticism',
    label: '감수성',
    emoji: '🌊',
    color: 'from-rose-500 to-pink-500',
    questions: [
      '스트레스나 걱정을 자주 느끼는 편이야?',
      '감정 기복이 있거나 예민한 편이야?',
    ],
  },
]

const SCALE_LABELS = ['전혀\n아니야', '별로\n아니야', '보통\n이야', '그런\n편이야', '완전\n그래']

export default function Big5Survey({ onComplete }: Props) {
  const [traitIdx, setTraitIdx] = useState(0)
  // answers[traitIdx][questionIdx] = 1~5
  const [answers, setAnswers] = useState<(number | null)[][]>(
    TRAITS.map(() => [null, null])
  )

  const trait = TRAITS[traitIdx]
  const currentAnswers = answers[traitIdx]
  const bothAnswered = currentAnswers.every((a) => a !== null)
  const isLast = traitIdx === TRAITS.length - 1

  function setAnswer(qIdx: number, value: number) {
    setAnswers((prev) => {
      const next = prev.map((row) => [...row])
      next[traitIdx][qIdx] = value
      return next
    })
  }

  function handleNext() {
    if (!bothAnswered) return
    if (isLast) {
      const scores = TRAITS.reduce((acc, t, i) => {
        const avg = (answers[i][0]! + answers[i][1]!) / 2
        acc[t.key] = Math.round(((avg - 1) / 4) * 100) / 100
        return acc
      }, {} as Big5Scores)
      onComplete(scores)
    } else {
      setTraitIdx((i) => i + 1)
    }
  }

  const progress = Math.round(((traitIdx + (bothAnswered ? 1 : 0)) / TRAITS.length) * 100)

  return (
    <div className="flex flex-col gap-6">
      {/* 진행 바 */}
      <div>
        <div className="flex justify-between mb-2">
          <span className="text-xs font-bold" style={{ background: `linear-gradient(135deg, #a78bfa, #f0abfc)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {trait.label}
          </span>
          <span className="text-xs text-gray-500">{traitIdx + 1} / {TRAITS.length}</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1">
          <div className="h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'linear-gradient(135deg, #7c3aed, #c026d3)' }} />
        </div>
      </div>

      {/* 트레이트 카드 */}
      <div className="glass-strong rounded-3xl p-5 text-center border border-white/10">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${trait.color} mb-3 shadow-lg`}>
          <span className="text-3xl">{trait.emoji}</span>
        </div>
        <h2 className="text-xl font-black mb-1">{trait.label}</h2>
        <p className="text-xs text-gray-500">솔직하게 답해줘 — 정답은 없어</p>
      </div>

      {/* 질문들 */}
      {trait.questions.map((q, qIdx) => (
        <div key={`${traitIdx}-${qIdx}`} className="glass rounded-2xl p-4">
          <p className="text-sm font-bold mb-4 leading-relaxed">{q}</p>

          {/* 5점 척도 */}
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((val) => {
              const selected = currentAnswers[qIdx] === val
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setAnswer(qIdx, val)}
                  className={`flex-1 py-3 rounded-xl text-center transition-all duration-200 border ${
                    selected
                      ? 'border-transparent shadow-md shadow-violet-900/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={selected ? { background: 'linear-gradient(135deg, #7c3aed, #c026d3)' } : {}}
                >
                  <div className={`text-xs font-bold ${selected ? 'text-white' : 'text-gray-400'}`}>{val}</div>
                  <div className={`text-[9px] mt-0.5 whitespace-pre-line leading-tight ${selected ? 'text-white/80' : 'text-gray-600'}`}>
                    {SCALE_LABELS[val - 1]}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleNext}
        disabled={!bothAnswered}
        className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-30 disabled:cursor-not-allowed"
      >
        {isLast ? '완료' : '다음'}
      </button>
    </div>
  )
}
