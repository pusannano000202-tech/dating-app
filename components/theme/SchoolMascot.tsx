'use client'

import { useEffect, useState } from 'react'
import {
  SCHOOL_THEME_CHANGE_EVENT,
  getDefaultSchoolTheme,
  readStoredSchoolTheme,
} from '@/lib/school-theme'

type MascotPose = 'welcome' | 'guide' | 'waiting' | 'support' | 'confirm' | 'refund' | 'avatar'

const assetRoot = '/university-mascots/app-assets-v3-normalized-v2'

function readSelectedSchool() {
  return readStoredSchoolTheme()
}

export default function SchoolMascot({
  pose = 'avatar',
  size = 'md',
  className = '',
  label,
}: {
  pose?: MascotPose
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  label?: string
}) {
  const [school, setSchool] = useState(getDefaultSchoolTheme)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    function syncSchool() {
      setSchool(readSelectedSchool())
      setMissing(false)
    }

    syncSchool()
    window.addEventListener(SCHOOL_THEME_CHANGE_EVENT, syncSchool)
    window.addEventListener('storage', syncSchool)
    return () => {
      window.removeEventListener(SCHOOL_THEME_CHANGE_EVENT, syncSchool)
      window.removeEventListener('storage', syncSchool)
    }
  }, [])

  const sizeClass = {
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-32',
    xl: 'h-40 w-40',
  }[size]
  const assetId = missing ? 'pnu' : school.id
  const src = `${assetRoot}/${assetId}/${pose}.png`

  return (
    <div
      className={[
        'pointer-events-none flex shrink-0 items-center justify-center overflow-hidden rounded-[28px] bg-white/70',
        sizeClass,
        className,
      ].join(' ')}
      aria-label={label ?? `${school.shortName} 마스코트`}
    >
      <img
        src={src}
        alt=""
        className="h-full w-full object-contain drop-shadow-[0_16px_24px_rgba(var(--boot-primary-rgb),0.22)]"
        onError={() => setMissing(true)}
      />
    </div>
  )
}
