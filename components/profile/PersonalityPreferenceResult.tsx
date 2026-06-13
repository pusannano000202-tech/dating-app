'use client'

import { useEffect } from 'react'
import { Brain, CheckCircle2, HeartHandshake, RefreshCcw, type LucideIcon } from 'lucide-react'
import type {
  PersonalityPreferenceProfile,
  PersonalityType,
} from '@/lib/matching/personality-preference'

interface Props {
  profile: PersonalityPreferenceProfile
  onNext: () => void
  onRetry?: () => void
  saving?: boolean
}

const TYPE_INFO: Record<PersonalityType, { label: string; desc: string; Icon: LucideIcon; color: string }> = {
  warm_empathic: {
    label: '다정/공감형',
    desc: '말투와 태도에서 배려가 자연스럽게 느껴지는 사람',
    Icon: HeartHandshake,
    color: 'from-emerald-500 to-teal-500',
  },
  active_social: {
    label: '활동/외향형',
    desc: '대화와 만남의 분위기를 먼저 열어주는 사람',
    Icon: Brain,
    color: 'from-orange-500 to-amber-500',
  },
  calm_stable: {
    label: '차분/안정형',
    desc: '감정선이 안정적이고 편안한 리듬을 주는 사람',
    Icon: CheckCircle2,
    color: 'from-blue-500 to-cyan-500',
  },
  diligent_planned: {
    label: '성실/계획형',
    desc: '약속과 책임감이 분명해서 믿음이 가는 사람',
    Icon: CheckCircle2,
    color: 'from-indigo-500 to-blue-500',
  },
  intellectual_curious: {
    label: '지적/탐구형',
    desc: '취향과 생각이 깊고 새로운 대화가 이어지는 사람',
    Icon: Brain,
    color: 'from-boot-primary to-boot-coral',
  },
  free_individual: {
    label: '자유/개성형',
    desc: '자기 색깔이 있고 서로의 시간을 존중하는 사람',
    Icon: RefreshCcw,
    color: 'from-fuchsia-500 to-pink-500',
  },
  direct_honest: {
    label: '솔직/직진형',
    desc: '빙빙 돌리지 않고 마음과 생각을 분명히 말하는 사람',
    Icon: CheckCircle2,
    color: 'from-rose-500 to-orange-500',
  },
  playful_humorous: {
    label: '유머/장난기형',
    desc: '가볍게 웃고 장난칠 수 있는 즐거운 에너지가 있는 사람',
    Icon: RefreshCcw,
    color: 'from-amber-500 to-pink-500',
  },
}

export default function PersonalityPreferenceResult({ profile, onNext, onRetry, saving }: Props) {
  const primary = TYPE_INFO[profile.primaryType]
  const secondary = profile.secondaryType ? TYPE_INFO[profile.secondaryType] : null
  const relatedTypes = Object.entries(profile.typeWeights)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([type]) => TYPE_INFO[type as PersonalityType].label)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (saving) return
      if (e.key === 'Enter') onNext()
      if ((e.key === 'r' || e.key === 'R') && onRetry) onRetry()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saving, onNext, onRetry])

  return (
    <div className="flex flex-col gap-5">
      <div className="glass-strong rounded-3xl p-6 text-center border border-boot-hairline bg-white/90">
        <p className="text-xs text-boot-primary font-bold tracking-widest uppercase mb-2">끌리는 상대 성격</p>
        <div className={`mx-auto mb-4 w-16 h-16 rounded-2xl bg-gradient-to-br ${primary.color} flex items-center justify-center shadow-lg`}>
          <primary.Icon className="w-8 h-8 text-white" strokeWidth={1.8} />
        </div>
        <h2 className="text-2xl font-black mb-1">{primary.label}</h2>
        <p className="text-sm text-boot-muted leading-relaxed">{primary.desc}</p>
      </div>

      {secondary && (
        <div className="glass rounded-2xl p-4 border border-boot-hairline">
          <p className="text-xs text-boot-muted mb-2">같이 반응하는 분위기</p>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${secondary.color} flex items-center justify-center flex-shrink-0`}>
              <secondary.Icon className="w-5 h-5 text-white" strokeWidth={1.8} />
            </div>
            <div>
              <p className="text-sm font-bold">{secondary.label}</p>
              <p className="text-xs text-boot-muted mt-0.5 leading-relaxed">{secondary.desc}</p>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl p-4 border border-boot-hairline">
        <p className="text-xs text-boot-muted mb-3">상위 성격 분위기</p>
        <div className="flex flex-wrap gap-2">
          {relatedTypes.map((label) => (
            <span key={label} className="px-3 py-2 rounded-xl bg-white/80 border border-boot-hairline text-xs font-bold text-boot-body">
              {label}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-boot-muted text-center">
        상대에게는 자세한 답변이 공개되지 않아.
      </p>

      <button
        onClick={onNext}
        disabled={saving}
        className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-sm disabled:opacity-50"
      >
        {saving ? '저장 중...' : '다음'}
      </button>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={saving}
          className="w-full py-3 rounded-2xl glass text-sm text-boot-body hover:text-boot-primary border border-boot-hairline transition-colors"
        >
          다시 하기
        </button>
      )}
    </div>
  )
}
