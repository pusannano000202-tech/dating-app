import ChemiRing from '@/components/matching/ChemiRing'

type MatchFoundSummaryProps = {
  score?: number
  department?: string
  ageRange?: string
  genderSummary?: string
  lockedMessage?: string
  title?: string
  subtitle?: string
  className?: string
}

export default function MatchFoundSummary({
  score = 70,
  department = '경영학과',
  ageRange = '20~23세',
  genderSummary = '여 0명 · 남 0명',
  lockedMessage = '날짜를 정하고 만남 전까지 하루씩 Q&A로 알아가요.',
  title = '매칭됐어요!',
  subtitle = '딱 맞는 팀을 찾았어요',
  className = '',
}: MatchFoundSummaryProps) {
  return (
    <section className={['text-center', className].filter(Boolean).join(' ')}>
      <p className="mb-5 text-xs font-black uppercase tracking-[0.35em] text-boot-coral">MATCH FOUND</p>
      <ChemiRing score={score} size="lg" className="mx-auto mb-8" />
      <h1 className="text-3xl font-black leading-tight text-boot-ink">{title}</h1>
      <p className="mt-3 text-sm font-bold text-boot-muted">{subtitle}</p>

      <div className="mt-9 space-y-4 text-left">
        <InfoPill label="학과" value={department} />
        <InfoPill label="나이대" value={ageRange} />
        <InfoPill label="성별 구성" value={genderSummary} />
        <div className="rounded-[26px] bg-white px-5 py-5 shadow-[0_14px_34px_rgba(23,20,18,0.08)]">
          <p className="text-base font-black text-boot-ink">상대팀 이름은 아직 비공개예요</p>
          <p className="mt-2 text-sm leading-6 text-boot-muted">{lockedMessage}</p>
        </div>
      </div>
    </section>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-[76px] items-center justify-between gap-4 rounded-[26px] bg-white px-5 py-4 shadow-[0_12px_30px_rgba(23,20,18,0.08)]">
      <span className="text-sm font-black text-boot-muted">{label}</span>
      <span className="text-lg font-black text-boot-ink">{value}</span>
    </div>
  )
}
