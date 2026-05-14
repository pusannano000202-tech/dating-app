'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import type { AppearanceType } from '@/lib/types'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'

// 8강: 6타입 + 부전승 2개
// [cute,pure], [chic,warm] → 유저가 선택
// [stylish,BYE], [healthy,BYE] → 자동 통과
const INITIAL_BRACKET: (AppearanceType | 'BYE')[][] = [
  ['cute', 'pure'],
  ['chic', 'warm'],
  ['stylish', 'BYE'],
  ['healthy', 'BYE'],
]

type BracketEntry = AppearanceType | 'BYE'

interface Props {
  onComplete: (type: AppearanceType) => void
}

export default function AppearanceWorldcup({ onComplete }: Props) {
  const [roundLabel, setRoundLabel] = useState('8강')
  const [matchQueue, setMatchQueue] = useState<[AppearanceType, AppearanceType][]>(() => {
    const real: [AppearanceType, AppearanceType][] = []
    for (const pair of INITIAL_BRACKET) {
      if (pair[0] !== 'BYE' && pair[1] !== 'BYE') {
        real.push([pair[0] as AppearanceType, pair[1] as AppearanceType])
      }
    }
    return real
  })
  const [nextRoundPool, setNextRoundPool] = useState<AppearanceType[]>(['stylish', 'healthy'])
  const [currentMatch, setCurrentMatch] = useState(0)
  const [selectedType, setSelectedType] = useState<AppearanceType | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  const totalUserChoices = 5 // 8강2 + 4강2 + 결승1

  const pick = useCallback(
    (chosen: AppearanceType) => {
      if (isAnimating) return
      setIsAnimating(true)
      setSelectedType(chosen)

      setTimeout(() => {
        setSelectedType(null)
        const remaining = matchQueue.slice(1)
        const newPool = [...nextRoundPool, chosen]

        if (remaining.length > 0) {
          setMatchQueue(remaining)
          setNextRoundPool(newPool)
          setCurrentMatch((m) => m + 1)
          setIsAnimating(false)
          return
        }

        if (newPool.length === 1) {
          onComplete(newPool[0])
          return
        }

        const nextMatches: [AppearanceType, AppearanceType][] = []
        const nextPool: AppearanceType[] = []
        for (let i = 0; i < newPool.length; i += 2) {
          if (i + 1 < newPool.length) {
            nextMatches.push([newPool[i], newPool[i + 1]])
          } else {
            nextPool.push(newPool[i])
          }
        }

        if (newPool.length <= 4) setRoundLabel('4강')
        if (newPool.length <= 2) setRoundLabel('결승')

        setMatchQueue(nextMatches)
        setNextRoundPool(nextPool)
        setCurrentMatch((m) => m + 1)
        setIsAnimating(false)
      }, 400)
    },
    [isAnimating, matchQueue, nextRoundPool, onComplete]
  )

  // 키보드: ← 왼쪽, → 오른쪽으로 카드 선택
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isAnimating || matchQueue.length === 0) return
      const [l, r] = matchQueue[0]
      if (e.key === 'ArrowLeft') pick(l)
      else if (e.key === 'ArrowRight') pick(r)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isAnimating, matchQueue, pick])

  if (matchQueue.length === 0) {
    return <div className="text-center py-20 text-gray-400">로딩 중...</div>
  }

  const [left, right] = matchQueue[0]
  const progress = Math.round((currentMatch / totalUserChoices) * 100)

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-6">
      {/* 헤더 */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-violet-400 tracking-widest uppercase">{roundLabel}</span>
          <span className="text-xs text-gray-500 tabular-nums">{currentMatch + 1} / {totalUserChoices}</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1">
          <div
            className="gradient-brand h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-5 text-center text-xl font-black tracking-tight">어떤 스타일이 더 좋아?</p>
        <p className="text-center text-sm text-gray-500 mt-1">직관적으로 골라봐</p>
      </div>

      {/* 대결 카드 — 사진 기반 */}
      <div className="w-full max-w-md flex gap-3">
        {([left, right] as AppearanceType[]).map((type) => {
          const info = APPEARANCE_TYPE_INFO[type]
          const isChosen = selectedType === type
          const isRejected = selectedType !== null && selectedType !== type

          return (
            <button
              key={type}
              onClick={() => pick(type)}
              disabled={isAnimating}
              className={`
                relative flex-1 rounded-3xl overflow-hidden
                aspect-[3/4]
                border-2 transition-all duration-300
                ${isChosen ? 'border-white scale-[1.03]' : 'border-transparent'}
                ${isRejected ? 'opacity-30 scale-95' : ''}
                ${!isAnimating ? 'hover:border-white/60 active:scale-95' : ''}
                disabled:cursor-not-allowed
              `}
            >
              {/* 사진 — public/appearance-types/{type}.jpg 없으면 gradient 폴백 */}
              <div className={`absolute inset-0 bg-gradient-to-b ${info.gradient}`} />
              <Image
                src={info.imagePath}
                alt={info.label}
                fill
                className="object-cover"
                sizes="(max-width: 448px) 50vw, 200px"
                priority
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />

              {/* 하단 그라디언트 + 텍스트 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 p-4">
                <p className="text-lg font-black mb-1.5">{info.label}</p>
                <div className="flex flex-wrap gap-1">
                  {info.keywords.map((kw) => (
                    <span
                      key={kw}
                      className="text-xs bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5"
                    >
                      {kw}
                    </span>
                  ))}
                </div>
              </div>

              {/* 선택 시 체크 표시 */}
              {isChosen && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
          )
        })}
      </div>

      <p className="mt-5 text-xs text-gray-700">탭해서 선택 · ← → 키보드 사용 가능</p>
    </div>
  )
}
