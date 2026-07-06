import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { MIN_PUBLIC_SAMPLE_SIZE } from '@/lib/community/mock-data'

const policies = [
  '개인 답변은 공개하지 않고 학교/학과 단위 집계만 보여줍니다.',
  `학과별 통계는 최소 ${MIN_PUBLIC_SAMPLE_SIZE}명 이상일 때만 공개합니다.`,
  '성별별 통계는 초반에는 숨기고 운영 검토 뒤에만 고려합니다.',
  '외모, 인기, 성적, 특정 개인을 대상화하는 랭킹은 금지합니다.',
  '반복 답변, 자동화, 특정 학과 조롱을 유도하는 어뷰징은 제한합니다.',
]

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
          {policies.map((policy, index) => (
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
