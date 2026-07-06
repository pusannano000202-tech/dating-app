import Link from 'next/link'
import { ArrowLeft, ArrowRight, ShieldCheck, Trophy } from 'lucide-react'
import { rankingCards, type RankingCategory } from '@/lib/community/mock-data'

type RankingsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>
}

const categories: Array<{ key: RankingCategory | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'taste', label: '취향' },
  { key: 'participation', label: '참여' },
  { key: 'manner', label: '매너' },
  { key: 'mission', label: '미션' },
]

function getCategory(searchParams: RankingsPageProps['searchParams']): RankingCategory | 'all' {
  const value = searchParams?.category
  const category = Array.isArray(value) ? value[0] : value
  return categories.some((item) => item.key === category) ? (category as RankingCategory | 'all') : 'all'
}

export default function RankingsPage({ searchParams }: RankingsPageProps) {
  const selectedCategory = getCategory(searchParams)
  const visibleCards =
    selectedCategory === 'all' ? rankingCards : rankingCards.filter((card) => card.category === selectedCategory)

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Rankings</p>
              <h1 className="mt-1 text-2xl font-black">학과 랭킹 카드</h1>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <Trophy size={18} />
            </span>
          </div>
          <p className="text-sm font-bold leading-6 text-boot-muted">
            단순 인기투표가 아니라 취향, 참여, 매너, 미션 지표만 다룹니다. 외모나 인기도 기반 랭킹은 만들지 않아요.
          </p>
        </section>

        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="랭킹 카테고리">
          {categories.map((category) => {
            const active = category.key === selectedCategory
            return (
              <Link
                key={category.key}
                href={category.key === 'all' ? '/community/rankings' : `/community/rankings?category=${category.key}`}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${
                  active ? 'bg-boot-ink text-white' : 'border border-boot-hairline bg-white text-boot-body'
                }`}
              >
                {category.label}
              </Link>
            )
          })}
        </nav>

        <section className="grid gap-3">
          {visibleCards.map((card) => (
            <article key={card.id} className="rounded-[26px] border border-boot-primary/15 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black text-boot-primary">{card.season} · {card.metricLabel}</p>
                  <h2 className="mt-1 text-lg font-black leading-tight">{card.title}</h2>
                </div>
                <span className="rounded-full bg-boot-soft px-3 py-1 text-xs font-black text-boot-primary">TOP</span>
              </div>

              <div className="grid gap-2">
                {card.items.map((item) => (
                  <div key={`${card.id}-${item.rank}`} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-boot-soft px-3 py-2.5">
                    <span className="text-center text-sm font-black text-boot-primary">{item.rank}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black">{item.label}</span>
                      <span className="block text-xs font-bold text-boot-muted">{item.meta}</span>
                    </span>
                    <span className="text-sm font-black">{item.scoreLabel}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-start gap-2 rounded-2xl border border-boot-hairline px-3 py-2.5 text-xs font-bold leading-5 text-boot-muted">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-boot-primary" />
                <span>{card.safetyNotice}</span>
              </div>
            </article>
          ))}
        </section>

        <Link
          href="/community/safety"
          className="mt-4 flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
        >
          <span>랭킹 안전 기준 보기</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  )
}
