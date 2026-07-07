'use client'

import { getUniversityBackdropAssetPath, getUniversityLocalDesignProfile } from '@/lib/university-theme'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export default function UniversityBackdrop({
  className = '',
}: {
  className?: string
}) {
  const { theme } = useUniversityTheme()
  const backdrop = getUniversityBackdropAssetPath(theme)
  const localDesign = getUniversityLocalDesignProfile(theme)

  if (!backdrop) {
    return (
      <div
        aria-hidden="true"
        className={['pointer-events-none absolute inset-0 overflow-hidden', className].join(' ')}
      >
        <div className="absolute inset-0 bg-[var(--boot-hero-gradient)] opacity-25" />
        <div className="absolute inset-x-[-18%] top-5 h-px rotate-[-8deg] bg-boot-primary/10" />
        <div className="absolute inset-x-[-18%] bottom-8 h-px rotate-[7deg] bg-boot-primary/10" />
        <div className="absolute right-4 top-4 max-w-[11rem] text-right text-[10px] font-black uppercase leading-4 tracking-[0.18em] text-boot-primary/10">
          {localDesign.campusPattern}
        </div>
      </div>
    )
  }

  return (
    <div aria-hidden="true" className={['pointer-events-none absolute inset-0 overflow-hidden', className].join(' ')}>
      <img
        src={backdrop}
        alt=""
        className="h-full w-full object-cover opacity-20 blur-[1px] saturate-[1.05]"
        loading="lazy"
      />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.88),rgba(255,255,255,0.72)_42%,rgba(var(--boot-primary-rgb),0.18))]" />
      <div className="absolute right-4 top-4 max-w-[11rem] text-right text-[10px] font-black uppercase leading-4 tracking-[0.18em] text-boot-primary/10">
        {localDesign.campusPattern}
      </div>
    </div>
  )
}
