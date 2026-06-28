'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  HeartHandshake,
  Images,
  LayoutDashboard,
  MessageCircle,
  Radar,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  UsersRound,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import { DEV_AUTH_COOKIE, getDevAuthCookieValue, isDevAuthBypassEnabled } from '@/lib/dev-auth'

const previewLinks = [
  { href: '/', label: '홈', detail: '우리 톤 기준으로 정리한 첫 화면', Icon: LayoutDashboard },
  { href: '/profile/basic', label: '기본 정보', detail: '프로필 첫 단계', Icon: UserRound },
  { href: '/profile/worldcup', label: '이상형 월드컵', detail: '취향 선택', Icon: Sparkles },
  { href: '/profile/survey', label: '성향 질문', detail: 'Big5 입력', Icon: ClipboardList },
  { href: '/profile/photos', label: '사진 업로드', detail: '프로필 사진', Icon: Images },
  { href: '/profile/complete', label: '프로필 완료', detail: '가입 흐름 완료 화면', Icon: CheckCircle2 },
  { href: '/match/start', label: '매칭 찾기 준비', detail: '성향/시간/비중 확인', Icon: HeartHandshake },
  { href: '/profile/personality-preference', label: '성향 선호', detail: '상대 성향 선호', Icon: HeartHandshake },
  { href: '/profile/schedule', label: '가능 시간', detail: '만남 가능 시간대', Icon: CalendarClock },
  { href: '/profile/preferences', label: '매칭 비중', detail: '외모/성격/키/체형 가중치', Icon: SlidersHorizontal },
  { href: '/friends', label: '친구 초대', detail: '링크 초대/친구 목록', Icon: UsersRound },
  { href: '/group/create', label: '그룹 만들기', detail: '초대/준비/큐 진입', Icon: UsersRound },
  { href: '/group/create?from=home-queue', label: '큐 레이더', detail: '매칭 탐색 화면', Icon: Radar },
  { href: '/match', label: '매칭 결과', detail: '결과 목록', Icon: HeartHandshake },
]

const progressItems = [
  {
    title: '성준 장소/만남 DB',
    desc: '우리 브랜치에는 후보 스키마가 있지만 성준 기준과 계약 합의가 필요해요',
    state: '합의 필요',
  },
  {
    title: '홈 디자인',
    desc: '통째 복사가 아니라 따뜻한 톤, 여백, 카드 위계만 우리 방식으로 정리',
    state: '반영 중',
  },
  {
    title: '데일리 카드/Q&A',
    desc: '사전 힌트 작성, 논쟁카드, 16~20시 직접 뽑기 흐름을 확인',
    state: '점검 중',
  },
  {
    title: '채팅',
    desc: '확정 매칭 상세에서 채팅방으로 들어가는 흐름까지 확인 가능',
    state: '반영',
  },
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
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-7 flex items-center justify-between">
          <BootingLogo size="md" />
          <span className="rounded-full border border-boot-hairline bg-white/90 px-3 py-1.5 text-[11px] font-black text-boot-primary shadow-sm">
            Local Preview
          </span>
        </header>

        <section className="mb-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-boot-primary">
            Phase 6
          </p>
          <h1 className="mt-2 text-3xl font-black leading-tight">현재 화면 점검</h1>
          <p className="mt-2 text-sm leading-6 text-boot-muted">
            로그인 없이 주요 화면을 열어보고, 성준 작업에서 흡수한 부분과 보류한 부분을 확인합니다.
          </p>
        </section>

        <section className="glass-card mb-5 rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-base font-black">성준 작업 흡수 상태</h2>
              <p className="text-xs text-boot-muted">통째 병합이 아니라 필요한 부분만 가져옵니다.</p>
            </div>
          </div>
          <div className="grid gap-2">
            {progressItems.map((item) => (
              <div key={item.title} className="rounded-2xl border border-boot-hairline bg-white/80 px-3 py-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <p className="text-sm font-black">{item.title}</p>
                  <span className="rounded-full bg-boot-soft px-2 py-1 text-[10px] font-black text-boot-primary">
                    {item.state}
                  </span>
                </div>
                <p className="text-xs leading-5 text-boot-muted">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <MessageCircle size={18} className="mt-0.5 flex-shrink-0 text-amber-700" />
            <p className="text-xs leading-5 text-amber-800">
              채팅은 확정 매칭 상세에서 확인합니다. 미리보기에서는 매칭 상세, 오늘의 카드, 채팅 진입까지 한 흐름으로 눌러볼 수 있어요.
            </p>
          </div>
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
