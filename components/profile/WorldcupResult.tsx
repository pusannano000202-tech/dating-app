'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import type { AppearanceType } from '@/lib/types'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'

interface Props {
  winner: AppearanceType
  saving?: boolean
  saveError?: string | null
  onConfirm: () => void
  onRetry: () => void
}

export default function WorldcupResult({ winner, saving = false, saveError, onConfirm, onRetry }: Props) {
  const info = APPEARANCE_TYPE_INFO[winner]

  // Enter 키로 확정, R 키로 다시하기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (saving) return
      if (e.key === 'Enter') onConfirm()
      if (e.key === 'r' || e.key === 'R') onRetry()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onConfirm, onRetry])

  return (
    <div className="flex flex-col items-center min-h-screen px-4 py-10">
      {/* 배경 glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-xs">
        <p className="text-xs font-bold text-violet-400 tracking-widest uppercase text-center mb-1">최종 우승</p>
        <h1 className="text-2xl font-black text-center mb-6">내 이상형 스타일은</h1>

        <div className="relative rounded-3xl overflow-hidden aspect-[3/4] mb-4 ring-2 ring-violet-500/60 shadow-2xl shadow-violet-900/40">
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
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <p className="text-2xl font-black mb-2">{info.label} 스타일</p>
            <div className="flex flex-wrap gap-1.5">
              {info.keywords.map((kw) => (
                <span key={kw} className="text-xs bg-white/20 backdrop-blur-sm rounded-full px-2.5 py-1">{kw}</span>
              ))}
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-400 text-center leading-relaxed px-2">{info.description}</p>

        <p className="mt-5 text-xs text-gray-700 text-center">
          이 결과는 매칭 참고용이에요. 상대방에게 공개되지 않아요.
        </p>

        <div className="mt-7 flex flex-col gap-3">
          {saveError && (
            <p className="text-xs text-red-400 text-center">{saveError}</p>
          )}
          <button
            onClick={onConfirm}
            disabled={saving}
            className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '이걸로 할게요'}
          </button>
          <button
            onClick={onRetry}
            className="w-full py-3.5 rounded-2xl glass font-medium text-sm text-gray-300 hover:text-white transition-colors"
          >
            다시 해볼게요
          </button>
        </div>
      </div>
    </div>
  )
}
