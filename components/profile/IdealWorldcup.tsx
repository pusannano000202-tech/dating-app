'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Image from 'next/image'
import {
  type IdealImageItem,
  type IdealMetadata,
  selectActivePool,
  computePoolMeanVector,
  computePoolStats,
  publicImageUrl,
} from '@/lib/appearance/metadata'
import {
  type ChoiceLog,
  type PreferenceResult,
  type RoundLabel,
  buildChoiceLog,
  computePreference,
} from '@/lib/appearance/preference'

interface Props {
  metadata: IdealMetadata
  gender: 'female' | 'male'
  onComplete: (result: PreferenceResult) => void
}

interface Match {
  left: IdealImageItem
  right: IdealImageItem
  round: RoundLabel
  match_index: number
}

// pool 크기 → 시작 라운드 라벨
function roundLabelForSize(size: number): RoundLabel {
  if (size >= 64) return '64강'
  if (size >= 32) return '32강'
  if (size >= 16) return '16강'
  if (size >= 8) return '8강'
  if (size >= 4) return '4강'
  return '결승'
}

function shuffle<T>(arr: T[], seed: number): T[] {
  // 작은 LCG. 같은 사용자 세션 안에서 결정적이지 않게.
  let s = seed
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function pairUpBucketAware(items: IdealImageItem[], round: RoundLabel): Match[] {
  const out: Match[] = []
  const queue = [...items]

  while (queue.length >= 2) {
    const left = queue.shift()!
    const differentBucketIndex = queue.findIndex(
      (candidate) => candidate.final_bucket !== left.final_bucket,
    )
    const rightIndex = differentBucketIndex >= 0 ? differentBucketIndex : 0
    const [right] = queue.splice(rightIndex, 1)
    out.push({ left, right, round, match_index: out.length })
  }

  return out
}

export default function IdealWorldcup({ metadata, gender, onComplete }: Props) {
  // 풀 선별 — active 이미지만, measured 가 있는 것만
  const pool = useMemo(() => selectActivePool(metadata, gender), [metadata, gender])
  const poolMean = useMemo(() => computePoolMeanVector(pool), [pool])
  const poolStats = useMemo(() => computePoolStats(gender, pool), [gender, pool])

  // 초기 라운드 생성 (랜덤 셔플)
  const initial = useMemo(() => {
    const shuffled = shuffle(pool, Date.now() & 0xffff)
    // 2의 거듭제곱 크기로 자른다 (BYE 처리 없이)
    const targetSize = largestPow2(shuffled.length)
    const trimmed = shuffled.slice(0, targetSize)
    const round = roundLabelForSize(trimmed.length)
    return { items: trimmed, round, matches: pairUpBucketAware(trimmed, round) }
  }, [pool])

  const [matches, setMatches] = useState<Match[]>(initial.matches)
  const [currentRound, setCurrentRound] = useState<RoundLabel>(initial.round)
  const [nextRoundWinners, setNextRoundWinners] = useState<IdealImageItem[]>([])
  const [choiceLogs, setChoiceLogs] = useState<ChoiceLog[]>([])
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0)
  const [animatingId, setAnimatingId] = useState<string | null>(null)
  const [totalDone, setTotalDone] = useState(0)

  // 토너먼트의 총 매치 수 = N - 1 (N장 풀에서 우승자 1명까지)
  const totalMatches = initial.items.length - 1

  const finishWithResult = useCallback(
    (logs: ChoiceLog[], finalWinner: IdealImageItem) => {
      if (!poolMean) return
      const winnerItems = pool // 어차피 같은 풀에서 골랐으니 그대로 사용
      const result = computePreference({
        gender,
        choiceLogs: logs,
        poolMeanVector: poolMean,
        poolAxisStats: poolStats,
        winnerItems,
        finalWinnerId: finalWinner.id,
      })
      onComplete(result)
    },
    [poolMean, poolStats, pool, gender, onComplete],
  )

  const pick = useCallback(
    (chosen: IdealImageItem, opposite: IdealImageItem) => {
      if (animatingId) return
      setAnimatingId(chosen.id)

      // 즉시 로그 누적
      const log = buildChoiceLog(currentRound, currentMatchIdx, chosen, opposite)
      const nextLogs = [...choiceLogs, log]

      setTimeout(() => {
        setAnimatingId(null)
        setChoiceLogs(nextLogs)
        setTotalDone((t) => t + 1)

        const remaining = matches.slice(1)
        const newWinners = [...nextRoundWinners, chosen]

        if (remaining.length > 0) {
          setMatches(remaining)
          setNextRoundWinners(newWinners)
          setCurrentMatchIdx((idx) => idx + 1)
          return
        }

        // 라운드 종료
        if (newWinners.length === 1) {
          // 최종 우승
          finishWithResult(nextLogs, newWinners[0])
          return
        }

        const nextRound = roundLabelForSize(newWinners.length)
        const nextMatches = pairUpBucketAware(newWinners, nextRound)
        setMatches(nextMatches)
        setNextRoundWinners([])
        setCurrentRound(nextRound)
        setCurrentMatchIdx(0)
      }, 350)
    },
    [
      animatingId,
      matches,
      nextRoundWinners,
      choiceLogs,
      currentRound,
      currentMatchIdx,
      finishWithResult,
    ],
  )

  // 키보드 단축키
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (animatingId || matches.length === 0) return
      const cur = matches[0]
      if (e.key === 'ArrowLeft') pick(cur.left, cur.right)
      else if (e.key === 'ArrowRight') pick(cur.right, cur.left)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [animatingId, matches, pick])

  // 빈 풀 처리
  if (pool.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-center text-gray-300 text-sm leading-relaxed">
          이상형 월드컵에 사용할 이미지가 아직 준비되지 않았어.<br />
          잠시 후 다시 시도해줘.
        </p>
      </div>
    )
  }

  if (matches.length === 0) {
    return <div className="text-center py-20 text-gray-400">불러오는 중...</div>
  }

  const cur = matches[0]
  const progress = Math.round((totalDone / totalMatches) * 100)

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-6">
      <div className="w-full max-w-md mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-violet-400 tracking-widest uppercase">
            {currentRound}
          </span>
          <span className="text-xs text-gray-500 tabular-nums">
            {totalDone + 1} / {totalMatches}
          </span>
        </div>
        <div className="w-full bg-white/10 rounded-full h-1">
          <div
            className="gradient-brand h-1 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-5 text-center text-xl font-black tracking-tight">
          어떤 사람이 더 끌려?
        </p>
        <p className="text-center text-sm text-gray-500 mt-1">직관적으로 골라봐</p>
      </div>

      <div className="w-full max-w-md flex gap-3">
        {[cur.left, cur.right].map((item, idx) => {
          const isChosen = animatingId === item.id
          const isRejected = animatingId !== null && animatingId !== item.id
          const opposite = idx === 0 ? cur.right : cur.left
          return (
            <button
              key={item.id}
              onClick={() => pick(item, opposite)}
              disabled={!!animatingId}
              aria-label={`${idx === 0 ? '왼쪽' : '오른쪽'} 사진 선택`}
              className={`
                relative flex-1 rounded-3xl overflow-hidden
                aspect-[3/4]
                border-2 transition-all duration-300
                ${isChosen ? 'border-white scale-[1.03]' : 'border-transparent'}
                ${isRejected ? 'opacity-30 scale-95' : ''}
                ${!animatingId ? 'hover:border-white/60 active:scale-95' : ''}
                disabled:cursor-not-allowed
                bg-white/5
              `}
            >
              <Image
                src={publicImageUrl(item.file)}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 448px) 50vw, 200px"
                priority
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                }}
              />

              {isChosen && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
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

function largestPow2(n: number): number {
  if (n < 2) return 0
  let p = 1
  while (p * 2 <= n) p *= 2
  return p
}
