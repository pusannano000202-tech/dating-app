'use client'

import { useState, useCallback, useEffect } from 'react'
import Image from 'next/image'
import type { Gender } from '@/lib/types'

/**
 * 자기유사 월드컵 — 사용자가 자신과 비슷한 외모를 고르는 토너먼트.
 * 이미지 파일명에 점수가 인코딩돼 있으나 사용자에게는 절대 노출하지 않는다.
 * 우승 이미지의 점수가 self_appearance_score로 저장된다.
 */

interface SelfImage {
  path: string
  score: number
}

// 32장에서 점수 분포 고려해 8장 추출 (낮은↔높은 점수가 초반에 맞붙도록 시딩)
const FEMALE_IMAGES: SelfImage[] = [
  { path: '/appearance-self/female/female_self_20.jpg', score: 20 },
  { path: '/appearance-self/female/female_self_30.jpg', score: 30 },
  { path: '/appearance-self/female/female_self_40.jpg', score: 40 },
  { path: '/appearance-self/female/female_self_50.jpg', score: 50 },
  { path: '/appearance-self/female/female_self_60.jpg', score: 60 },
  { path: '/appearance-self/female/female_self_68.jpg', score: 68 },
  { path: '/appearance-self/female/female_self_76.jpg', score: 76 },
  { path: '/appearance-self/female/female_self_86.jpg', score: 86 },
]

const MALE_IMAGES: SelfImage[] = [
  { path: '/appearance-self/male/male_self_20.jpg', score: 20 },
  { path: '/appearance-self/male/male_self_30.jpg', score: 30 },
  { path: '/appearance-self/male/male_self_40.jpg', score: 40 },
  { path: '/appearance-self/male/male_self_50.jpg', score: 50 },
  { path: '/appearance-self/male/male_self_60.jpg', score: 60 },
  { path: '/appearance-self/male/male_self_68.jpg', score: 68 },
  { path: '/appearance-self/male/male_self_76.jpg', score: 76 },
  { path: '/appearance-self/male/male_self_82.jpg', score: 82 },
]

// 8강 시딩: 점수 상하위가 초반에 맞붙어야 사용자가 빠르게 자기 구간을 좁힘
// [86 vs 20], [76 vs 30], [68 vs 40], [60 vs 50]
function buildBracket(images: SelfImage[]): [SelfImage, SelfImage][] {
  const sorted = [...images].sort((a, b) => b.score - a.score)
  const pairs: [SelfImage, SelfImage][] = []
  const half = sorted.length / 2
  for (let i = 0; i < half; i++) {
    pairs.push([sorted[i], sorted[sorted.length - 1 - i]])
  }
  return pairs
}

interface Props {
  gender: Gender
  onComplete: (score: number) => void
}

export default function AppearanceSelfWorldcup({ gender, onComplete }: Props) {
  const images = gender === 'female' ? FEMALE_IMAGES : MALE_IMAGES
  const totalMatches = images.length - 1 // 8강 = 7매치

  const [matchQueue, setMatchQueue] = useState<[SelfImage, SelfImage][]>(() =>
    buildBracket(images)
  )
  const [nextPool, setNextPool] = useState<SelfImage[]>([])
  const [matchNo, setMatchNo] = useState(0)
  const [chosen, setChosen] = useState<SelfImage | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)

  const roundLabel =
    matchQueue.length + nextPool.length > 3
      ? '8강'
      : matchQueue.length + nextPool.length > 1
      ? '4강'
      : '결승'

  const pick = useCallback(
    (img: SelfImage) => {
      if (isAnimating) return
      setIsAnimating(true)
      setChosen(img)

      setTimeout(() => {
        setChosen(null)
        const remaining = matchQueue.slice(1)
        const newPool = [...nextPool, img]

        if (remaining.length > 0) {
          setMatchQueue(remaining)
          setNextPool(newPool)
          setMatchNo((n) => n + 1)
          setIsAnimating(false)
          return
        }

        if (newPool.length === 1) {
          onComplete(newPool[0].score)
          return
        }

        // 다음 라운드 대진표 구성
        const nextMatches: [SelfImage, SelfImage][] = []
        const leftover: SelfImage[] = []
        for (let i = 0; i < newPool.length; i += 2) {
          if (i + 1 < newPool.length) {
            nextMatches.push([newPool[i], newPool[i + 1]])
          } else {
            leftover.push(newPool[i])
          }
        }

        setMatchQueue(nextMatches)
        setNextPool(leftover)
        setMatchNo((n) => n + 1)
        setIsAnimating(false)
      }, 400)
    },
    [isAnimating, matchQueue, nextPool, onComplete]
  )

  // 키보드: ← 왼쪽, → 오른쪽
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
  const progress = Math.round((matchNo / totalMatches) * 100)

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-6">
      {/* 헤더 */}
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-violet-400 tracking-widest uppercase">{roundLabel}</span>
          <span className="text-xs text-gray-500 tabular-nums">{matchNo + 1} / {totalMatches}</span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1">
          <div
            className="gradient-brand h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-5 text-center text-xl font-black tracking-tight">
          어느 쪽이 나와 더 비슷해 보여?
        </p>
        <p className="text-center text-sm text-gray-500 mt-1">외모 스타일이 나랑 비슷한 쪽을 골라줘</p>
      </div>

      {/* 대결 카드 */}
      <div className="w-full max-w-md flex gap-3">
        {([left, right] as SelfImage[]).map((img, idx) => {
          const isChosen = chosen?.path === img.path
          const isRejected = chosen !== null && chosen.path !== img.path

          return (
            <button
              key={img.path}
              onClick={() => pick(img)}
              disabled={isAnimating}
              aria-label={`${idx === 0 ? '왼쪽' : '오른쪽'} 사진 선택`}
              className={`
                relative flex-1 rounded-3xl overflow-hidden aspect-[3/4]
                border-2 transition-all duration-300
                ${isChosen ? 'border-white scale-[1.03]' : 'border-transparent'}
                ${isRejected ? 'opacity-30 scale-95' : ''}
                ${!isAnimating ? 'hover:border-white/50 active:scale-95' : ''}
                disabled:cursor-not-allowed
              `}
            >
              {/* 폴백 그라디언트 */}
              <div className="absolute inset-0 bg-gradient-to-b from-gray-800 to-gray-900" />

              <Image
                src={img.path}
                alt=""
                fill
                className="object-cover object-top"
                sizes="(max-width: 448px) 50vw, 200px"
                priority={idx === 0}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
              />

              {/* 하단 오버레이 */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

              {/* 선택 시 체크 */}
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
