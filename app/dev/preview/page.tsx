'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  HeartHandshake,
  Images,
  LayoutDashboard,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'

const previewLinks = [
  { href: '/', label: '홈', detail: '첫 화면', Icon: LayoutDashboard },
  { href: '/profile/basic', label: '기본 정보', detail: '프로필 첫 단계', Icon: UserRound },
  { href: '/profile/worldcup', label: '이상형 월드컵', detail: '취향 선택', Icon: Sparkles },
  { href: '/profile/survey', label: '성향 설문', detail: 'Big5 입력', Icon: ClipboardList },
  { href: '/profile/photos', label: '사진 업로드', detail: '프로필 사진', Icon: Images },
  { href: '/profile/complete', label: '프로필 완료', detail: '완료 화면', Icon: Sparkles },
  { href: '/match/start', label: '매칭찾기 준비', detail: '선호 설정 허브', Icon: HeartHandshake },
  { href: '/profile/personality-preference', label: '성향 선호', detail: '상대 성향', Icon: HeartHandshake },
  { href: '/profile/schedule', label: '가능 시간', detail: '만남 일정', Icon: CalendarClock },
  { href: '/profile/preferences', label: '매칭 비중', detail: '선호 가중치', Icon: SlidersHorizontal },
  { href: '/friends', label: '친구추가', detail: '친구 목록/초대', Icon: UsersRound },
  { href: '/group/create', label: '그룹 만들기', detail: '친구 초대/무료 베타', Icon: UsersRound },
  { href: '/match', label: '매칭 결과', detail: '결과 목록', Icon: HeartHandshake },
]

export default function DevPreviewPage() {
  useEffect(() => {
    if (!isDevAuthBypassEnabled()) return
    const maxAge = 60 * 60 * 24 * 7
    document.cookie = `${DEV_AUTH_COOKIE}=${getDevAuthCookieValue()}; path=/; max-age=${maxAge}; SameSite=Lax`
    window.localStorage.setItem(DEV_AUTH_COOKIE, getDevAuthCookieValue())
  }, [])

  return (
    <main className="min-h-screen booting-band px-5 pb-12 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-7 flex items-center justify-between">
          <BootingLogo size="md" />
          <span className="rounded-full border border-boot-hairline bg-white/90 px-3 py-1.5 text-[11px] font-black text-boot-primary shadow-sm">
            Local Preview
          </span>
        </header>

        <section className="mb-5">
          <h1 className="text-3xl font-black leading-tight">디자인 확인 모드</h1>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            인증 설정은 나중에 붙이고, 지금은 화면 흐름을 먼저 점검해요.
          </p>
        </section>

        <div className="grid gap-2.5">
          {previewLinks.map(({ href, label, detail, Icon }) => (
            <Link
              key={href}
              href={href}
              className="glass flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/85 px-4 py-3.5 shadow-sm transition-colors hover:border-boot-primary/30"
            >
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                <Icon size={18} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-boot-ink">{label}</span>
                <span className="mt-0.5 block text-xs text-boot-muted">{detail}</span>
              </span>
              <ChevronRight size={16} className="text-boot-muted" />
            </Link>
          ))}
        </div>
      </div>
    </main>
  )
}
