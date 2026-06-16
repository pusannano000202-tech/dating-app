'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Home, Search, UserRound } from 'lucide-react'

const hiddenExactRoutes = new Set(['/login', '/dev/preview'])

const tabs = [
  { href: '/', label: '홈', Icon: Home },
  { href: '/match', label: '매칭', Icon: Search },
  { href: '/notifications', label: '알림', Icon: Bell },
  { href: '/profile/edit', label: '내정보', Icon: UserRound },
]

function shouldHide(pathname: string): boolean {
  if (hiddenExactRoutes.has(pathname)) return true
  if (pathname.startsWith('/admin')) return true
  if (/^\/match\/[^/]+\/chat/.test(pathname)) return true
  return false
}

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  if (href === '/match') return pathname === '/match' || pathname.startsWith('/match/')
  if (href === '/profile/edit') return pathname === '/profile/edit' || pathname.startsWith('/profile/')
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AppBottomNav() {
  const pathname = usePathname() || '/'

  if (shouldHide(pathname)) return null

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(env(safe-area-inset-bottom)+10px)] pointer-events-none">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1 rounded-[28px] border border-boot-hairline bg-white/92 p-1.5 shadow-[0_18px_50px_rgba(34,31,32,0.16)] backdrop-blur-2xl pointer-events-auto">
        {tabs.map(({ href, label, Icon }) => {
          const active = isActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex min-h-[54px] flex-col items-center justify-center rounded-3xl px-2 text-[11px] font-black transition',
                active
                  ? 'bg-boot-soft text-boot-primary shadow-sm'
                  : 'text-boot-muted hover:bg-boot-soft/60 hover:text-boot-body',
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
