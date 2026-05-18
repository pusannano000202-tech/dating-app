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

// 사용자 노출 금지 규칙:
// - preferred_appearance_vector raw 값 표시 금지
// - 점수, 백분위, 버킷명 직접 표시 금지
// - 보여줄 수 있는 것은 추상적 한 줄 메시지 + 최종 우승 사진(있다면)
export default function IdealWorldcupResult({
  result,
  saving,
  saveError,
  onConfirm,
  onRetry,
}: Props) {
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
          결과는 매칭 알고리즘 내부에서만 쓰여.
        </p>

        <div className="w-full glass-strong rounded-3xl p-5 border border-white/10 mb-8">
          <p className="text-xs text-violet-400 font-bold tracking-widest uppercase mb-2">
            INTERNAL — 매칭 입력 준비됨
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">
            너가 끌리는 사람들의 공통점을 13~12개의 외모/스타일 축으로 변환했어.
            구체적인 점수나 유형명은 보여주지 않을게 — 매칭이 더 정확해지도록.
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
