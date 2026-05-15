'use client'

import { useEffect, useState } from 'react'
import { Sparkles, Star, Crosshair } from 'lucide-react'

/**
 * 자기유사 월드컵 결과 화면.
 * 점수는 절대 사용자에게 노출하지 않는다.
 */

interface Props {
  saving?: boolean
  saveError?: string | null
  onConfirm: () => void
  onRetry: () => void
}

const MESSAGES = [
  { Icon: Sparkles, text: '나를 잘 알고 있네!' },
  { Icon: Star,     text: '솔직하게 골랐어?' },
  { Icon: Crosshair, text: '딱 맞는 선택이야!' },
]

export default function SelfWorldcupResult({ saving, saveError, onConfirm, onRetry }: Props) {
  const [msgIdx] = useState(() => Math.floor(Math.random() * MESSAGES.length))
  const { Icon, text } = MESSAGES[msgIdx]

  // Enter: 확정, R: 다시하기
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
    <div className="flex flex-col items-center justify-center min-h-screen px-5">
      {/* 배경 glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative text-center max-w-xs w-full">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl gradient-brand mb-6 shadow-2xl shadow-violet-900/50 border border-white/10">
          <Icon className="w-12 h-12 text-white" strokeWidth={1.5} />
        </div>

        <h1 className="text-2xl font-black gradient-fate-text mb-2">완료!</h1>
        <p className="text-gray-400 text-sm mb-2">{text}</p>
        <p className="text-xs text-gray-600 mb-8">
          이 결과는 매칭 알고리즘에만 사용돼. 상대방에게 공개되지 않아.
        </p>

        <div className="flex flex-col gap-3">
          {saveError && (
            <p className="text-xs text-red-400 text-center">{saveError}</p>
          )}
          <button
            onClick={onConfirm}
            disabled={saving}
            className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '다음'}
          </button>
          <button
            onClick={onRetry}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl glass font-medium text-sm text-gray-400 hover:text-gray-200 border border-white/5 transition-colors"
          >
            다시 해볼게요
          </button>
        </div>
      </div>
    </div>
  )
}
