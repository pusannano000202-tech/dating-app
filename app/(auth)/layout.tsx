import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '로그인 | 부산대 과팅',
  description: '카카오, Google, 휴대폰으로 로그인',
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
