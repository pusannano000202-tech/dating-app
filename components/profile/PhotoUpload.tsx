'use client'

import { useRef, useState } from 'react'

export interface PhotoUploadResult {
  publicUrls: string[]
}

interface Props {
  onComplete: (result: PhotoUploadResult) => Promise<void>
  saving?: boolean
}

const MAX_PHOTOS = 3
const MAX_SIZE_MB = 10

interface SlotPhoto {
  file: File
  preview: string
}

export default function PhotoUpload({ onComplete, saving }: Props) {
  const [slots, setSlots] = useState<(SlotPhoto | null)[]>([null, null, null])
  const [error, setError] = useState<string | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  function handleFileChange(idx: number, file: File | null) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 선택 가능해.')
      return
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`사진 용량이 너무 커. (최대 ${MAX_SIZE_MB}MB)`)
      return
    }
    setError(null)
    const preview = URL.createObjectURL(file)
    setSlots((prev) => {
      const next = [...prev]
      next[idx] = { file, preview }
      return next
    })
  }

  function removeSlot(idx: number) {
    setSlots((prev) => {
      if (prev[idx]?.preview) URL.revokeObjectURL(prev[idx]!.preview)
      const next = [...prev]
      next[idx] = null
      return next
    })
  }

  const filledCount = slots.filter(Boolean).length

  async function handleNext() {
    if (filledCount === 0) { setError('사진을 최소 1장 올려줘.'); return }
    setError(null)
    // placeholder 환경에서는 빈 URL 배열로 통과
    const publicUrls = slots
      .filter((s): s is SlotPhoto => s !== null)
      .map((s) => s.preview)
    await onComplete({ publicUrls })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="glass rounded-2xl p-4 border border-violet-500/20">
        <p className="text-xs text-violet-300 font-medium leading-relaxed">
          📸 사진은 매칭 확정 후에만 상대방에게 공개돼. 지금은 AI가 점수만 매겨.
        </p>
      </div>

      {/* 사진 슬롯 3개 */}
      <div className="grid grid-cols-3 gap-3">
        {slots.map((slot, idx) => (
          <div key={idx} className="aspect-[3/4] relative">
            {slot ? (
              <div className="relative w-full h-full rounded-2xl overflow-hidden">
                {/* blob: URL은 next/image 미지원 → 일반 img 사용 */}
                <img
                  src={slot.preview}
                  alt={`사진 ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* 삭제 버튼 */}
                <button
                  type="button"
                  onClick={() => removeSlot(idx)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-xs hover:bg-red-500/80 transition-colors"
                >
                  ✕
                </button>
                {idx === 0 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent py-1.5 text-center">
                    <span className="text-[10px] text-white/80 font-medium">대표 사진</span>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRefs.current[idx]?.click()}
                className={`w-full h-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors ${
                  idx === 0
                    ? 'border-violet-500/50 bg-violet-500/5 hover:border-violet-400/70'
                    : 'border-white/15 bg-white/[0.03] hover:border-white/25'
                }`}
              >
                <span className="text-2xl">{idx === 0 ? '📷' : '+'}</span>
                <span className="text-[10px] text-gray-500">
                  {idx === 0 ? '대표 사진' : `${idx + 1}번째`}
                </span>
              </button>
            )}
            <input
              ref={(el) => { inputRefs.current[idx] = el }}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(idx, e.target.files?.[0] ?? null)}
            />
          </div>
        ))}
      </div>

      {/* 진행 상태 */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-gray-500">{filledCount}/{MAX_PHOTOS}장 선택됨</span>
        <div className="flex gap-1.5">
          {slots.map((s, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${s ? 'bg-violet-500' : 'bg-white/15'}`} />
          ))}
        </div>
      </div>

      {/* 안내 */}
      <div className="flex flex-col gap-2">
        {[
          '얼굴이 잘 보이는 정면 사진을 올려줘',
          '그룹 사진보다 혼자 찍은 사진이 좋아',
          '최대 3장까지 올릴 수 있어',
        ].map((tip) => (
          <div key={tip} className="flex items-start gap-2">
            <span className="text-violet-400 text-xs mt-0.5">•</span>
            <span className="text-xs text-gray-500">{tip}</span>
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 text-center">{error}</p>}

      <button
        onClick={handleNext}
        disabled={saving || filledCount === 0}
        className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {saving ? 'AI 분석 중...' : '다음'}
      </button>
    </div>
  )
}
