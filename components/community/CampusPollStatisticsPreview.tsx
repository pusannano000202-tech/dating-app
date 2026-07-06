'use client'

import Image from 'next/image'
import Link from 'next/link'
import { BarChart3, Search, ShieldCheck, Trophy, X } from 'lucide-react'

const MAX_COMPARE_SCOPES = 3

type PollTab = '우리학교' | '다른학교'
type PollAnswer = '부먹' | '찍먹'

type PollScope = {
  id: string
  label: string
  school: string
  department: string
  topic: string
  leader: PollAnswer
  rate: number
  sampleSize: number
  image: string
  searchText: string
}

const scopes: PollScope[] = [
  {
    id: 'pnu-all',
    label: '부산대 전체',
    school: '부산대',
    department: '전체',
    topic: '탕수육',
    leader: '찍먹',
    rate: 62,
    sampleSize: 128,
    image: '/daily-cards/debate/tangsuyuk-dip.png',
    searchText: '부산대 부산대학교 전체 찍먹 탕수육',
  },
  {
    id: 'pnu-cse',
    label: '부산대 컴퓨터공학부',
    school: '부산대',
    department: '컴퓨터공학부',
    topic: '탕수육',
    leader: '찍먹',
    rate: 68,
    sampleSize: 34,
    image: '/daily-cards/debate/tangsuyuk-dip.png',
    searchText: '부산대 부산대학교 컴퓨터공학부 컴공 찍먹 탕수육',
  },
  {
    id: 'pukyong-cse',
    label: '부경대 컴퓨터공학부',
    school: '부경대',
    department: '컴퓨터공학부',
    topic: '탕수육',
    leader: '부먹',
    rate: 54,
    sampleSize: 42,
    image: '/daily-cards/debate/tangsuyuk-pour.png',
    searchText: '부경대 부경대학교 컴퓨터공학부 컴공 부먹 탕수육',
  },
  {
    id: 'donga-cse',
    label: '동아대 컴퓨터공학부',
    school: '동아대',
    department: '컴퓨터공학부',
    topic: '탕수육',
    leader: '찍먹',
    rate: 56,
    sampleSize: 36,
    image: '/daily-cards/debate/tangsuyuk-dip.png',
    searchText: '동아대 동아대학교 컴퓨터공학부 컴공 찍먹 탕수육',
  },
  {
    id: 'pnu-business',
    label: '부산대 경영학과',
    school: '부산대',
    department: '경영학과',
    topic: '민초',
    leader: '찍먹',
    rate: 41,
    sampleSize: 29,
    image: '/daily-cards/debate/mint-choco-yes.png',
    searchText: '부산대 부산대학교 경영학과 민초 민트초코',
  },
  {
    id: 'pnu-philosophy',
    label: '부산대 철학과',
    school: '부산대',
    department: '철학과',
    topic: '표본 부족',
    leader: '찍먹',
    rate: 0,
    sampleSize: 18,
    image: '/daily-cards/debate/mint-choco-no.png',
    searchText: '부산대 부산대학교 철학과 표본 부족',
  },
]

const chips = ['컴퓨터공학부', '경영학과', '부경대', '동아대', '철학과']

export default function CampusPollStatisticsPreview({
  initialTab = '우리학교',
  answer,
  query = '',
}: {
  initialTab?: PollTab
  answer?: PollAnswer
  query?: string
}) {
  const focus = initialTab === '다른학교' ? 'university' : 'school'
  const normalizedQuery = query.trim().toLowerCase()
  const visibleScopes = scopes.filter((scope) => {
    const tabMatched = normalizedQuery || initialTab === '다른학교' || scope.school === '부산대'
    const queryMatched = !normalizedQuery || scope.searchText.toLowerCase().includes(normalizedQuery)
    return Boolean(tabMatched && queryMatched)
  })
  const selectedScopes = initialTab === '다른학교'
    ? [scopes[0], scopes[2], scopes[3]]
    : [scopes[0], scopes[1]]
  const answerImage = answer === '부먹'
    ? '/daily-cards/debate/tangsuyuk-pour.png'
    : '/daily-cards/debate/tangsuyuk-dip.png'

  return (
    <section className="grid gap-4" aria-labelledby="campus-poll-heading">
      <article className="rounded-[30px] border border-boot-primary/15 bg-white p-4 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
        <div className="grid grid-cols-[minmax(0,1fr)_88px] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Campus Poll</p>
            <h2 id="campus-poll-heading" className="mt-1 text-xl font-black text-boot-ink">
              탕수육은 부먹 vs 찍먹?
            </h2>
            <p className="mt-1 text-xs leading-5 text-boot-muted">
              개인 답변은 공개하지 않고, 학교/학과별 통계만 mock으로 보여줘요.
            </p>
          </div>
          <Image
            src={answerImage}
            alt="오늘의 논쟁 카드"
            width={88}
            height={88}
            className="h-[88px] w-[88px] rounded-3xl object-cover shadow-sm"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          {(['부먹', '찍먹'] as PollAnswer[]).map((item) => (
            <Link
              key={item}
              href={buildHref(focus, { answer: item, q: query })}
              aria-current={answer === item ? 'true' : undefined}
              className={[
                'rounded-2xl border px-3 py-3 text-center text-sm font-black transition',
                answer === item
                  ? 'border-boot-primary bg-boot-primary text-white'
                  : 'border-boot-hairline bg-white text-boot-ink hover:border-boot-primary/35',
              ].join(' ')}
            >
              {item}
            </Link>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-black">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">
            <ShieldCheck size={13} />
            개인 답변 비공개
          </span>
          <span className="rounded-full bg-boot-soft px-3 py-1.5 text-boot-body">
            {answer ? `내 답변 ${answer} 저장됨` : '답변하면 통계에 반영'}
          </span>
        </div>
      </article>

      <article className="rounded-[30px] border border-boot-hairline bg-white p-4 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
        <div className="mb-3 grid grid-cols-2 rounded-2xl bg-boot-soft p-1">
          <Link
            href={buildHref('school', { answer, q: '' })}
            className={[
              'rounded-xl px-3 py-2 text-center text-xs font-black transition',
              initialTab === '우리학교' ? 'bg-white text-boot-primary shadow-sm' : 'text-boot-muted',
            ].join(' ')}
          >
            우리학교
          </Link>
          <Link
            href={buildHref('university', { answer, q: '' })}
            className={[
              'rounded-xl px-3 py-2 text-center text-xs font-black transition',
              initialTab === '다른학교' ? 'bg-white text-boot-primary shadow-sm' : 'text-boot-muted',
            ].join(' ')}
          >
            다른학교
          </Link>
        </div>

        <form action="/community" method="get" className="mb-3 flex items-center gap-2 rounded-2xl border border-boot-hairline bg-white px-3 py-2">
          <input type="hidden" name="focus" value={focus} />
          {answer && <input type="hidden" name="answer" value={answer} />}
          <Search size={15} className="text-boot-muted" />
          <input
            name="q"
            defaultValue={query}
            placeholder="학교나 학과를 검색해보세요"
            className="min-w-0 flex-1 bg-transparent text-sm font-bold text-boot-ink outline-none placeholder:text-boot-muted"
          />
          <button type="submit" className="rounded-full bg-boot-ink px-3 py-1.5 text-xs font-black text-white">
            검색
          </button>
        </form>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {chips.map((chip) => (
            <Link
              key={chip}
              href={buildHref(chip.includes('대') ? 'university' : focus, { answer, q: chip })}
              className="shrink-0 rounded-full border border-boot-primary/15 bg-boot-soft px-3 py-2 text-xs font-black text-boot-body"
            >
              {chip}
            </Link>
          ))}
        </div>

        <div className="grid gap-2">
          {visibleScopes.map((scope) => {
            const selected = selectedScopes.some((selectedScope) => selectedScope.id === scope.id)
            const hidden = scope.sampleSize < 30
            return (
              <div
                key={scope.id}
                className={[
                  'grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-2 text-left',
                  selected ? 'border-boot-primary/40 bg-boot-soft' : 'border-boot-hairline bg-white',
                ].join(' ')}
              >
                <Image
                  src={scope.image}
                  alt={`${scope.label} 취향 통계`}
                  width={64}
                  height={64}
                  className="h-16 w-16 rounded-2xl object-cover"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-black text-boot-ink">{scope.label}</span>
                  <span className="mt-0.5 block text-[11px] font-bold text-boot-muted">
                    {hidden ? '아직 표본이 부족해요' : `${scope.topic} · ${scope.leader} ${scope.rate}%`}
                  </span>
                </span>
                <span className="text-xs font-black text-boot-primary">{selected ? '선택됨' : '상세'}</span>
              </div>
            )
          })}
        </div>
      </article>

      <article className="rounded-[30px] border border-boot-primary/15 bg-white p-4 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Compare</p>
            <h2 className="mt-1 text-xl font-black text-boot-ink">선택한 통계 비교</h2>
          </div>
          <span className="rounded-full bg-boot-soft px-3 py-1.5 text-xs font-black text-boot-body">
            {selectedScopes.length}/{MAX_COMPARE_SCOPES}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {selectedScopes.map((scope) => (
            <span
              key={scope.id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-boot-soft px-2.5 py-1.5 text-[11px] font-black text-boot-body"
            >
              <span className="min-w-0 truncate">{scope.label}</span>
              <X size={12} className="shrink-0 text-boot-muted" />
            </span>
          ))}
        </div>

        <div className="space-y-3 rounded-[24px] bg-boot-soft px-4 py-4">
          {selectedScopes.map((scope) => (
            <div key={scope.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-boot-ink">{scope.label}</span>
                <span className="text-boot-primary">{scope.leader} {scope.rate}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-gradient-to-r from-boot-primary to-boot-coral" style={{ width: `${scope.rate}%` }} />
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-[30px] border border-boot-hairline bg-white p-4 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
        <div className="mb-3 flex items-center gap-2">
          <Trophy size={18} className="text-boot-primary" />
          <h2 className="text-xl font-black text-boot-ink">이번 주 학과 랭킹</h2>
        </div>
        <div className="grid gap-2">
          {[
            ['1', '컴퓨터공학부', '찍먹 68%', '응답 34명'],
            ['2', '심리학과', '카공 72%', '응답 31명'],
            ['3', '경영학과', '민초 가능 41%', '응답 29명'],
          ].map(([rank, label, metric, meta]) => (
            <div key={rank} className="flex items-center gap-3 rounded-2xl bg-boot-soft px-3 py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-xs font-black text-boot-primary shadow-sm">
                {rank}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-boot-ink">{label}</p>
                <p className="text-[11px] font-bold text-boot-muted">{meta}</p>
              </div>
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-boot-body shadow-sm">
                {metric}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700">
          참여/응답 기반 랭킹만 보여줘요. 외모, 인기, 성적처럼 사람을 대상화하는 랭킹은 만들지 않아요.
        </p>
      </article>
    </section>
  )
}

function buildHref(
  focus: 'school' | 'university',
  params: { answer?: PollAnswer; q?: string },
): string {
  const searchParams = new URLSearchParams({ focus })
  if (params.answer) searchParams.set('answer', params.answer)
  if (params.q) searchParams.set('q', params.q)
  return `/community?${searchParams.toString()}`
}
