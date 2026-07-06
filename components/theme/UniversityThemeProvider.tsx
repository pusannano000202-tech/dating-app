'use client'

import type { CSSProperties, ReactNode } from 'react'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { DEV_BASIC_PROFILE_STORAGE_KEY } from '@/lib/profile/dev-basic-profile'
import { createClient } from '@/lib/supabase'
import {
  UNIVERSITY_THEME_CHANGE_EVENT,
  UNIVERSITY_THEME_COOKIE_NAME,
  UNIVERSITY_THEME_STORAGE_KEY,
  buildUniversityThemeCssVariables,
  findUniversityThemeBySchool,
  getDefaultUniversityTheme,
  getUniversityThemeById,
  storeUniversityThemeId,
  type UniversityTheme,
  type UniversityThemeCssVariables,
} from '@/lib/university-theme'
import { isSupabaseConfigured } from '@/lib/utils'

type UniversityThemeContextValue = {
  theme: UniversityTheme
}

type UniversityThemeProviderProps = {
  children: ReactNode
  initialThemeId?: string | null
}

const UniversityThemeContext = createContext<UniversityThemeContextValue>({
  theme: getDefaultUniversityTheme(),
})

export function useUniversityTheme(): UniversityThemeContextValue {
  return useContext(UniversityThemeContext)
}

export default function UniversityThemeProvider({
  children,
  initialThemeId,
}: UniversityThemeProviderProps) {
  const [theme, setTheme] = useState<UniversityTheme>(() => getUniversityThemeById(initialThemeId))
  const style = useMemo(
    () => buildUniversityThemeCssVariables(theme) as CSSProperties & UniversityThemeCssVariables,
    [theme],
  )

  useLayoutEffect(() => {
    let mounted = true
    function syncTheme() {
      setTheme(readBrowserTheme(initialThemeId))
    }

    syncTheme()
    void syncThemeFromProfileSchool((nextTheme) => {
      if (mounted) setTheme(nextTheme)
    })

    window.addEventListener(UNIVERSITY_THEME_CHANGE_EVENT, syncTheme)
    window.addEventListener('storage', syncTheme)
    return () => {
      mounted = false
      window.removeEventListener(UNIVERSITY_THEME_CHANGE_EVENT, syncTheme)
      window.removeEventListener('storage', syncTheme)
    }
  }, [initialThemeId])

  useEffect(() => {
    document.documentElement.dataset.universityTheme = theme.id
    for (const [name, value] of Object.entries(style)) {
      if (typeof value === 'string') {
        document.documentElement.style.setProperty(name, value)
      }
    }
    document.documentElement.style.setProperty('color-scheme', 'light')
  }, [style, theme.id])

  return (
    <UniversityThemeContext.Provider value={{ theme }}>
      <div
        data-university-theme={theme.id}
        data-university-name={theme.shortName}
        className="min-h-screen bg-app text-boot-ink"
        style={style}
      >
        {children}
      </div>
    </UniversityThemeContext.Provider>
  )
}

function readBrowserTheme(initialThemeId?: string | null): UniversityTheme {
  if (typeof window === 'undefined') return getUniversityThemeById(initialThemeId)

  const storedId = readStorageValue(() => window.localStorage.getItem(UNIVERSITY_THEME_STORAGE_KEY))
  if (storedId) return getUniversityThemeById(storedId)

  const cookieId = readThemeIdFromCookie()
  if (cookieId) return getUniversityThemeById(cookieId)

  const savedProfile = readStorageValue(() => window.sessionStorage.getItem(DEV_BASIC_PROFILE_STORAGE_KEY))
  if (!savedProfile) return getUniversityThemeById(initialThemeId)

  try {
    const profile = JSON.parse(savedProfile) as { school?: unknown }
    return findUniversityThemeBySchool(typeof profile.school === 'string' ? profile.school : null)
  } catch {
    return getUniversityThemeById(initialThemeId)
  }
}

async function syncThemeFromProfileSchool(onTheme: (theme: UniversityTheme) => void) {
  if (!isSupabaseConfigured()) return

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('school')
      .eq('user_id', user.id)
      .maybeSingle()

    if (typeof data?.school !== 'string') return

    const theme = findUniversityThemeBySchool(data.school)
    storeUniversityThemeId(theme.id)
    onTheme(theme)
  } catch {
    // Local preview and partially configured auth should keep the stored/default theme.
  }
}

function readStorageValue(read: () => string | null): string | null {
  try {
    return read()
  } catch {
    return null
  }
}

function readThemeIdFromCookie(): string | null {
  const cookieText = readStorageValue(() => window.document.cookie)
  if (!cookieText) return null

  const cookie = cookieText
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${UNIVERSITY_THEME_COOKIE_NAME}=`))

  if (!cookie) return null
  return decodeURIComponent(cookie.slice(UNIVERSITY_THEME_COOKIE_NAME.length + 1))
}
