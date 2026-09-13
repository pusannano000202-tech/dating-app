import Link from 'next/link'
import {
  ArrowRight,
  Flame,
  HeartHandshake,
  Lightbulb,
  MessagesSquare,
} from 'lucide-react'

import { getCampusEatsSummary } from '@/lib/campus-eats/discovery'
import CampusEatsCategoryIcon from '@/components/campus-eats/CampusEatsCategoryIcon'

import {
  PNU_CAMPUS_EATS_CATEGORIES,
  type CampusEatsCategoryId,
} from '@/lib/campus-eats/fixtures/pnu-categories'

const CATEGORY_LINKS = [
  { id: 'donkatsu', href: '/community/campus-eats?mode=map&category=donkatsu&list=open' },
  { id: 'pizza', href: '/community/campus-eats?mode=map&category=pizza&list=open' },
  { id: 'chicken', href: '/community/campus-eats?mode=map&category=chicken&list=open' },
  { id: 'coffee-main', href: '/community/campus-eats?mode=map&category=coffee-main&list=open' },
  { id: 'coffee-north', href: '/community/campus-eats?mode=map&category=coffee-north&list=open' },
  { id: 'gukbap', href: '/community/campus-eats?mode=map&category=gukbap&list=open' },
  { id: 'milmyeon', href: '/community/campus-eats?mode=map&category=milmyeon&list=open' },
] satisfies ReadonlyArray<{ id: CampusEatsCategoryId; href: string }>

const categoriesById = new Map(
  PNU_CAMPUS_EATS_CATEGORIES.map((category) => [category.id, category]),
)

export default function CommunitySpotlight({ campusEatsEnabled = false }: { campusEatsEnabled?: boolean }) {
  const summary = getCampusEatsSummary(PNU_CAMPUS_EATS_CATEGORIES)
  return (
    <section className="grid gap-3 pb-5" aria-label="커뮤니티 바로가기">
      {campusEatsEnabled && <details className="overflow-hidden rounded-2xl border border-boot-hairline bg-white">
        <summary className="cursor-pointer px-4 py-4 text-sm font-bold text-boot-body focus-visible:outline-2 focus-visible:outline-boot-primary">
          음식별로 바로 고르기 <span className="ml-2 text-xs font-normal text-boot-muted">{summary.categoryCount}개 월드컵</span>
        </summary>
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 text-xs text-boot-muted">
          <span>{summary.storeCount}곳 등록 매장 · {summary.cardCount}장 대진 카드</span>
          <Link href="/community/campus-eats?mode=map&category=donkatsu&list=open" className="inline-flex min-h-11 items-center gap-1 font-bold text-boot-primary">지도에서 둘러보기 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <nav
          className="flex gap-2 overflow-x-auto border-t border-[#eadbd4] bg-[#f5e8df] px-4 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-6"
          aria-label="음식 월드컵 선택"
        >
          {CATEGORY_LINKS.map(({ id, href }) => {
            const category = categoriesById.get(id)
            if (!category) return null

            return (
              <Link
                key={id}
                href={href}
                className="flex min-h-11 shrink-0 items-center gap-2 rounded-[7px] border border-[#eadbd4] bg-white px-3 text-xs font-black text-[#514137] outline-none transition hover:border-[#B94B3F] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#B94B3F]"
              >
                <CampusEatsCategoryIcon categoryId={id} size={15} className="text-[#B94B3F]" />
                {category.label}
                <span className="text-[#77645b]">{category.candidates.length}</span>
              </Link>
            )
          })}
        </nav>
      </details>}

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
