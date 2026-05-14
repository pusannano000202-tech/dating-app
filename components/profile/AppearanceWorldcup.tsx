'use client'

import { useState, useCallback } from 'react'
import type { AppearanceType } from '@/lib/types'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'

// 8강: 6타입 + 부전승 2개 → [cute,pure], [chic,warm], [stylish,BYE], [healthy,BYE]
// 부전승(BYE)은 자동으로 탈락 처리
const INITIAL_BRACKET: (AppearanceType | 'BYE')[][] = [
  ['cute', 'pure'],
  ['chic', 'warm'],
  ['stylish', 'BYE'],
  ['healthy', 'BYE'],
]

type BracketEntry = AppearanceType | 'BYE'

function runByes(pool: BracketEntry[]): AppearanceType[] {
  // BYE가 있는 매치는 상대방이 자동 통과
  const winners: AppearanceType[] = []
  for (let i = 0; i < pool.length; i += 2) {
    const a = pool[i]
    const b = pool[i + 1]
    if (a === 'BYE') winners.push(b as AppearanceType)
    else if (b === 'BYE') winners.push(a as AppearanceType)
    // 실제 대결은 caller가 처리
  }
  return winners
}

interface Props {
  onComplete: (type: AppearanceType) => void
}

export default function AppearanceWorldcup({ onComplete }: Props) {
  const [roundLabel, setRoundLabel] = useState('8강')
  const [matchQueue, setMatchQueue] = useState<[AppearanceType, AppearanceType][]>(() => {
    // 8강에서 BYE 없는 실제 대결만 추출
    const real: [AppearanceType, AppearanceType][] = []
    for (const pair of INITIAL_BRACKET) {
      if (pair[0] !== 'BYE' && pair[1] !== 'BYE') {
        real.push([pair[0] as AppearanceType, pair[1] as AppearanceType])
      }
    }
    return real
  })
  // 8강 부전승자 (stylish, healthy)를 미리 다음 라운드 풀에 추가
  const [nextRoundPool, setNextRoundPool] = useState<AppearanceType[]>(['stylish', 'healthy'])
  const [currentMatch, setCurrentMatch] = useState(0)
  const [totalMatches, setTotalMatches] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const totalUserChoices = 2 + 2 + 1 // 8강2 + 4강2 + 결승1 = 5회

  const pick = useCallback(
    (chosen: AppearanceType) => {
      if (isAnimating) return
      setIsAnimating(true)

      setTimeout(() => {
        const remaining = matchQueue.slice(1)
        const newPool = [...nextRoundPool, chosen]

        if (remaining.length > 0) {
          // 같은 라운드에 남은 경기 있음
          setMatchQueue(remaining)
          setNextRoundPool(newPool)
          setCurrentMatch((m) => m + 1)
          setIsAnimating(false)
          return
        }

        // 이 라운드 끝 → 다음 라운드 구성
        if (newPool.length === 1) {
          // 우승자 결정
          onComplete(newPool[0])
          return
        }

        // 다음 라운드 매치 생성 (풀을 순서대로 2개씩 페어링)
        const nextMatches: [AppearanceType, AppearanceType][] = []
        const nextPool: AppearanceType[] = []
        for (let i = 0; i < newPool.length; i += 2) {
          if (i + 1 < newPool.length) {
            nextMatches.push([newPool[i], newPool[i + 1]])
          } else {
            nextPool.push(newPool[i]) // 홀수면 부전승
          }
        }

        const total = newPool.length
        if (total <= 4) setRoundLabel('4강')
        if (total <= 2) setRoundLabel('결승')

        setMatchQueue(nextMatches)
        setNextRoundPool(nextPool)
        setCurrentMatch((m) => m + 1)
        setIsAnimating(false)
      }, 300)
    },
    [isAnimating, matchQueue, nextRoundPool, onComplete]
  )

  if (matchQueue.length === 0) {
    return <div className="text-center py-20 text-gray-400">로딩 중...</div>
  }

  const [left, right] = matchQueue[0]
  const leftInfo = APPEARANCE_TYPE_INFO[left]
  const rightInfo = APPEARANCE_TYPE_INFO[right]
  const progress = Math.round((currentMatch / totalUserChoices) * 100)

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-950 text-white px-4 py-8">
      {/* 헤더 */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-purple-400">{roundLabel}</span>
          <span className="text-sm text-gray-400">
            {currentMatch + 1} / {totalUserChoices}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5">
          <div
            className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-4 text-center text-lg font-bold">
          나는 어떤 스타일이 더 좋아?
        </p>
        <p className="text-center text-sm text-gray-400 mt-1">
          직관적으로 골라봐 — 정답 없어
        </p>
      </div>

      {/* 대결 카드 */}
      <div className="w-full max-w-md flex gap-3">
        {([left, right] as AppearanceType[]).map((type, idx) => {
          const info = idx === 0 ? leftInfo : rightInfo
          return (
            <button
              key={type}
              onClick={() => pick(type)}
              disabled={isAnimating}
              className={`
                flex-1 rounded-2xl p-5 flex flex-col items-center gap-3 border-2 border-transparent
                bg-gradient-to-b ${info.gradient} bg-opacity-20
                hover:border-white active:scale-95 transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <span className="text-5xl">{info.emoji}</span>
              <span className="text-lg font-bold">{info.label}</span>
              <div className="flex flex-wrap gap-1 justify-center">
                {info.keywords.map((kw) => (
                  <span
                    key={kw}
                    className="text-xs bg-white/20 rounded-full px-2 py-0.5"
                  >
                    {kw}
                  </span>
                ))}
              </div>
              <p className="text-xs text-center text-white/70 leading-snug">
                {info.description}
              </p>
            </button>
          )
        })}
      </div>

    </div>
  )
}
