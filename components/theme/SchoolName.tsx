'use client'

import { useEffect, useState } from 'react'
import {
  SCHOOL_THEME_CHANGE_EVENT,
  getDefaultSchoolTheme,
  readStoredSchoolTheme,
} from '@/lib/school-theme'

function readSelectedSchool() {
  return readStoredSchoolTheme()
}

export default function SchoolName({
  suffix = '',
  full = false,
}: {
  suffix?: string
  full?: boolean
}) {
  const [school, setSchool] = useState(getDefaultSchoolTheme)

  useEffect(() => {
    function syncSchool() {
      setSchool(readSelectedSchool())
    }

    syncSchool()
    window.addEventListener(SCHOOL_THEME_CHANGE_EVENT, syncSchool)
    window.addEventListener('storage', syncSchool)
    return () => {
      window.removeEventListener(SCHOOL_THEME_CHANGE_EVENT, syncSchool)
      window.removeEventListener('storage', syncSchool)
    }
  }, [])

  return <>{full ? school.name : school.shortName}{suffix}</>
}
