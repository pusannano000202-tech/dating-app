'use client'

import { useEffect } from 'react'
import { Palette, ClipboardCheck, Zap, Heart, Waves, type LucideIcon } from 'lucide-react'
import type { Big5Scores } from './Big5Survey'

interface Props {
  scores: Big5Scores
  onNext: () => void
  onRetry?: () => void
  saving?: boolean
}

const TRAITS = [
  {
    key: 'openness' as keyof Big5Scores,
    label: '개방성',
    Icon: Palette,
    iconBg: 'from-boot-primary to-boot-coral',
    color: '#ff5a6f',
    low: '안정적이고 익숙한 것을 선호해',
    high: '새로운 경험과 창의성을 즐겨',
  },
  {
    key: 'conscientiousness' as keyof Big5Scores,
    label: '성실성',
    Icon: ClipboardCheck,
    iconBg: 'from-sky-500 to-cyan-400',
    color: '#0ea5e9',
    low: '자유롭고 유연한 편이야',
    high: '계획적이고 책임감이 강해',
  },
  {
    key: 'extraversion' as keyof Big5Scores,
    label: '외향성',
    Icon: Zap,
    iconBg: 'from-orange-500 to-amber-500',
    color: '#ea580c',
    low: '혼자만의 시간을 소중히 여겨',
    high: '사람들과 어울릴 때 에너지가 넘쳐',
  },
  {
    key: 'agreeableness' as keyof Big5Scores,
    label: '친화성',
    Icon: Heart,
    iconBg: 'from-emerald-500 to-teal-400',
    color: '#059669',
    low: '독립적이고 솔직한 편이야',
    high: '배려심이 깊고 협력을 잘해',
  },
  {
    key: 'neuroticism' as keyof Big5Scores,
    label: '감수성',
    Icon: Waves,
    iconBg: 'from-rose-600 to-pink-600',
    color: '#e11d48',
    low: '감정이 안정적이고 여유로워',
    high: '감수성이 풍부하고 섬세해',
  },
]

function getPersonalityTag(scores: Big5Scores): { tag: string; desc: string } {
  const { openness: o, conscientiousness: c, extraversion: e, agreeableness: a } = scores
  if (e > 0.6 && a > 0.6) return { tag: '파티 플래너형', desc: '어디서든 분위기 메이커!' }
  if (o > 0.6 && c > 0.6) return { tag: '완벽주의 크리에이터형', desc: '창의적이면서 꼼꼼해' }
  if (e < 0.4 && o > 0.6) return { tag: '감성 인트로버트형', desc: '혼자지만 깊이 있어' }
  if (c > 0.6 && a > 0.6) return { tag: '든든한 리더형', desc: '믿음직하고 따뜻해' }
  if (e > 0.6 && o > 0.6) return { tag: '자유로운 탐험가형', desc: '새로운 게 좋아!' }
  if (a > 0.7) return { tag: '공감능력 MAX형', desc: '상대방 마음을 잘 읽어' }
  return { tag: '균형잡힌 현실주의형', desc: '상황에 맞게 유연하게 대처해' }
}

export default function Big5Result({ scores, onNext, onRetry, saving }: Props) {
  const { tag, desc } = getPersonalityTag(scores)

  // Enter: 다음, R: 다시하기
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
      {/* 성격 유형 카드 */}
      <div className="glass-strong rounded-3xl p-6 text-center border border-boot-hairline bg-white/90">
        <p className="text-xs text-boot-primary font-bold tracking-widest uppercase mb-2">나의 성격 유형</p>
        <h2 className="text-2xl font-black mb-1">{tag}</h2>
        <p className="text-sm text-boot-muted">{desc}</p>
      </div>

      {/* 5개 트레이트 바 */}
      <div className="flex flex-col gap-3">
        {TRAITS.map((t) => {
          const pct = Math.round(scores[t.key] * 100)
          return (
            <div key={t.key} className="glass rounded-2xl p-4 border border-boot-hairline">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${t.iconBg} flex items-center justify-center flex-shrink-0`}>
                    <t.Icon className="w-4 h-4 text-white" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-bold">{t.label}</span>
                </div>
                <span className="text-sm font-black tabular-nums" style={{ color: t.color }}>
                  {pct}%
                </span>
              </div>
              <div className="w-full bg-boot-hairline rounded-full h-1.5 mb-2">
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${pct}%`, backgroundColor: t.color }}
                />
              </div>
              <p className="text-[11px] text-boot-muted">
                {pct >= 50 ? t.high : t.low}
              </p>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-boot-muted text-center">
        이 결과는 매칭 참고용이야. 상대방에게 공개되지 않아.
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
