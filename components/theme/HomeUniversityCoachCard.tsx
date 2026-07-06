'use client'

import MascotCoachCard from '@/components/theme/MascotCoachCard'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export function HomeUniversityCoachCard() {
  const { theme } = useUniversityTheme()

  return (
    <MascotCoachCard
      className="mb-5"
      kind="guide"
      eyebrow={`${theme.shortName} Coach`}
      title={`${theme.shortName} 팀 준비를 같이 맞춰볼게요`}
      body={`친구 초대, 성향 입력, 가능 시간까지 끝나면 ${theme.shortName} 기준으로 먼저 매칭을 열 수 있어요.`}
    />
  )
}
