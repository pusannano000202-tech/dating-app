'use client'

import { useEffect } from 'react'
import type { PreferenceResult } from '@/lib/appearance/preference'

interface Props {
  result: PreferenceResult
  saving?: boolean
  saveError?: string | null
  onConfirm: () => void
  onRetry: () => void
}

function getPublicPreferenceTypes(result: PreferenceResult): {
  primaryType: string
  secondaryType: string | null
} {
  const ranked = Object.entries(result.preferred_bucket_weights)
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)

  return {
    primaryType: ranked[0] ?? '균형형',
    secondaryType: ranked[1] ?? null,
  }
}

export default function IdealWorldcupResult({
  result,
  saving,
  saveError,
  onConfirm,
  onRetry,
}: Props) {
  const { primaryType, secondaryType } = getPublicPreferenceTypes(result)

  // Enter: 확인, R: 다시
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
      <div className="w-full max-w-md flex flex-col items-center">
        <h1 className="text-2xl font-black text-center gradient-fate-text mb-3">
          내 이상형 분석 완료
        </h1>
        <p className="text-sm text-gray-400 text-center mb-8 leading-relaxed">
          {result.meta.total_choices}번의 선택으로 너의 취향을 측정했어.<br />
          매칭에는 더 정밀한 내부 벡터가 함께 반영돼.
        </p>

        <div className="w-full glass-strong rounded-3xl p-5 border border-white/10 mb-8">
          <p className="text-xs text-violet-400 font-bold tracking-widest uppercase mb-2">
            PRIMARY
          </p>
          <p className="text-xl font-black text-white leading-tight">
            당신은 {primaryType}을 가장 좋아하는 편이에요.
          </p>
          {secondaryType && (
            <>
              <p className="mt-5 text-xs text-violet-400 font-bold tracking-widest uppercase">
                SECONDARY
              </p>
              <p className="mt-2 text-sm text-gray-300 leading-relaxed">
                그리고 {secondaryType} 분위기에도 자연스럽게 끌리는 경향이 있어요.
              </p>
            </>
          )}
          <p className="mt-5 text-xs text-gray-600 leading-relaxed">
            세부 점수와 벡터값은 공개하지 않고 매칭 계산에만 사용해요.
          </p>
        </div>

        {saveError && (
          <p className="text-sm text-red-400 text-center mb-3">{saveError}</p>
        )}

        <button
          onClick={onConfirm}
          disabled={saving}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '다음으로'}
        </button>

        <button
          type="button"
          onClick={onRetry}
          disabled={saving}
          className="mt-3 w-full py-3 rounded-2xl glass text-sm text-gray-400 hover:text-gray-200 border border-white/5 transition-colors"
        >
          다시 하기
        </button>
      </div>
    </div>
  )
}
