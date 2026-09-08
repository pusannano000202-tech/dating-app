import Link from 'next/link'

import LegalDisclosureCard from '@/components/account/LegalDisclosureCard'
import { readLegalDisclosure } from '@/lib/account/legal-disclosure'

export default function TermsPage() {
  const disclosure = readLegalDisclosure()
  return (
    <main className="min-h-screen bg-boot-canvas px-4 py-8 text-boot-ink">
      <article className="mx-auto max-w-3xl">
        <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-black text-boot-info">← 계정으로</Link>
        <p className="mt-3 text-xs font-black text-boot-info">TERMS OF USE</p>
        <h1 className="mt-1 text-3xl font-black">이용약관</h1>
        <p className="mt-3 rounded-xl border border-[#E8C46A] bg-[#FFF8E6] p-4 text-sm font-bold leading-6 text-[#755000]">
          이 페이지는 구현 기준 초안이며 법률 준수 완료를 의미하지 않습니다. 서비스 오픈 전 운영 주체·문의처·분쟁 처리·부가 유료 조건을 실제 운영과 맞춰 확정해야 합니다.
        </p>
        <div className="mt-7 space-y-7 text-sm font-bold leading-7 text-boot-muted">
          <Section title="1. 서비스 범위">
            Quantum은 학교 기반 커뮤니티, 자발적 모임, 친구 메시지, 보이스, 만남·후속 일정 기능을 제공합니다. 학과·방 가입이 자동 친구 추가를 뜻하지 않으며, 친구 연결은 초대·요청과 수락에 따릅니다.
          </Section>
          <Section title="2. 이용자 약속">
            타인 사칭, 강요된 연락처·사진 공개, 대화 녹음·배포, 협박·희롱·혜오, 스팸, 인증·결제 우회를 해서는 안 됩니다. 보이스 마이크는 통화 화면에서 이용자가 직접 켜야 합니다.
          </Section>
          <Section title="3. 신고·차단·제한">
            신고된 콘텐츠나 이용 패턴은 운영 검토 대상이 될 수 있고, 위험 또는 반복 위반이 확인되면 기능 이용이 제한될 수 있습니다. 긴급한 위험은 앱 신고만으로 대체하지 말고 112·119 등 적절한 기관에 연락해야 합니다.
          </Section>
          <Section title="4. 탈퇴·데이터">
            탈퇴 요청 후에는 앱 접근을 즉시 중지하고, 저장 파일 삭제·보관 게이트를 통과한 뒤 인증 계정 삭제를 시도합니다. 분쟁·결제·법적 의무에 필요한 기록은 정해진 범위와 기간에만 분리 보관되어야 합니다.
          </Section>
        </div>
        <div className="mt-8"><LegalDisclosureCard disclosure={disclosure} /></div>
      </article>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="text-lg font-black text-boot-ink">{title}</h2><p className="mt-2">{children}</p></section>
}
