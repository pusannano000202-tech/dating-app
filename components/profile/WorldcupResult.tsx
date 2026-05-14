'use client'

import Image from 'next/image'
import type { AppearanceType } from '@/lib/types'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'

interface Props {
  winner: AppearanceType
  saving?: boolean
  onConfirm: () => void
  onRetry: () => void
}

export default function WorldcupResult({ winner, saving = false, onConfirm, onRetry }: Props) {
  const info = APPEARANCE_TYPE_INFO[winner]

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-950 text-white px-4 py-12">
      <p className="text-sm text-purple-400 font-semibold mb-1">최종 우승</p>
      <h1 className="text-2xl font-black mb-8">내 이상형 스타일은</h1>

      {/* 우승 사진 카드 */}
      <div className="w-full max-w-xs">
        <div className="relative rounded-3xl overflow-hidden aspect-[3/4] mb-4 ring-4 ring-purple-500">
          <div className={`absolute inset-0 bg-gradient-to-b ${info.gradient}`} />
          <Image
            src={info.imagePath}
            alt={info.label}
            fill
            className="object-cover"
            sizes="320px"
            priority
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <p className="text-2xl font-black mb-2">{info.label} 스타일</p>
            <div className="flex flex-wrap gap-1.5">
              {info.keywords.map((kw) => (
                <span key={kw} className="text-xs bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-1">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="text-sm text-gray-400 text-center leading-relaxed px-2">
          {info.description}
        </p>
      </div>

      <p className="mt-6 text-xs text-gray-600 text-center">
        이 결과는 매칭 참고용이에요. 상대방에게 공개되지 않아요.
      </p>

      <div className="mt-8 w-full max-w-xs flex flex-col gap-3">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? '저장 중...' : '이걸로 할게요'}
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
