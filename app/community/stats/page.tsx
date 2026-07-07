import Link from 'next/link'
import { ArrowLeft, ArrowRight, Search, ShieldCheck } from 'lucide-react'
import { getPublicStatsSummary, statSuggestions, statTopicCards } from '@/lib/community/mock-data'

export default function StatsPage() {
  const statsSummary = getPublicStatsSummary()

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Stats Room</p>
          <h1 className="mt-1 text-2xl font-black">학교나 학과 바로 검색</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            학교 전체, 우리 과, 다른 학교 같은 학과를 고르고 비교 화면으로 들어가요.
          </p>
          <form
            action="/community/stats/explore"
            method="get"
            className="mt-5 flex items-center gap-2 rounded-2xl border border-boot-hairline bg-boot-soft px-3 py-2"
          >
            <Search size={16} className="text-boot-muted" />
            <input
              name="q"
              placeholder="예: 컴퓨터공학부, 부산대, 민초"
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-boot-ink outline-none placeholder:text-boot-muted"
            />
            <button type="submit" className="rounded-full bg-boot-ink px-3 py-1.5 text-xs font-black text-white">
              검색
            </button>
          </form>
        </section>

        <section className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-boot-primary/15 bg-white px-3 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-boot-muted">Open</p>
            <p className="mt-1 text-lg font-black text-boot-primary">{statsSummary.publicScopeCount}개</p>
            <p className="mt-0.5 text-[11px] font-bold leading-4 text-boot-muted">공개 가능</p>
          </div>
          <div className="rounded-2xl border border-boot-primary/15 bg-white px-3 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-boot-muted">Waiting</p>
            <p className="mt-1 text-lg font-black text-boot-ink">{statsSummary.waitingScopeCount}개</p>
            <p className="mt-0.5 text-[11px] font-bold leading-4 text-boot-muted">표본 대기</p>
          </div>
          <div className="rounded-2xl border border-boot-primary/15 bg-white px-3 py-3 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-boot-muted">Safe</p>
            <p className="mt-1 text-lg font-black text-boot-ink">{statsSummary.minimumSampleSize}명</p>
            <p className="mt-0.5 text-[11px] font-bold leading-4 text-boot-muted">공개 기준</p>
          </div>
        </section>

        <section className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">취향 주제</h2>
            <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-boot-muted shadow-sm">
              3개까지 비교
            </span>
          </div>
          <div className="grid gap-3">
            {statTopicCards.map((topic) => (
              <Link
                key={topic.id}
                href={topic.href}
                className="rounded-[24px] border border-boot-primary/15 bg-white p-4 shadow-sm"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
                      {topic.metricLabel}
                    </p>
                    <h3 className="mt-1 text-base font-black">{topic.title}</h3>
                  </div>
                  <ArrowRight size={17} className="shrink-0 text-boot-primary" />
                </div>
                <p className="text-sm font-bold leading-6 text-boot-muted">{topic.description}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {topic.examples.map((example) => (
                    <span
                      key={example}
                      className="rounded-full bg-boot-soft px-2.5 py-1 text-[11px] font-black text-boot-body"
                    >
                      {example}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-4 flex items-start gap-3 rounded-[24px] border border-boot-primary/15 bg-white/90 px-4 py-3 shadow-sm">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
            <ShieldCheck size={17} />
          </span>
          <p className="text-xs font-bold leading-5 text-boot-muted">
            공개 기준은 최소 {statsSummary.minimumSampleSize}명입니다. 개인 답변, 외모, 인기, 성적 비교는 통계방에 올리지 않아요.
          </p>
        </section>

        <section className="grid gap-3">
          <h2 className="text-lg font-black">바로 비교</h2>
          {statSuggestions.map((suggestion) => (
            <Link
              key={suggestion.title}
              href={suggestion.href}
              className="flex items-center justify-between gap-3 rounded-[24px] border border-boot-primary/15 bg-white p-4 shadow-sm"
            >
              <span className="min-w-0">
                <span className="block text-base font-black">{suggestion.title}</span>
                <span className="mt-1 block text-sm font-bold text-boot-muted">{suggestion.description}</span>
              </span>
              <ArrowRight size={17} className="shrink-0 text-boot-primary" />
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
