import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '부팅 — 부산대 과팅',
  description: '부산대생끼리 친구들과 팀을 만들고, 조건이 맞는 상대팀과 안전하게 만나는 과팅 서비스입니다.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '부팅',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#fff7f3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-app min-h-screen text-boot-ink safe-area-padding">{children}</body>
    </html>
  )
}
