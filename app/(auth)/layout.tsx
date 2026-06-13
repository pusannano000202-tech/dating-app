import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '로그인 | 부산대 과팅',
  description: '이메일 인증 링크로 로그인',
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
