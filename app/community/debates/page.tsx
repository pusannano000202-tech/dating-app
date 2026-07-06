import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, MessageCircleQuestion } from 'lucide-react'
import { allDebates, todayDebate } from '@/lib/community/mock-data'

export default function DebatesPage() {
  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 overflow-hidden rounded-[30px] border border-boot-primary/15 bg-white shadow-[var(--boot-card-shadow)]">
          <div className="grid grid-cols-[minmax(0,1fr)_104px] gap-3 p-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">
                Debate Room
              </p>
              <h1 className="mt-1 text-2xl font-black">오늘의 논쟁</h1>
              <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
                하나만 답하고 결과를 열어요. 개인 답변은 공개하지 않고 학교/학과 통계만 보여줘요.
              </p>
            </div>
            <Image
              src="/daily-cards/debate/tangsuyuk-pour.png"
              alt="논쟁 카드"
              width={104}
              height={104}
              className="h-[104px] w-[104px] rounded-[26px] object-cover shadow-sm"
            />
          </div>
        </section>

        <section className="grid gap-3">
          {allDebates.map((poll) => (
            <Link
              key={poll.id}
              href={poll.href}
              className="rounded-[26px] border border-boot-primary/15 bg-white p-4 shadow-sm transition hover:border-boot-primary/35"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-boot-soft px-3 py-1 text-[11px] font-black text-boot-primary">
                  <MessageCircleQuestion size={13} />
                  {poll.category}
                </span>
                <span className="text-[11px] font-black text-boot-muted">{poll.participantLabel}</span>
              </div>
              <h2 className="text-lg font-black">{poll.prompt}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {poll.options.map((option) => (
                  <span key={option.key} className="rounded-2xl border border-boot-hairline px-3 py-2 text-center text-sm font-black">
                    {option.label}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm font-black text-boot-primary">
                <span>{poll.id === todayDebate.id ? '오늘 먼저 답하기' : '보너스 답하기'}</span>
                <ArrowRight size={16} />
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
