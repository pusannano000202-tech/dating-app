'use client'

import UniversityBackdrop from '@/components/theme/UniversityBackdrop'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import { getUniversityLocalDesignProfile, type UniversityThemeAssetKind } from '@/lib/university-theme'

export default function MascotCoachCard({
  kind,
  eyebrow,
  title,
  body,
  className = '',
  mascotSize = 'xl',
  placeChips,
}: {
  kind: UniversityThemeAssetKind
  eyebrow?: string
  title: string
  body: string
  className?: string
  mascotSize?: 'lg' | 'xl'
  placeChips?: string[]
}) {
  const { theme } = useUniversityTheme()
  const localDesign = getUniversityLocalDesignProfile(theme)
  const visiblePlaceChips = (placeChips ?? localDesign.matchChips).slice(0, 2)
  const isLargeMascot = mascotSize === 'xl'
  const gridClass = isLargeMascot
    ? 'grid-cols-[minmax(0,1fr)_9rem] sm:grid-cols-[minmax(0,1fr)_10rem]'
    : 'grid-cols-[minmax(0,1fr)_7.5rem] sm:grid-cols-[minmax(0,1fr)_8rem]'
  const mediaSlotClass = isLargeMascot ? 'min-h-[156px]' : 'min-h-[104px]'
  const mascotClass = isLargeMascot
    ? 'h-36 w-36 rounded-[28px] border-0 bg-transparent shadow-none sm:h-40 sm:w-40'
    : '!h-24 !w-24 rounded-[24px] border-0 bg-transparent shadow-none'

  return (
    <section
      className={[
        'relative overflow-hidden rounded-[32px] border border-boot-primary/20 bg-white px-5 py-5 shadow-[var(--boot-card-shadow)]',
        className,
      ].join(' ')}
    >
      <UniversityBackdrop />
      <div className={['relative z-10 grid items-center gap-3', gridClass].join(' ')}>
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
            {eyebrow ?? `${theme.shortName} Coach`}
          </p>
          <h2 className="mt-2 text-xl font-black leading-tight text-boot-ink sm:text-2xl">{title}</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{body}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {visiblePlaceChips.map((chip) => (
              <span
                key={chip}
                className="rounded-full border border-boot-primary/15 bg-white/75 px-3 py-1 text-[11px] font-black text-boot-primary"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
        <div
          className={[
            'flex items-center justify-center rounded-[30px] border border-white/80 bg-white/70 p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)] backdrop-blur',
            mediaSlotClass,
          ].join(' ')}
        >
          <UniversityMascot
            kind={kind}
            size={mascotSize}
            className={mascotClass}
          />
        </div>
      </div>
    </section>
  )
}
