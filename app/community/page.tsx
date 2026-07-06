'use client'

import Link from 'next/link'
import {
  CalendarDays,
  Coffee,
  Gamepad2,
  MapPin,
  Sparkles,
  UsersRound,
  Utensils,
} from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import { CampusCommunityCard } from '@/components/community/CampusCommunityCard'
import MascotCoachCard from '@/components/theme/MascotCoachCard'
import { useUniversityTheme } from '@/components/theme/UniversityThemeProvider'

export default function CommunityPage() {
  const { theme } = useUniversityTheme()
  const campusName = theme.shortName
  const communityCards = [
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
            <Sparkles size={18} />
          </span>
        </header>

        <section className="mb-5">
          <MascotCoachCard
            kind="guide"
            eyebrow={`${campusName} Campus Theme`}
            title={`${campusName}에서 오늘 뭐하지?`}
            body="과팅만 기다리지 않고, 밥약, 카공, 게임, 동아리 느낌의 모임으로 먼저 사람을 만나요."
          />
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[`${campusName} 우선`, '혼성 가능', '학교별 테마'].map((label) => (
              <span
                key={label}
                className="rounded-2xl border border-white/70 bg-white/75 px-2 py-2 text-center text-[11px] font-black text-boot-body shadow-sm"
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="mb-5 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <MapPin size={20} />
            </span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">
                Campus Mode
              </p>
              <h2 className="mt-1 text-xl font-black leading-tight">학교마다 다른 분위기로 보여줄 수 있어요</h2>
              <p className="mt-2 text-sm leading-6 text-boot-muted">
                지금은 기본정보의 학교 입력값을 기준으로 프론트 테마를 바꿉니다. 다음 단계에서 학교 코드와 테마 데이터를
                DB로 분리하면 같은 기능에 다른 색감과 장소 추천을 더 안정적으로 입힐 수 있어요.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-5">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
                Community
              </p>
              <h2 className="mt-1 text-2xl font-black">모임 둘러보기</h2>
            </div>
            <Link
              href="/match"
              className="rounded-full bg-boot-ink px-4 py-2 text-xs font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
            >
              매칭으로
            </Link>
          </div>
          <div className="grid gap-3">
            {communityCards.map((card) => (
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
                이번 단계에서는 사용자가 눌러보고 싶은 구조와 화면 역할을 먼저 확정합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
