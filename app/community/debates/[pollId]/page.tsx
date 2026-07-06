import Link from 'next/link'
import { ArrowLeft, ArrowRight, BarChart3, CheckCircle2 } from 'lucide-react'
import { findPollById } from '@/lib/community/mock-data'

type DebateDetailPageProps = {
  params: {
    pollId: string
  }
  searchParams?: Record<string, string | string[] | undefined>
}

function getParam(searchParams: DebateDetailPageProps['searchParams'], key: string): string {
  const value = searchParams?.[key]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default function DebateDetailPage({ params, searchParams }: DebateDetailPageProps) {
  const poll = findPollById(params.pollId)
  const answerKey = getParam(searchParams, 'answer')
  const selectedOption = poll.options.find((option) => option.key === answerKey)

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">{poll.title}</p>
          <h1 className="mt-2 text-2xl font-black leading-tight">{poll.prompt}</h1>
          <p className="mt-2 text-sm font-bold text-boot-muted">{poll.participantLabel}</p>

          <div className="mt-5 grid gap-2">
            {poll.options.map((option) => {
              const selected = option.key === selectedOption?.key
              return (
                <Link
                  key={option.key}
                  href={`/community/debates/${poll.id}?answer=${option.key}`}
                  className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-base font-black ${
                    selected
                      ? 'border-boot-primary bg-boot-primary text-white'
                      : 'border-boot-hairline bg-white text-boot-body'
                  }`}
                >
                  <span>{option.label}</span>
                  {selected ? <CheckCircle2 size={18} /> : <ArrowRight size={16} className="text-boot-primary" />}
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mb-4 rounded-[26px] border border-boot-hairline bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <BarChart3 size={18} />
            </span>
            <div>
              <h2 className="text-base font-black">{selectedOption ? '내 답변' : '답하면 우리학교 결과가 열려요'}</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">
                {selectedOption
                  ? `${selectedOption.label} 답변이 mock으로 선택됐어요. 실제 저장은 DB 연결 단계에서 붙입니다.`
                  : '아직 답변 전이에요. 답변 후 학교/학과별 통계와 비교 화면으로 이동할 수 있게 설계했어요.'}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-2">
          <Link
            href="/community/stats/explore?q=컴퓨터공학부&scope_ids=pnu,pnu-cse,pukyong-cse"
            className="flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
          >
            <span>다른 학교 비교</span>
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/community/debates"
            className="flex items-center justify-between rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-sm font-black text-boot-body"
          >
            <span>다른 논쟁 보기</span>
            <ArrowRight size={16} className="text-boot-primary" />
          </Link>
        </div>
      </div>
    </main>
  )
}
