import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '로그인 | 부산대 과팅',
  description: '휴대폰 번호로 10초 가입',
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
