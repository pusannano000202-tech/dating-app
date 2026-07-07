import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { communityPolicies } from '@/lib/community/mock-data'

export default function SafetyPage() {
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
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Safety</p>
              <h1 className="mt-1 text-2xl font-black">커뮤니티 안전 기준</h1>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <ShieldCheck size={18} />
            </span>
          </div>
          <p className="text-sm font-bold leading-6 text-boot-muted">
            재미있는 비교는 열어두되, 조롱과 개인정보 역추적이 생기지 않도록 공개 조건을 강하게 둡니다.
          </p>
        </section>

        <section className="grid gap-2">
          {communityPolicies.map((policy, index) => (
            <div key={policy} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-3 rounded-2xl border border-boot-hairline bg-white px-4 py-3 shadow-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-boot-soft text-sm font-black text-boot-primary">
                {index + 1}
              </span>
              <p className="text-sm font-bold leading-6 text-boot-body">{policy}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
