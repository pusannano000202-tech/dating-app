import type { PreferenceWeights } from '@/lib/types'

type PreferenceKey = keyof PreferenceWeights
type PreferencePercents = Record<PreferenceKey, number>

const ACTIVE_KEYS = ['appearance', 'personality', 'height', 'body_type'] as const satisfies PreferenceKey[]

const VISUAL_META: Record<(typeof ACTIVE_KEYS)[number], { label: string; color: string; soft: string }> = {
  appearance: { label: '외모', color: '#ff5a6f', soft: 'rgba(255, 90, 111, 0.22)' },
  personality: { label: '성격', color: '#7c3aed', soft: 'rgba(124, 58, 237, 0.20)' },
  height: { label: '키', color: '#0ea5e9', soft: 'rgba(14, 165, 233, 0.18)' },
  body_type: { label: '체형', color: '#f97316', soft: 'rgba(249, 115, 22, 0.18)' },
}

interface PreferenceRecipePreviewProps {
  percents: PreferencePercents
}

export default function PreferenceRecipePreview({ percents }: PreferenceRecipePreviewProps) {
  const total = ACTIVE_KEYS.reduce((sum, key) => sum + percents[key], 0)
  const topItems = [...ACTIVE_KEYS]
    .sort((a, b) => percents[b] - percents[a])
    .slice(0, 3)

  let offset = 0
  const segments = ACTIVE_KEYS.map((key) => {
    const value = Math.max(0, percents[key])
    const width = total > 0 ? (value / Math.max(total, 100)) * 100 : 0
    const segment = { key, value, width, left: offset }
    offset += width
    return segment
  })

  return (
    <section className="glass-card rounded-3xl border border-boot-hairline p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">Matching Recipe</p>
          <h2 className="mt-1 text-lg font-black text-boot-ink">내가 원하는 만남의 비율</h2>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-black ${total === 100 ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-600'}`}>
          {total}%
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[28px] border border-boot-hairline bg-[#fff8f8] p-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(255,90,111,0.18),transparent_28%),radial-gradient(circle_at_80%_15%,rgba(14,165,233,0.13),transparent_27%),radial-gradient(circle_at_55%_90%,rgba(249,115,22,0.13),transparent_30%)]" />
        <svg
          className="relative z-10 h-44 w-full"
          viewBox="0 0 320 176"
          role="img"
          aria-label="현재 가중치가 섞여 있는 추상 시각화"
        >
          <defs>
            <filter id="recipeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="8" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M38 118 C82 42, 118 42, 160 116 S240 192, 282 78" fill="none" stroke="rgba(31,41,55,0.10)" strokeWidth="18" strokeLinecap="round" />
          <path d="M54 122 C92 72, 126 78, 160 112 S226 150, 266 88" fill="none" stroke="rgba(255,90,111,0.16)" strokeWidth="7" strokeLinecap="round" />
          <circle cx="160" cy="92" r="54" fill="rgba(255,255,255,0.70)" stroke="rgba(255,90,111,0.20)" />
          <circle cx="160" cy="92" r="36" fill="rgba(255,255,255,0.52)" stroke="rgba(124,58,237,0.14)" />
          {ACTIVE_KEYS.map((key, index) => {
            const angle = (-110 + index * 73) * (Math.PI / 180)
            const radius = 44 + percents[key] * 0.62
            const cx = 160 + Math.cos(angle) * radius
            const cy = 92 + Math.sin(angle) * radius * 0.64
            const bubble = 8 + percents[key] * 0.3
            return (
              <g key={key} filter="url(#recipeGlow)">
                <line x1="160" y1="92" x2={cx} y2={cy} stroke={VISUAL_META[key].soft} strokeWidth="2" />
                <circle cx={cx} cy={cy} r={bubble} fill={VISUAL_META[key].soft} />
                <circle cx={cx} cy={cy} r={Math.max(4, bubble * 0.48)} fill={VISUAL_META[key].color} opacity="0.9" />
              </g>
            )
          })}
          <circle cx="160" cy="92" r="17" fill="rgba(17,24,39,0.76)" />
          <circle cx="160" cy="92" r="7" fill="#ffffff" opacity="0.85" />
        </svg>

        <div className="relative z-10 mt-3 h-3 overflow-hidden rounded-full bg-white/70 shadow-inner">
          {segments.map(({ key, width, left }) => (
            <span
              key={key}
              className="absolute top-0 h-full"
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: VISUAL_META[key].color }}
            />
          ))}
        </div>

        <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
          {topItems.map((key) => (
            <div key={key} className="rounded-2xl border border-white/70 bg-white/75 px-3 py-2 shadow-sm">
              <div className="mb-1 h-2 w-2 rounded-full" style={{ backgroundColor: VISUAL_META[key].color }} />
              <p className="truncate text-xs font-black text-boot-ink">{VISUAL_META[key].label}</p>
              <p className="text-sm font-black tabular-nums text-boot-primary">{percents[key]}%</p>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-boot-muted">
        지금은 실제 프로필에서 판단 가능한 외모, 성격, 키, 체형만 받습니다.
      </p>
    </section>
  )
}
