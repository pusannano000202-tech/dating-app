import { ArrowRight, ShieldCheck } from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'
import SchoolMascot from '@/components/theme/SchoolMascot'

type CommunityComingSoonProps = {
  kind: 'community' | 'meetups'
}

export default function CommunityComingSoon({ kind }: CommunityComingSoonProps) {
  const isMeetups = kind === 'meetups'
  const title = isMeetups ? '모임은 준비 중이에요' : '커뮤니티는 준비 중이에요'
  const description = isMeetups
    ? '안전한 모집과 참여 기준을 연결한 뒤 학교별 모임을 열 예정이에요.'
    : '게시글과 투표의 공개 범위, 신고 기준을 연결한 뒤 정식으로 열 예정이에요.'

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-8">
          <BootingLogo size="md" />
        </header>

        <section className="overflow-hidden rounded-[28px] border border-boot-primary/15 bg-white shadow-[0_18px_44px_rgba(23,20,18,0.08)]">
          <div className="grid grid-cols-[minmax(0,1fr)_112px] items-end gap-3 bg-boot-soft px-5 py-6">
            <div className="min-w-0">
              <p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">
                OPENING SOON
              </p>
              <h1 className="mt-2 text-2xl font-black leading-tight">{title}</h1>
              <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">{description}</p>
            </div>
            <SchoolMascot
              pose="guide"
              size="lg"
              className="h-28 w-28 rounded-[24px] border border-white/80 bg-white/90 shadow-[0_14px_28px_rgba(23,20,18,0.1)]"
            />
          </div>

          <div className="px-5 py-5">
            <div className="flex items-start gap-3 rounded-2xl border border-boot-hairline bg-white px-4 py-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-boot-primary" size={19} />
              <p className="text-xs font-bold leading-5 text-boot-muted">
                실제 참여 데이터와 운영 안전장치가 준비되기 전에는 신청이나 통계가 노출되지 않아요.
              </p>
            </div>

            <a
              href="/match"
              className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-boot-ink px-4 text-sm font-black text-white"
            >
              매칭으로 돌아가기
              <ArrowRight aria-hidden="true" size={16} />
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}
