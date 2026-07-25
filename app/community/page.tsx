import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  BarChart3,
  Flame,
  Handshake,
  ShieldCheck,
  MessageCircleQuestion,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import CommunityComingSoon from '@/components/community/CommunityComingSoon'
import SchoolName from '@/components/theme/SchoolName'
import { isCommunityFeatureEnabled } from '@/lib/community-feature'

type CommunityActionId = 'debate' | 'stats' | 'safety'

const nextActions = [
  {
    title: '돈까스 월드컵 바로 시작',
    description: '사진으로 바로 비교하고 1:1 대결을 시작',
    href: '/community/campus-eats?mode=battle&category=donkatsu',
    icon: Flame,
    id: 'donkatsu',
  },
  {
    title: '추천 모임 바로 시작',
    description: '지금 만들 수 있는 2인·3인 그룹부터 확인',
    href: '/meetups?focus=featured',
    icon: Handshake,
    id: 'meetups',
  },
]

const communityEntries: Array<{
  id: CommunityActionId
  title: string
  description: string
  icon: typeof MessageCircleQuestion
}> = [
  {
    id: 'debate',
    title: '캠퍼스 토론',
    description: '게시글과 반응 저장 기능을 준비하고 있어요.',
    icon: MessageCircleQuestion,
  },
  {
    id: 'stats',
    title: '생활형 매칭 지표',
    description: '실제 활동 데이터가 연결된 뒤 공개할 예정이에요.',
    icon: BarChart3,
  },
  {
    id: 'safety',
    title: '안전 가이드',
    description: '신고·차단 정책과 지원 동선을 정리하고 있어요.',
    icon: ShieldCheck,
  },
]

export default function CommunityPage() {
  if (!isCommunityFeatureEnabled()) {
    return <CommunityComingSoon kind="community" />
  }

  return (
    <main className="min-h-screen px-5 pb-28 pt-7 booting-paper text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-5 flex items-center justify-between">
          <BootingLogo size="md" />
          <span className="rounded-md border border-boot-hairline bg-white px-3 py-1.5 text-[11px] font-black text-boot-primary">
            실제 기능만 안내
          </span>
        </header>

        <section className="mb-4 border border-boot-hairline rounded-[8px] bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.08em] text-boot-primary">
                Campus Signal
              </p>
              <h1 className="mt-1 text-3xl font-black leading-tight">
                <SchoolName suffix=" 커뮤니티" />
              </h1>
              <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
                Quantum이 지금 해볼 만한 일을 먼저 골라드려요.
                <br />한 번 누르면 바로 다음 경험이 이어집니다.
              </p>
            </div>
          </div>
          <Link
            href="/community/campus-eats?mode=battle&category=donkatsu"
            className="mb-2 grid min-h-[128px] grid-cols-[124px_minmax(0,1fr)] overflow-hidden rounded-lg border border-boot-primary/25 bg-white"
          >
            <span className="relative bg-boot-soft">
              <Image src="/campus-eats/preview/cutlet-katsu.webp" alt="시안용 돈카츠 한 접시" fill sizes="124px" className="object-cover" />
            </span>
            <span className="flex min-w-0 flex-col justify-center px-4 py-3">
              <span className="text-[11px] font-black text-boot-coral">이번 주 첫 추천</span>
              <span className="mt-1 text-base font-black">부산대 돈까스 8강</span>
              <span className="mt-1 text-xs font-bold leading-5 text-boot-muted">누르면 첫 대결이 바로 열려요.</span>
              <span className="mt-2 flex items-center gap-1 text-xs font-black text-boot-primary">지금 시작 <ArrowRight size={14} /></span>
            </span>
          </Link>
          <div className="grid gap-2">
            {nextActions.slice(1).map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="group flex min-h-[56px] items-center justify-between rounded-[8px] border border-boot-primary/20 bg-boot-soft px-4 py-3 transition hover:border-boot-primary"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-black text-boot-primary">{action.title}</span>
                  <span className="mt-1 block text-xs font-bold leading-5 text-boot-muted">{action.description}</span>
                </span>
                <span className="ml-3 shrink-0 text-boot-primary">
                  <action.icon size={18} />
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-2 border border-boot-hairline rounded-[8px] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-base font-black">준비 중인 커뮤니티</h2>
              <p className="mt-1 text-xs font-bold text-boot-muted">저장 기능이 연결되기 전에는 입력을 받지 않아요.</p>
            </div>
          </div>
          <div className="grid gap-2">
            {communityEntries.map((entry) => {
              const Icon = entry.icon
              return (
                <div
                  key={entry.id}
                  className="flex min-h-[64px] items-center rounded-[8px] border border-boot-hairline bg-[#F7F9F8] px-3 py-3"
                  aria-disabled="true"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] border border-boot-hairline text-boot-primary">
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1 px-2">
                    <span className="block text-sm font-black">{entry.title}</span>
                    <span className="mt-1 block text-xs font-bold leading-5 text-boot-muted">{entry.description}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-white px-2 py-1 text-[10px] font-black text-boot-muted">준비 중</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
