import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: '로그인 | Quantum',
  description: 'Quantum 이메일 인증 링크로 로그인',
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
