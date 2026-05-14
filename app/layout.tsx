import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '부산대 과팅앱',
  description: '그룹미팅 매칭 앱',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
