'use client'

import UniversityBackdrop from '@/components/theme/UniversityBackdrop'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import { getUniversityLocalDesignProfile } from '@/lib/university-theme'

export function HomeUniversityCoachCard() {
  const { theme } = useUniversityTheme()
  const localDesign = getUniversityLocalDesignProfile(theme)

  return (
    <section className="relative mb-5 overflow-hidden rounded-[28px] border border-boot-primary/15 bg-white px-4 py-4 shadow-[var(--boot-card-shadow)]">
      <UniversityBackdrop />
      <div className="relative z-10 grid min-h-[104px] grid-cols-[minmax(0,1fr)_76px] items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">
            {theme.shortName} Coach
          </p>
          <h2 className="mt-1 text-xl font-black leading-tight text-boot-ink">
            {theme.shortName} 팀 준비를 같이 맞춰볼게요
          </h2>
          <p className="mt-2 text-sm font-bold leading-5 text-boot-muted">
            {localDesign.primaryPlace} 기준으로 친구 초대, 성향 입력, 가능 시간까지 차분히 맞춰요.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-boot-primary/10 px-3 py-1 text-[11px] font-black text-boot-primary">
              {localDesign.primaryPlace}
            </span>
            <span className="rounded-full border border-boot-primary/15 bg-white/70 px-3 py-1 text-[11px] font-bold text-boot-muted">
              {localDesign.lifeArea}
            </span>
          </div>
        </div>
        <UniversityMascot kind="avatar" size="md" className="h-[76px] w-[76px] rounded-[24px]" />
      </div>
    </section>
  )
}
