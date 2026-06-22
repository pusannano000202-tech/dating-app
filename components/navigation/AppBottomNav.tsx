'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageCircle, UserRound, Zap } from 'lucide-react'

const hiddenExactRoutes = new Set(['/login', '/dev/preview'])

const tabs = [
  { href: '/', label: '홈', Icon: Home },
  { href: '/match', label: '매칭', Icon: Zap },
  { href: '/chat', label: '채팅', Icon: MessageCircle },
  { href: '/profile/edit', label: '마이', Icon: UserRound },
]

function shouldHide(pathname: string): boolean {
  if (hiddenExactRoutes.has(pathname)) return true
  if (pathname.startsWith('/admin')) return true
  return false
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/match') return pathname === '/match' || pathname.startsWith('/match/')
  if (href === '/chat') return pathname === '/chat' || /^\/match\/[^/]+\/chat/.test(pathname)
  if (href === '/profile/edit') return pathname === '/profile/edit' || pathname.startsWith('/profile/')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppBottomNav() {
  const pathname = usePathname() || '/'

  if (shouldHide(pathname)) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pointer-events-none">
      <div className="booting-bottom-nav mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[30px] p-1.5 backdrop-blur-2xl pointer-events-auto">
        {tabs.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex min-h-[56px] flex-col items-center justify-center rounded-[24px] px-2 text-[11px] font-black transition',
                active
                  ? 'bg-white text-boot-primary shadow-[0_8px_22px_rgba(23,20,18,0.08)]'
                  : 'text-boot-muted hover:bg-white/60 hover:text-boot-body',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
            >
              <Icon size={19} strokeWidth={active ? 2.8 : 2.2} />
              <span className="mt-1 leading-none">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
