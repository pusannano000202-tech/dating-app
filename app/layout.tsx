import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '부산대 과팅',
  description: '친구들과 팀을 짜고 보증금을 걸면, 시간·장소까지 자동으로 잡아드려요',
  themeColor: '#0a0a14',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-app min-h-screen text-white">{children}</body>
    </html>
  )
}
