import type { LegalDisclosure } from '@/lib/account/legal-disclosure'

export default function LegalDisclosureCard({ disclosure }: { disclosure: LegalDisclosure }) {
  return (
    <section className={`rounded-2xl border p-5 ${disclosure.publishable ? 'border-boot-hairline bg-white' : 'border-[#E8C46A] bg-[#FFF8E6]'}`} aria-labelledby="operator-heading">
      <h2 id="operator-heading" className="text-lg font-black">운영 주체·문의처</h2>
      {!disclosure.publishable ? (
        <p className="mt-2 text-sm font-black leading-6 text-[#755000]" role="status">
          운영자 정보가 아직 완전하지 않아 공개 서비스 출시 전 확정이 필요합니다.
        </p>
      ) : null}
      <dl className="mt-4 grid gap-3 text-sm">
        <Row label="운영 주체" value={disclosure.operatorName} />
        <Row label="주소" value={disclosure.operatorAddress} />
        <Row label="고객 문의" value={disclosure.operatorContact} />
        <Row label="개인정보 문의" value={disclosure.privacyContact} />
      </dl>
    </section>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[140px_1fr]">
      <dt className="font-black text-boot-muted">{label}</dt>
      <dd className="break-words font-bold">{value ?? '운영 환경 미설정'}</dd>
    </div>
  )
}
