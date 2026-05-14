import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '그룹 과팅 | 부산대 과팅',
  description: '친구들과 팀을 만들고 과팅을 신청해봐',
}

export default function GroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
