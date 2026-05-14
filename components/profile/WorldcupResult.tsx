'use client'

import type { AppearanceType } from '@/lib/types'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'

interface Props {
  winner: AppearanceType
  onConfirm: () => void
  onRetry: () => void
}

export default function WorldcupResult({ winner, onConfirm, onRetry }: Props) {
  const info = APPEARANCE_TYPE_INFO[winner]

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-950 text-white px-4 py-16">
      <p className="text-sm text-purple-400 font-semibold mb-2">최종 우승</p>
      <h1 className="text-2xl font-black mb-8">내 이상형 스타일은...</h1>

      <div
        className={`w-full max-w-sm rounded-3xl p-8 flex flex-col items-center gap-4 bg-gradient-to-b ${info.gradient}`}
      >
        <span className="text-7xl">{info.emoji}</span>
        <span className="text-3xl font-black">{info.label} 스타일</span>
        <div className="flex flex-wrap gap-2 justify-center">
          {info.keywords.map((kw) => (
            <span key={kw} className="bg-white/30 rounded-full px-3 py-1 text-sm font-medium">
              {kw}
            </span>
          ))}
        </div>
        <p className="text-center text-sm text-white/80 leading-relaxed">{info.description}</p>
      </div>

      <p className="mt-6 text-xs text-gray-500 text-center">
        이 결과는 매칭 시 참고 데이터로만 사용돼요.
        <br />
        상대방에게 공개되지 않아요.
      </p>

      <div className="mt-8 w-full max-w-sm flex flex-col gap-3">
        <button
          onClick={onConfirm}
          className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg transition-colors"
        >
          이걸로 할게요
        </button>
        <button
          onClick={onRetry}
          className="w-full py-3 rounded-2xl bg-white/10 hover:bg-white/20 font-medium transition-colors"
        >
          다시 해볼게요
        </button>
      </div>
    </div>
  )
}
