'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  SCHOOL_THEME_CHANGE_EVENT,
  applySchoolThemeToDocument,
  readStoredSchoolTheme,
} from '@/lib/school-theme'

export default function SchoolThemeProvider() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const searchKey = searchParams.toString()

  useEffect(() => {
    const applyStoredTheme = () => applySchoolThemeToDocument(readStoredSchoolTheme())
    applyStoredTheme()

    window.addEventListener(SCHOOL_THEME_CHANGE_EVENT, applyStoredTheme)
    window.addEventListener('storage', applyStoredTheme)
    return () => {
      window.removeEventListener(SCHOOL_THEME_CHANGE_EVENT, applyStoredTheme)
      window.removeEventListener('storage', applyStoredTheme)
    }
  }, [pathname, searchKey])

  return null
}
