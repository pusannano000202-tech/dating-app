'use client'

import { ArrowLeft, BarChart3, Minus, Plus } from 'lucide-react'

import { MBTI_TYPES, type MbtiType, type PartnerMbtiType } from '@/lib/community/mbti/types'

import MbtiJourneyProgress from './MbtiJourneyProgress'

interface MbtiExperienceEditorProps {
  counts: Partial<Record<PartnerMbtiType, number>>
  onIncrement: (type: PartnerMbtiType) => void
  onDecrement: (type: PartnerMbtiType) => void
  onBack: () => void
  onReview: () => void
  onNoExperience: () => void
  onStats: () => void
}

export default function MbtiExperienceEditor({
  counts,
  onIncrement,
  onDecrement,
  onBack,
  onReview,
  onNoExperience,
  onStats,
}: MbtiExperienceEditorProps) {
  const selected = [...MBTI_TYPES, 'UNKNOWN' as const]
    .filter((type) => (counts[type] ?? 0) > 0)
  const total = selected.reduce((sum, type) => sum + (counts[type] ?? 0), 0)

  return (
    <section className="mx-auto w-full max-w-3xl px-4 pb-24 pt-2 sm:px-6 sm:pt-6">
      <header className="grid min-h-11 grid-cols-[44px_1fr_auto] items-center gap-2">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full text-boot-ink hover:bg-boot-soft" aria-label="내 MBTI 선택으로 돌아가기">
          <ArrowLeft aria-hidden="true" />
        </button>
        <h1 className="truncate text-center text-lg font-black tracking-[-0.03em] text-boot-ink">내 연애 경험</h1>
        <button type="button" onClick={onStats} className="min-h-11 rounded-full px-3 text-sm font-extrabold text-boot-primary">
          통계 먼저 보기
        </button>
      </header>
      <MbtiJourneyProgress active={2} />

      <div className="mt-3">
        <span className="inline-flex rounded-full bg-boot-soft px-3 py-1 text-[11px] font-black text-boot-primary">선택 참여</span>
        <h2 className="mt-3 text-3xl font-black leading-[1.08] tracking-[-0.04em] text-boot-ink sm:text-4xl">
          <span className="text-boot-primary">유형을 누르고,</span><br />경험을 더해요.
        </h2>
        <p className="mt-2 text-sm font-bold text-boot-body">같은 유형을 여러 번 눌러도 돼요.</p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 sm:mt-6 sm:gap-3" aria-label="상대 MBTI 경험 횟수 선택">
        {MBTI_TYPES.map((type) => {
          const count = counts[type] ?? 0
          return (
            <button
              key={type}
              type="button"
              onClick={() => onIncrement(type)}
              className={`relative h-[54px] rounded-xl border text-sm font-black outline-none transition focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2 sm:h-[68px] sm:rounded-2xl sm:text-base ${count > 0 ? 'border-boot-primary bg-boot-soft text-boot-primary shadow-[0_8px_20px_rgba(var(--boot-primary-rgb),0.12)]' : 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary/50'}`}
              aria-label={`${type} 경험 1회 추가`}
              aria-pressed={count > 0}
            >
              {type}
              {count > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-boot-primary px-1 text-xs text-white">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="mt-5 border-t border-boot-hairline pt-3">
        <h2 className="text-base font-black">선택한 경험 <span className="text-boot-primary">{total}회</span></h2>
        {selected.length === 0 ? (
          <p className="mt-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-boot-muted">유형을 누르면 여기에서 횟수를 조정할 수 있어요.</p>
        ) : (
          <ul className="mt-2 divide-y divide-boot-hairline border-y border-boot-hairline">
            {selected.map((type) => (
              <li key={type} className="flex min-h-[62px] items-center gap-3 py-2">
                <span className="flex h-11 min-w-14 items-center justify-center rounded-xl bg-boot-soft px-2 text-sm font-black text-boot-primary">{type === 'UNKNOWN' ? '모름' : type}</span>
                <span className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={() => onDecrement(type)} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline bg-white outline-none focus-visible:ring-2 focus-visible:ring-boot-primary" aria-label={`${type} 경험 1회 줄이기`}><Minus size={19} /></button>
                  <strong className="w-8 text-center text-xl">{counts[type]}</strong>
                  <button type="button" onClick={() => onIncrement(type)} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline bg-white text-boot-primary outline-none focus-visible:ring-2 focus-visible:ring-boot-primary" aria-label={`${type} 경험 1회 추가`}><Plus size={19} /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="sticky bottom-[72px] z-20 mt-4 bg-boot-canvas/95 py-2 backdrop-blur-sm">
        <button type="button" onClick={onReview} disabled={total === 0} className="min-h-14 w-full rounded-2xl bg-boot-primary px-5 text-base font-black text-white shadow-[0_12px_28px_rgba(var(--boot-primary-rgb),0.2)] disabled:cursor-not-allowed disabled:opacity-40">
          선택한 경험 검토하기
        </button>
      </div>

      <button type="button" onClick={onStats} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-boot-primary bg-white text-sm font-black text-boot-primary">
        <BarChart3 size={18} /> 통계 먼저 보기
      </button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onIncrement('UNKNOWN')} aria-pressed={(counts.UNKNOWN ?? 0) > 0} className={`min-h-11 rounded-xl border px-2 text-xs font-black outline-none focus-visible:ring-2 focus-visible:ring-boot-primary ${counts.UNKNOWN ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-body'}`} aria-label="모르는 상대 MBTI 경험 1회 추가">
          상대 유형을 잘 모르겠어요{counts.UNKNOWN ? ` · ${counts.UNKNOWN}회` : ''}
        </button>
        <button type="button" onClick={onNoExperience} className="min-h-11 rounded-xl border border-boot-primary bg-white px-2 text-xs font-black text-boot-primary">
          연애 경험 없음
        </button>
      </div>
    </section>
  )
}
