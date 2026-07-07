'use client'

import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import { getPublicMascotAssetPath, type UniversityThemeAssetKind } from '@/lib/university-theme'

export default function UniversityMascot({
  kind = 'avatar',
  size = 'md',
  className = '',
}: {
  kind?: UniversityThemeAssetKind
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const { theme } = useUniversityTheme()
  const sizeClass = {
    sm: 'h-12 w-12',
    md: 'h-16 w-16',
    lg: 'h-28 w-28',
    xl: 'h-40 w-40',
  }[size]

  return (
    <div
      className={[
        'pointer-events-none flex shrink-0 items-center justify-center overflow-hidden rounded-[24px] border border-boot-primary/20 bg-white/85 shadow-[var(--boot-card-shadow)]',
        sizeClass,
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      <img
        src={getPublicMascotAssetPath(theme, kind)}
        alt=""
        className="h-full max-h-full w-full max-w-full object-contain p-1 drop-shadow-[0_14px_22px_rgba(var(--boot-primary-rgb),0.18)]"
        loading="lazy"
      />
    </div>
  )
}
