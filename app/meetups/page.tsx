'use client'

import Link from 'next/link'
import {
  BarChart3,
  CalendarDays,
  Coffee,
  Gamepad2,
  Sparkles,
  UsersRound,
  Utensils,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import { CampusCommunityCard } from '@/components/community/CampusCommunityCard'
import MascotCoachCard from '@/components/theme/MascotCoachCard'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export default function MeetupsPage() {
  const { theme } = useUniversityTheme()
  const campusName = theme.shortName
  const meetupCards = [
    {
      title: `${campusName} 캠퍼스 게임`,
      category: '게임',
      description: '처음 만난 사람도 바로 섞일 수 있게 팀을 나눠 가볍게 노는 캠퍼스 게임 모임이에요.',
      meta: `오늘 19:00 · ${theme.designTheme.landmarkCue} 근처 · 남녀 혼성 가능`,
      members: '18명 관심',
      Icon: Gamepad2,
      tone: 'coral' as const,
    },
    {
      title: `${campusName} 밥약 테이블`,
      category: '밥약',
      description: '학과가 달라도 부담 없이 한 끼부터 시작해요. 같은 학교 우선, 다른 학교 허용은 다음 단계에서 붙입니다.',
      meta: `${campusName} 근처 맛집 · 2~4명 소규모 · 저녁 추천`,
      members: '12명 관심',
      Icon: Utensils,
      tone: 'amber' as const,
    },
    {
      title: `${campusName} 카공 체크인`,
      category: '카공',
      description: '말을 많이 하지 않아도 괜찮은 조용한 모임. 시험기간에 같이 앉을 사람을 찾아요.',
      meta: '도서관 근처 · 90분 집중 · 끝나고 커피',
      members: '9명 관심',
      Icon: Coffee,
      tone: 'sky' as const,
    },
    {
      title: `${campusName} 동아리 둘러보기`,
      category: '동아리',
      description: '동아리처럼 느슨하게 들어와서 분위기만 보고 나가도 되는 학교 안 모임 허브예요.',
      meta: `${campusName} 재학생 중심 · 초대 링크 기반`,
      members: '24명 관심',
      Icon: UsersRound,
      tone: 'mint' as const,
    },
  ]

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-6 flex items-center justify-between">
          <BootingLogo size="md" />
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-primary shadow-sm">
            <UsersRound size={18} />
          </span>
        </header>

        <section className="mb-5">
          <MascotCoachCard
            kind="guide"
            eyebrow={`${campusName} Meetups`}
            title={`${campusName}에서 오늘 뭐하지?`}
            body="밥약, 카공, 게임, 동아리처럼 바로 만나기 쉬운 모임을 먼저 둘러봐요."
          />
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[`${campusName} 우선`, '혼성 가능', '초대 기반'].map((label) => (
              <span
                key={label}
                className="rounded-2xl border border-white/70 bg-white/75 px-2 py-2 text-center text-[11px] font-black text-boot-body shadow-sm"
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
                Meetups
              </p>
              <h1 className="mt-1 text-2xl font-black">모임 둘러보기</h1>
            </div>
            <Link
              href="/community"
              className="inline-flex items-center gap-1 rounded-full bg-boot-ink px-4 py-2 text-xs font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
            >
              <BarChart3 size={14} />
              커뮤니티
            </Link>
          </div>
          <div className="grid gap-3">
            {meetupCards.map((card) => (
              <CampusCommunityCard key={card.title} {...card} />
            ))}
          </div>
        </section>

        <section className="rounded-[30px] border border-boot-primary/15 bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <CalendarDays size={18} />
            </span>
            <div>
              <h2 className="text-base font-black">아직은 프론트 mock 단계예요</h2>
              <p className="mt-1 text-sm leading-6 text-boot-muted">
                실제 참여, 모집 정원, 학교별 공개 범위, 모임 채팅은 DB/API가 붙은 뒤 연결합니다.
                캠퍼스 취향 통계와 랭킹은 별도 커뮤니티 탭에서 확인해요.
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/community?focus=school"
          className="mt-4 flex items-center justify-between rounded-2xl border border-boot-hairline bg-white/85 px-4 py-3.5 text-sm font-black text-boot-body shadow-sm"
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles size={17} className="text-boot-primary" />
            우리학교 취향 통계 보기
          </span>
          <span className="text-boot-primary">이동</span>
        </Link>
      </div>
    </main>
  )
}
