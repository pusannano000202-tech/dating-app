import type { Metadata, Viewport } from 'next'
import { Suspense } from 'react'
import './globals.css'
import SchoolThemeProvider from '@/components/theme/SchoolThemeProvider'
import AppBottomNav from '@/components/navigation/AppBottomNav'

export const metadata: Metadata = {
  title: 'Quantum — 대학생 연결',
  description: '과팅, 모임, 캠퍼스 생활을 자연스럽게 이어주는 대학생 연결 서비스입니다.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Quantum',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#F4F6F5',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-app min-h-screen text-boot-ink safe-area-padding">
        <Suspense fallback={null}>
          <SchoolThemeProvider />
        </Suspense>
        {children}
        <AppBottomNav />
      </body>
    </html>
  )
}
