'use client'

import { getUniversityBackdropAssetPath } from '@/lib/university-theme'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export default function UniversityBackdrop({
  className = '',
}: {
  className?: string
}) {
  const { theme } = useUniversityTheme()
  const backdrop = getUniversityBackdropAssetPath(theme)

  if (!backdrop) {
    return (
      <div
        aria-hidden="true"
        className={[
          'pointer-events-none absolute inset-0 bg-[var(--boot-hero-gradient)] opacity-30',
          className,
        ].join(' ')}
      />
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
    </div>
  )
}
