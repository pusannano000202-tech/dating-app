'use client'

import { useQuantumLocale } from '@/components/i18n/QuantumLocaleProvider'
import { isAppTabActive } from '@/lib/navigation/app-tabs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, MessageCircleMore, UserRound, UsersRound, Zap } from 'lucide-react'

const hiddenExactRoutes = new Set(['/login', '/dev/preview'])

const tabs = [
  { href: '/', label: '홈', Icon: Home },
  { href: '/match', label: '매칭', Icon: Zap },
  { href: '/meetups', label: '모임', Icon: UsersRound },
  { href: '/community', label: '커뮤니티', Icon: MessageCircleMore },
  { href: '/chat', label: '채팅', Icon: MessageCircle },
  { href: '/profile/edit', label: '마이', Icon: UserRound },
]

function shouldHide(pathname: string): boolean {
  if (hiddenExactRoutes.has(pathname)) return true
  if (pathname.startsWith('/admin')) return true
  if (pathname.startsWith('/match/events/')) return true
  return false
}

export default function AppBottomNav() {
  const { t } = useQuantumLocale()
  const pathname = usePathname() || '/'

  if (shouldHide(pathname)) return null

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-50 border-t border-boot-hairline bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div
        className="pointer-events-auto mx-auto grid h-16 max-w-md gap-1 px-2"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = isAppTabActive(pathname, href)
          const className = [
            'relative flex min-h-16 flex-col items-center justify-center px-1 text-[10px] font-black transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-boot-primary',
            active
              ? 'text-boot-primary'
              : 'text-boot-muted hover:text-boot-body',
          ].join(' ')
          const content = (
            <>
              {active && <span className="absolute inset-x-4 top-0 h-0.5 bg-boot-primary" />}
              <Icon size={20} strokeWidth={active ? 2.8 : 2.1} />
              <span className="mt-1 leading-none">{t(({홈:'nav.home',매칭:'nav.match',모임:'nav.meetups',커뮤니티:'nav.community',채팅:'nav.chat',마이:'nav.profile'} as Record<string,string>)[label])}</span>
            </>
          )

          return (
            <Link
              key={href}
              href={href}
              prefetch
              className={className}
              aria-current={active ? 'page' : undefined}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
