'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  MessageCircleQuestion,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import UniversityMascot from '@/components/theme/UniversityMascot'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'
import { communityRooms, mannerSummary, missions, todayDebate } from '@/lib/community/mock-data'

const roomIcons: Record<string, LucideIcon> = {
  debates: MessageCircleQuestion,
  stats: BarChart3,
  rankings: Trophy,
  manners: Star,
  missions: ClipboardCheck,
  safety: ShieldCheck,
}

export default function CommunityPage() {
  const { theme } = useUniversityTheme()
  const campusName = theme.shortName
  const pendingMission = missions.find((mission) => !mission.completed) ?? missions[0]

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-5 flex items-center justify-between">
          <BootingLogo size="md" />
          <Link
            href="/meetups"
            className="inline-flex h-10 items-center gap-1.5 rounded-2xl border border-boot-hairline bg-white/90 px-3 text-xs font-black text-boot-body shadow-sm"
          >
            모임
            <ArrowRight size={14} className="text-boot-primary" />
          </Link>
        </header>

        <section className="mb-4 overflow-hidden rounded-[30px] border border-boot-primary/15 bg-white shadow-[var(--boot-card-shadow)]">
          <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3 p-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">
                Community Hub
              </p>
              <h1 className="mt-1 text-2xl font-black leading-tight">커뮤니티 허브</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
                {campusName} 친구들이 논쟁, 통계, 랭킹, 매너를 방처럼 오가며 보는 공간이에요.
              </p>
            </div>
            <Image
              src="/daily-cards/debate/tangsuyuk-dip.png"
              alt="오늘의 논쟁 카드"
              width={104}
              height={104}
              priority
              className="h-[104px] w-[104px] rounded-[26px] object-cover shadow-sm"
            />
          </div>
          <div className="grid grid-cols-3 border-t border-boot-hairline bg-boot-soft/60 text-center text-[11px] font-black text-boot-body">
            <span className="py-2.5">짧게 보기</span>
            <span className="border-x border-boot-hairline py-2.5">방별 이동</span>
            <span className="py-2.5">다시 돌아오기</span>
          </div>
        </section>

        <section className="mb-4 rounded-[28px] border border-boot-primary/15 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
                Today
              </p>
              <h2 className="text-lg font-black">오늘 할 일</h2>
            </div>
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-boot-primary" />
              <UniversityMascot kind="guide" size="sm" className="h-12 w-12 rounded-2xl shadow-sm" />
            </div>
          </div>

          <div className="grid gap-2">
            <Link
              href={todayDebate.href}
              className="flex items-center justify-between rounded-2xl bg-boot-soft px-4 py-3 text-sm font-black text-boot-body"
            >
              <span className="min-w-0">
                <span className="block truncate">{todayDebate.prompt}</span>
                <span className="mt-0.5 block text-xs font-bold text-boot-muted">{todayDebate.participantLabel}</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-boot-primary" />
            </Link>
            <Link
              href={pendingMission.href}
              className="flex items-center justify-between rounded-2xl border border-boot-hairline px-4 py-3 text-sm font-black text-boot-body"
            >
              <span className="min-w-0">
                <span className="block truncate">{pendingMission.title}</span>
                <span className="mt-0.5 block text-xs font-bold text-boot-muted">{pendingMission.description}</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-boot-primary" />
            </Link>
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">기능 방</h2>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-boot-muted shadow-sm">
              들어가고 나오기
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {communityRooms.map((room) => {
              const Icon = roomIcons[room.id]
              return (
                <Link
                  key={room.id}
                  href={room.href}
                  className="min-h-[136px] rounded-[24px] border border-boot-primary/15 bg-white p-4 shadow-sm transition hover:border-boot-primary/35"
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
                      <Icon size={18} />
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-boot-muted">
                      {room.eyebrow}
                    </span>
                  </div>
                  <h3 className="text-base font-black">{room.label}</h3>
                  <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-boot-muted">{room.description}</p>
                  <p className="mt-3 truncate rounded-full bg-boot-soft px-3 py-1.5 text-[11px] font-black text-boot-body">
                    {room.summary}
                  </p>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mb-4 rounded-[26px] border border-boot-hairline bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-black">최근 본 것</h2>
            <Link href="/community/safety" className="text-xs font-black text-boot-primary">
              안전 기준
            </Link>
          </div>
          <div className="grid gap-2">
            <Link
              href="/community/stats/explore?q=컴퓨터공학부&scope_ids=pnu,pnu-cse,pukyong-cse"
              className="flex items-center justify-between rounded-2xl bg-boot-soft px-4 py-3 text-sm font-black text-boot-body"
            >
              <span>컴공끼리 탕수육 취향 비교</span>
              <ArrowRight size={15} className="text-boot-primary" />
            </Link>
            <Link
              href="/community/manners"
              className="flex items-center justify-between rounded-2xl border border-boot-hairline px-4 py-3 text-sm font-black text-boot-body"
            >
              <span>{mannerSummary.pendingReviews}건의 매너 리뷰 대기</span>
              <ArrowRight size={15} className="text-boot-primary" />
            </Link>
          </div>
        </section>

        <Link
          href="/meetups"
          className="flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
        >
          <span>밥약, 카공, 게임은 모임 탭에서 보기</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  )
}
