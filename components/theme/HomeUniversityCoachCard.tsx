'use client'

import UniversityBackdrop from '@/components/theme/UniversityBackdrop'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export function HomeUniversityCoachCard() {
  const { theme } = useUniversityTheme()

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
            친구 초대, 성향 입력, 가능 시간까지 끝나면 먼저 매칭을 열 수 있어요.
          </p>
        </div>
        <UniversityMascot kind="avatar" size="md" className="h-[76px] w-[76px] rounded-[24px]" />
      </div>
    </section>
  )
}
