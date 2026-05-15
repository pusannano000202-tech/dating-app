import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Destiny — 운명적인 만남',
  description: '운명적인 만남이 기다리고 있어요. 친구들과 팀을 짜고 보증금을 걸면, 시간·장소까지 자동으로 잡아드려요.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Destiny',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#060612',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-app min-h-screen text-white safe-area-padding">{children}</body>
    </html>
  )
}
