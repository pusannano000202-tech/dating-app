import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  Globe,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import SchoolName from '@/components/theme/SchoolName'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

type SearchParams = {
  focus?: string | string[]
}

type MeetupsPageProps = {
  searchParams?: SearchParams
}

type QuickAction = {
  icon: typeof UsersRound
  title: string
  detail: string
  href: string
  isFeatured: boolean
}

const quickMeetupActions: QuickAction[] = [
  {
    icon: UsersRound,
    title: '3인 모임 바로 시작',
    detail: '학교 인증 기반 3인 모임으로 바로 이동합니다.',
    href: '/group/create?size=3',
    isFeatured: true,
  },
  {
    icon: UsersRound,
    title: '2인 바로 시작',
    detail: '간단 일정 조정이 쉬운 2인 모임으로 바로 진행',
    href: '/group/create?size=2',
    isFeatured: false,
  },
  {
    icon: UserPlus,
    title: '같이 갈 친구 초대',
    detail: '그룹 초대 링크를 만들고 친구에게 바로 보낼 수 있어요.',
    href: '/friends',
    isFeatured: false,
  },
  {
    icon: MessageCircle,
    title: '커뮤니티 가이드 확인',
    detail: '안전 규칙과 운영 예시를 먼저 확인하고 시작',
    href: '/community',
    isFeatured: false,
  },
]

const trustPoints = [
  {
    icon: ShieldCheck,
    text: '학교 인증 및 신고 기준으로만 운영 룰을 적용합니다.',
  },
  {
    icon: Globe,
    text: '정책 안내는 공개 룰셋을 기준으로 투명하게 노출됩니다.',
  },
  {
    icon: MessageCircle,
    text: '불편할 때는 지원 채널로 바로 연결해서 이어받을 수 있습니다.',
  },
]

export default function MeetupsPage({ searchParams }: MeetupsPageProps) {
  const communityEnabled = isCommunityFeatureEnabled()
  const focus = searchParams?.focus
  const focusFeatured =
    focus === 'featured' || (Array.isArray(focus) && focus.includes('featured'))

  if (!communityEnabled) {
    return <CommunityComingSoon kind="meetups" />
  }

  const featuredAction =
    quickMeetupActions.find((action) => action.isFeatured) ?? quickMeetupActions[0]

  const focusedCopy = focusFeatured
    ? '오늘 부담 없이 시작하기 좋은 구성을 먼저 골라뒀어요.'
    : '지금 시작하기 좋은 학교 모임부터 보여드려요.'

  return (
    <main className="min-h-screen bg-[#F4F6F5] px-4 pb-24 pt-6 text-boot-ink">
      <div className="mx-auto w-full max-w-[460px] space-y-4">
        <header className="flex items-center justify-between">
          <BootingLogo size="md" />
          <Link
            href="/community"
            className="rounded-lg border border-boot-hairline bg-white px-3 py-2 text-[12px] font-bold text-boot-primary transition hover:bg-white/90"
          >
            모임도움말 보기
          </Link>
        </header>

        <section
          id="featured-meetup-action"
          className={`overflow-hidden rounded-lg border bg-white ${
            focusFeatured ? 'border-boot-primary bg-[#FFF7F4]' : 'border-boot-hairline'
          }`}
          aria-live="polite"
        >
          <div className="relative aspect-[16/9] bg-boot-soft">
            <Image
              src="/images/quantum-campus-group.webp"
              alt="캠퍼스 라운지에서 함께 대화하는 대학생 네 명"
              fill
              priority
              sizes="(max-width: 480px) calc(100vw - 32px), 460px"
              className="object-cover"
            />
            <p className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 text-[12px] font-black text-boot-primary shadow-sm">
              <Sparkles size={14} />오늘의 추천
            </p>
          </div>
          <div className="p-4">
            <h1 className="text-2xl font-black leading-tight"><SchoolName suffix=" 모임을 이어가요" /></h1>
            <p className="mt-2 text-sm leading-6 text-boot-muted">{focusedCopy}</p>
            {featuredAction ? (
              <Link
                href={featuredAction.href}
                className="mt-4 flex min-h-12 items-center justify-between rounded-lg bg-boot-primary px-4 py-3 text-sm font-black text-white"
                aria-label={`${featuredAction.title} 시작`}
              >
                <span>{featuredAction.title}</span>
                <ArrowRight size={18} />
              </Link>
            ) : null}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-black">다른 모임도 있어요</h2>
          <div className="space-y-2">
            {quickMeetupActions
              .filter((action) => !action.isFeatured)
              .map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className={`flex min-h-11 items-center rounded-lg border bg-white px-4 py-3 transition ${
                  action.isFeatured
                    ? focusFeatured
                      ? 'border-boot-primary bg-[#FFF7F4]'
                      : 'border-boot-primary/40 bg-[#FFF7F4]'
                    : 'border-boot-hairline hover:border-boot-primary/35'
                }`}
                aria-label={`${action.title}: ${action.detail}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-boot-hairline text-boot-primary">
                  <action.icon size={16} />
                </span>
                <span className="ml-3 min-w-0 flex-1">
                  <span className="block text-sm font-black">{action.title}</span>
                  <span className="mt-0.5 block text-xs text-boot-muted">{action.detail}</span>
                </span>
                <ArrowRight size={16} className="text-boot-muted" />
              </Link>
              ))}
          </div>
        </section>

        <section className="rounded-lg border border-boot-hairline bg-white p-4">
          <h2 className="text-lg font-black">안전·운영 가이드</h2>
          <ul className="mt-3 space-y-2">
            {trustPoints.map((point) => (
              <li
                key={point.text}
                className="flex items-center gap-3 border border-boot-hairline bg-[#FAFBFC] px-3 py-2"
              >
                <point.icon size={16} className="text-boot-primary" />
                <span className="text-sm text-boot-muted">{point.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
