import Link from 'next/link'
import { ArrowLeft, ArrowRight, MessageSquareText } from 'lucide-react'
import { reviewTags } from '@/lib/community/mock-data'

export default function ReviewsPage() {
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
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Review</p>
              <h1 className="mt-1 text-2xl font-black">만남 리뷰</h1>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <MessageSquareText size={18} />
            </span>
          </div>
          <p className="text-sm font-bold leading-6 text-boot-muted">
            자유서술보다 선택형 태그를 먼저 사용해요. 개인을 공개 평가하지 않고 운영 안전 신호로만 씁니다.
          </p>
        </section>

        <section className="mb-4 rounded-[26px] border border-boot-hairline bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-black">선택형 태그</h2>
          <div className="grid gap-2">
            {reviewTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-left text-sm font-black text-boot-body"
              >
                {tag}
              </button>
            ))}
          </div>
        </section>

        <div className="grid gap-2">
          <Link
            href="/community/manners"
            className="flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
          >
            <span>매너 상태로 돌아가기</span>
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/community/safety"
            className="flex items-center justify-between rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-sm font-black text-boot-body"
          >
            <span>리뷰 안전 기준</span>
            <ArrowRight size={16} className="text-boot-primary" />
          </Link>
        </div>
      </div>
    </main>
  )
}
