import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import AppBottomNav from '@/components/navigation/AppBottomNav'
import UniversityThemeProvider from '@/components/theme/UniversityThemeProvider'
import { UNIVERSITY_THEME_COOKIE_NAME } from '@/lib/university-theme'

export const dynamic = 'force-dynamic'

export default function AppTemplate({ children }: { children: ReactNode }) {
  const initialThemeId = cookies().get(UNIVERSITY_THEME_COOKIE_NAME)?.value

  return (
    <UniversityThemeProvider initialThemeId={initialThemeId}>
      {children}
      <AppBottomNav />
    </UniversityThemeProvider>
  )
}
