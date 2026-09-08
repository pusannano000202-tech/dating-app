import ContinuationJoinConsentCard from '@/components/matching/ContinuationJoinConsentCard'

export default function ContinuationJoinProposalPage() {
  return (
    <main className="min-h-screen booting-paper px-4 pb-24 pt-6 text-boot-ink">
      <div className="mx-auto max-w-3xl space-y-5">
        <header>
          <p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">PRIVATE CONSENT</p>
          <h1 className="mt-1 text-3xl font-black">합류 요청 확인</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            나에게 온 요청만 보여요. 모든 참가자가 따로 동의해야 다음 만남에 합류할 수 있습니다.
          </p>
        </header>
        <ContinuationJoinConsentCard />
      </div>
    </main>
  )
}
