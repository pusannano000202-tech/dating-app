import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck, Star } from 'lucide-react'
import { mannerSummary } from '@/lib/community/mock-data'

export default function MannersPage() {
  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Trust</p>
              <h1 className="mt-1 text-2xl font-black">내 매너 상태</h1>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <Star size={18} />
            </span>
          </div>
          <div className="rounded-2xl bg-boot-soft p-4">
            <p className="text-sm font-bold text-boot-muted">현재 상태</p>
            <p className="mt-1 text-2xl font-black">{mannerSummary.statusLabel}</p>
            <p className="mt-2 text-sm font-bold text-boot-muted">
              리뷰 {mannerSummary.reviewCount}건 · 작성 대기 {mannerSummary.pendingReviews}건
            </p>
          </div>
        </section>

        <section className="mb-4 grid gap-2">
          {mannerSummary.scoreBands.map((band) => (
            <div key={band.label} className="flex items-center justify-between rounded-2xl border border-boot-hairline bg-white px-4 py-3 shadow-sm">
              <span className="inline-flex items-center gap-2 text-sm font-black text-boot-body">
                <CheckCircle2 size={16} className="text-boot-primary" />
                {band.label}
              </span>
              <span className="text-sm font-black text-boot-primary">{band.value}</span>
            </div>
          ))}
        </section>

        <section className="mb-4 rounded-[26px] border border-boot-hairline bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="text-base font-black">개인 매너 점수는 본인에게만</h2>
              <p className="mt-1 text-sm font-bold leading-6 text-boot-muted">
                {mannerSummary.privacyNotice} 학과 랭킹에는 충분한 표본의 완료율과 참여율만 익명 집계합니다.
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/community/reviews"
          className="flex items-center justify-between rounded-2xl bg-boot-ink px-4 py-3.5 text-sm font-black text-white shadow-[0_12px_26px_rgba(23,20,18,0.18)]"
        >
          <span>리뷰 작성하러 가기</span>
          <ArrowRight size={16} />
        </Link>
      </div>
    </main>
  )
}
