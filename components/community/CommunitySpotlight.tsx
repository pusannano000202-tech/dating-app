import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Flame,
  HeartHandshake,
  Lightbulb,
  MessagesSquare,
} from 'lucide-react'

import CampusEatsCategoryIcon from '@/components/campus-eats/CampusEatsCategoryIcon'

import {
  PNU_CAMPUS_EATS_CATEGORIES,
  type CampusEatsCategoryId,
} from '@/lib/campus-eats/fixtures/pnu-categories'

const CATEGORY_LINKS = [
  { id: 'donkatsu', href: '/community/campus-eats?mode=battle&category=donkatsu' },
  { id: 'pizza', href: '/community/campus-eats?mode=battle&category=pizza' },
  { id: 'chicken', href: '/community/campus-eats?mode=battle&category=chicken' },
  { id: 'coffee-main', href: '/community/campus-eats?mode=battle&category=coffee-main' },
  { id: 'coffee-north', href: '/community/campus-eats?mode=battle&category=coffee-north' },
  { id: 'gukbap', href: '/community/campus-eats?mode=battle&category=gukbap' },
  { id: 'milmyeon', href: '/community/campus-eats?mode=battle&category=milmyeon' },
] satisfies ReadonlyArray<{ id: CampusEatsCategoryId; href: string }>

const categoriesById = new Map(
  PNU_CAMPUS_EATS_CATEGORIES.map((category) => [category.id, category]),
)

export default function CommunitySpotlight() {
  return (
    <section className="grid gap-3 pb-5" aria-label="커뮤니티 바로가기">
      <article className="overflow-hidden rounded-[8px] border border-[#E7B155] bg-[#111923] shadow-[0_18px_44px_rgba(31,24,20,0.14)]">
        <div className="grid lg:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.1fr)]">
          <div className="grid min-h-[210px] grid-cols-2 gap-px bg-[#E7B155] sm:min-h-[260px] lg:min-h-full">
            <figure className="relative bg-[#FFF8F0]">
              <Image
                src="/campus-eats/preview/cutlet-katsu.webp"
                alt="부산대 맛집 월드컵에서 비교할 수 있는 돈가스 한 접시"
                fill
                priority
                sizes="(max-width: 1023px) 50vw, 24vw"
                className="object-contain p-2 sm:p-3"
              />
            </figure>
            <figure className="relative bg-[#FFF8F0]">
              <Image
                src="/campus-eats/preview/cutlet-cheese-curry.webp"
                alt="부산대 맛집 월드컵에서 비교할 수 있는 치즈 카레 돈가스 한 접시"
                fill
                priority
                sizes="(max-width: 1023px) 50vw, 24vw"
                className="object-contain p-2 sm:p-3"
              />
            </figure>
          </div>

          <div className="flex min-w-0 flex-col justify-center px-5 py-6 text-white sm:px-7 sm:py-8">
            <div className="flex items-center gap-2 text-[11px] font-black text-[#F6BD57]">
              <span className="rounded-[6px] bg-[#F25F4B] px-2 py-1 text-white">맛집 월드컵 NEW</span>
              <span>부산대 학생들의 실제 비교</span>
            </div>
            <h2 className="mt-3 text-2xl font-black leading-tight sm:text-3xl">
              학교 앞 진짜 1등,<br className="hidden sm:block" /> 우리가 직접 골라요.
            </h2>
            <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-white/80">
              먹어본 곳끼리 비교할수록 내 취향 순위가 더 정확해져요. 사진을 보고 한 곳만 고르면 바로 시작됩니다.
            </p>

            <dl className="mt-5 grid grid-cols-3 gap-2 border-y border-white/15 py-4 text-center">
              <div aria-label="93곳 매장">
                <dt className="text-lg font-black text-[#F6BD57]">93곳</dt>
                <dd className="mt-1 text-[11px] font-bold text-white/70">매장</dd>
              </div>
              <div className="border-x border-white/15" aria-label="94장 대진 카드">
                <dt className="text-lg font-black text-[#F6BD57]">94장</dt>
                <dd className="mt-1 text-[11px] font-bold text-white/70">대진 카드</dd>
              </div>
              <div aria-label="7개 음식 월드컵">
                <dt className="text-lg font-black text-[#F6BD57]">7개</dt>
                <dd className="mt-1 text-[11px] font-bold text-white/70">음식 월드컵</dd>
              </div>
            </dl>

            <div className="mt-5 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Link
                href="/community/campus-eats?mode=battle&category=donkatsu"
                className="flex min-h-12 items-center justify-center gap-2 rounded-[7px] bg-[#F6BD57] px-5 text-sm font-black text-[#18120D] outline-none transition hover:bg-[#FFD078] focus-visible:ring-2 focus-visible:ring-white"
              >
                1분 취향 분석 시작 <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <Link
                href="/community/campus-eats?mode=map&category=donkatsu&list=open"
                className="flex min-h-12 items-center justify-center rounded-[7px] border border-white/30 px-5 text-sm font-black text-white outline-none transition hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white"
              >
                전체 순위 보기
              </Link>
            </div>
          </div>
        </div>

        <nav
          className="flex gap-2 overflow-x-auto border-t border-white/15 bg-[#0D141D] px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6"
          aria-label="음식 월드컵 선택"
        >
          {CATEGORY_LINKS.map(({ id, href }) => {
            const category = categoriesById.get(id)
            if (!category) return null

            return (
              <Link
                key={id}
                href={href}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-[7px] border border-white/15 bg-white/[0.06] px-3 text-xs font-black text-white outline-none transition hover:border-[#F6BD57] hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#F6BD57]"
              >
                <CampusEatsCategoryIcon categoryId={id} size={15} className="text-[#F6BD57]" />
                {category.label}
                <span className="text-white/55">{category.candidates.length}</span>
              </Link>
            )
          })}
        </nav>
      </article>

      <div data-layout="community-quick-grid" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Link href="/community/hot" className="flex min-h-[82px] items-center gap-2.5 rounded-[8px] border border-[#F0B54F] bg-[#FFF8E7] px-3 py-3 text-[#49370A] transition hover:border-[#D97818]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-white/80 text-[#D97818]">
            <Flame size={18} />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black leading-5">최근 7일 핫글</strong>
            <span className="mt-0.5 block truncate text-[11px] font-bold text-[#6A572A]">이번 주 인기 글</span>
          </span>
        </Link>

        <Link href="/community/meetup-review" className="flex min-h-[82px] items-center gap-2.5 rounded-[8px] border border-boot-hairline bg-white px-3 py-3 transition hover:border-boot-primary/45">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-boot-soft text-boot-primary">
            <MessagesSquare size={18} />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black leading-5">모임 후기</strong>
            <span className="mt-0.5 block truncate text-[11px] font-bold text-boot-muted">참여 경험 보기</span>
          </span>
        </Link>

        <Link href="/community/feedback" className="flex min-h-[82px] items-center gap-2.5 rounded-[8px] border border-boot-hairline bg-white px-3 py-3 transition hover:border-boot-primary/45">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-boot-soft text-boot-primary">
            <Lightbulb size={18} />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black leading-5">운영자 피드백</strong>
            <span className="mt-0.5 block truncate text-[11px] font-bold text-boot-muted">불편과 제안</span>
          </span>
        </Link>

        <Link href="/community/relationship-advice" className="flex min-h-[82px] items-center gap-2.5 rounded-[8px] border border-[#F3C3D1] bg-[#FFF0F4] px-3 py-3 transition hover:border-[#BF5473]">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-white/75 text-[#BF5473]">
            <HeartHandshake size={18} />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black leading-5 text-[#702B42]">연애 상담</strong>
            <span className="mt-0.5 block truncate text-[11px] font-bold text-[#8A4B60]">익명 고민 상담</span>
          </span>
        </Link>

        <Link href="/community/relationship-coach" className="col-span-2 flex min-h-[82px] items-center gap-2.5 rounded-[8px] border border-[#F3C3D1] bg-[#FFF0F4] px-3 py-3 transition hover:border-[#BF5473] sm:col-span-1">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[7px] bg-white/75 text-[#BF5473]">
            <HeartHandshake size={18} />
          </span>
          <span className="min-w-0">
            <strong className="block text-sm font-black leading-5 text-[#702B42]">연애 코치</strong>
            <span className="mt-0.5 block truncate text-[11px] font-bold text-[#8A4B60]">대화 전 점검</span>
          </span>
          <ArrowRight size={15} className="ml-auto shrink-0 text-[#BF5473]" />
        </Link>
      </div>
    </section>
  )
}
