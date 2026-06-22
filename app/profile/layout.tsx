import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import StepProgress from '@/components/profile/StepProgress'

export const metadata: Metadata = {
  title: '프로필 설정 | 부팅',
  description: '매칭에 필요한 프로필 정보를 입력해봐',
}

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen booting-paper text-boot-ink">
      <StepProgress />
      {children}
    </div>
  )
}
