'use client'

import { useMemo, useState } from 'react'
import {
  Dumbbell,
  MessageCircle,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import PreferenceRecipePreview from '@/components/profile/PreferenceRecipePreview'
import type { PreferenceWeights } from '@/lib/types'

type PreferenceKey = keyof PreferenceWeights
type PreferencePercents = Record<PreferenceKey, number>

const ACTIVE_ITEMS: {
  key: PreferenceKey
  label: string
  Icon: LucideIcon
  iconBg: string
  desc: string
  helpText: string
}[] = [
  {
    key: 'appearance',
    label: '외모',
    Icon: Sparkles,
    iconBg: 'from-rose-500 to-orange-400',
    desc: '사진/외모 취향을 얼마나 볼지',
    helpText: '상대 그룹의 외모 분위기가 내 취향과 얼마나 맞는지를 보는 비중이에요.',
  },
  {
    key: 'personality',
    label: '성격',
    Icon: MessageCircle,
    iconBg: 'from-violet-600 to-fuchsia-500',
    desc: '대화 스타일과 성향 궁합',
    helpText: '성향 질문 결과와 대화 방식이 잘 맞는지를 더 강하게 반영해요.',
  },
  {
    key: 'height',
    label: '키',
    Icon: Ruler,
    iconBg: 'from-sky-500 to-cyan-400',
    desc: '키 차이 선호',
    helpText: '내가 선호하는 키 차이나 키 범위가 중요한 편이면 높게 두면 돼요.',
  },
  {
    key: 'body_type',
    label: '체형',
    Icon: Dumbbell,
    iconBg: 'from-amber-500 to-orange-500',
    desc: '체형 취향',
    helpText: '상대의 체형 분위기가 취향과 맞는지를 매칭 계산에 더 반영해요.',
  },
]

const ACTIVE_KEYS = ACTIVE_ITEMS.map((item) => item.key)

const DEFAULT_WEIGHTS: PreferenceWeights = {
  appearance: 0.35,
  personality: 0.35,
  height: 0.15,
  body_type: 0.15,
}

interface PreferenceWeightInputsProps {
  initialValue?: PreferenceWeights
  onChange: (weights: PreferenceWeights) => void
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

function toPercents(weights: PreferenceWeights): PreferencePercents {
  return ACTIVE_KEYS.reduce((acc, key) => {
    acc[key] = clampPercent(weights[key] * 100)
    return acc
  }, {} as PreferencePercents)
}

function normalizeVisibleWeights(weights: PreferenceWeights): PreferenceWeights {
  const activeTotal = ACTIVE_KEYS.reduce((sum, key) => sum + weights[key], 0)
  if (activeTotal <= 0) return DEFAULT_WEIGHTS

  let remaining = 100
  const normalized = { ...DEFAULT_WEIGHTS }

  ACTIVE_KEYS.forEach((key, index) => {
    if (index === ACTIVE_KEYS.length - 1) {
      normalized[key] = remaining / 100
      return
    }

    const percent = clampPercent((weights[key] / activeTotal) * 100)
    normalized[key] = percent / 100
    remaining -= percent
  })
  return normalized
}

function toWeights(percents: PreferencePercents): PreferenceWeights {
  return ACTIVE_KEYS.reduce((acc, key) => {
    acc[key] = Math.round(percents[key]) / 100
    return acc
  }, {} as PreferenceWeights)
}

export default function PreferenceWeightInputs({ initialValue, onChange }: PreferenceWeightInputsProps) {
  const [percents, setPercents] = useState<PreferencePercents>(() => toPercents(normalizeVisibleWeights(initialValue ?? DEFAULT_WEIGHTS)))

  const total = useMemo(
    () => ACTIVE_KEYS.reduce((sum, key) => sum + percents[key], 0),
    [percents]
  )
  const diff = 100 - total

  function commit(next: PreferencePercents) {
    setPercents(next)
    onChange(toWeights(next))
  }

  function updatePercent(key: PreferenceKey, value: number) {
    commit({ ...percents, [key]: clampPercent(value) })
  }

  function adjustPercent(key: PreferenceKey, delta: number) {
    updatePercent(key, percents[key] + delta)
  }

  function resetDefaults() {
    const next = toPercents(DEFAULT_WEIGHTS)
    commit(next)
  }

  return (
    <div className="flex flex-col gap-4">
      <PreferenceRecipePreview percents={percents} />

      <section className={`sticky top-3 z-20 rounded-3xl border px-4 py-3 shadow-sm backdrop-blur-xl ${
        total === 100
          ? 'border-emerald-500/20 bg-emerald-50/90'
          : total > 100
            ? 'border-rose-500/20 bg-rose-50/90'
            : 'border-amber-500/20 bg-amber-50/90'
      }`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-boot-muted">현재 합계</p>
            <p className="text-sm font-bold text-boot-ink">
              {total === 100 && '100% 맞음. 저장 가능해요.'}
              {total < 100 && `${diff}% 더 넣어야 저장할 수 있어요.`}
              {total > 100 && `${Math.abs(diff)}% 줄여야 저장할 수 있어요.`}
            </p>
          </div>
          <p className={`text-2xl font-black tabular-nums ${
            total === 100 ? 'text-emerald-600' : total > 100 ? 'text-rose-600' : 'text-amber-600'
          }`}>
            {total}%
          </p>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-boot-muted">
          숫자는 자동으로 조정되지 않아요. 원하는 항목만 직접 바꾸고, 네 항목 합계만 100%로 맞추면 됩니다.
        </p>
        <button
          type="button"
          onClick={resetDefaults}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-2xl border border-boot-hairline bg-white/80 px-3 text-xs font-bold text-boot-body transition-colors hover:border-boot-primary/30 hover:text-boot-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          기본값
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {ACTIVE_ITEMS.map(({ key, label, Icon, iconBg, desc, helpText }) => {
          const pct = percents[key]
          return (
            <section key={key} className="glass-card rounded-3xl border border-boot-hairline p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${iconBg} shadow-sm`}>
                  <Icon className="h-5 w-5 text-white" strokeWidth={1.9} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-black text-boot-ink">{label}</h3>
                      <p className="mt-0.5 text-xs font-semibold text-boot-muted">{desc}</p>
                    </div>
                    <span className="rounded-full bg-boot-soft px-2.5 py-1 text-xs font-black tabular-nums text-boot-primary">
                      {pct}%
                    </span>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-boot-muted">{helpText}</p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-[44px_1fr_44px] items-center gap-2">
                <button
                  type="button"
                  onClick={() => adjustPercent(key, -5)}
                  aria-label={`${label} 가중치 5% 줄이기`}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-boot-hairline bg-white/80 text-boot-body transition-colors hover:border-boot-primary/30 hover:text-boot-primary disabled:opacity-40"
                  disabled={pct === 0}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <label className="flex h-12 min-w-0 items-center rounded-2xl border border-boot-hairline bg-white/90 px-4 focus-within:border-boot-primary/50">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    value={pct}
                    onChange={(event) => updatePercent(key, Number(event.target.value))}
                    aria-label={`${label} 가중치`}
                    className="min-w-0 flex-1 bg-transparent text-center text-lg font-black tabular-nums text-boot-ink outline-none"
                  />
                  <span className="text-sm font-bold text-boot-muted">%</span>
                </label>
                <button
                  type="button"
                  onClick={() => adjustPercent(key, 5)}
                  aria-label={`${label} 가중치 5% 늘리기`}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-boot-hairline bg-white/80 text-boot-body transition-colors hover:border-boot-primary/30 hover:text-boot-primary disabled:opacity-40"
                  disabled={pct === 100}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
