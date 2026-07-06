'use client'

import UniversityBackdrop from '@/components/theme/UniversityBackdrop'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import type { UniversityThemeAssetKind } from '@/lib/university-theme'

export default function MascotCoachCard({
  kind,
  eyebrow,
  title,
  body,
  className = '',
}: {
  kind: UniversityThemeAssetKind
  eyebrow?: string
  title: string
  body: string
  className?: string
}) {
  const { theme } = useUniversityTheme()

  return (
    <section
      className={[
        'relative overflow-hidden rounded-[32px] border border-boot-primary/20 bg-white px-5 py-5 shadow-[var(--boot-card-shadow)]',
        className,
      ].join(' ')}
    >
      <UniversityBackdrop />
      <div className="relative z-10 grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
            {eyebrow ?? `${theme.shortName} Coach`}
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{body}</p>
        </div>
        <div className="flex min-h-[156px] items-center justify-center rounded-[30px] border border-white/80 bg-white/70 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)] backdrop-blur">
          <UniversityMascot
            kind={kind}
            size="xl"
            className="h-36 w-36 rounded-[28px] border-0 bg-transparent shadow-none sm:h-40 sm:w-40"
          />
        </div>
      </div>
    </section>
  )
}
