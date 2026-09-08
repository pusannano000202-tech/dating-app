import Link from 'next/link'

import LegalDisclosureCard from '@/components/account/LegalDisclosureCard'
import { readLegalDisclosure } from '@/lib/account/legal-disclosure'

export default function PrivacyPage() {
  const disclosure = readLegalDisclosure()
  return (
    <main className="min-h-screen bg-boot-canvas px-4 py-8 text-boot-ink">
      <article className="mx-auto max-w-3xl">
        <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-black text-boot-info">← 계정으로</Link>
        <p className="mt-3 text-xs font-black text-boot-info">PRIVACY NOTICE</p>
        <h1 className="mt-1 text-3xl font-black">개인정보 처리 안내</h1>
        <p className="mt-3 rounded-xl border border-[#E8C46A] bg-[#FFF8E6] p-4 text-sm font-bold leading-6 text-[#755000]">
          이 페이지는 구현 기준 초안이며 법률 준수 완료를 의미하지 않습니다. 공개 전에 실제 운영 주체, 연락처, 보관 기간, 처리 위탁사를 실제 계약과 맞춰 다시 검토해야 합니다.
        </p>

        <div className="mt-7 space-y-7 text-sm font-bold leading-7 text-boot-muted">
          <Section title="1. 처리하는 정보">
            계정 인증 정보, 공개 별칭, 비공개 친구 인식명, 학교·학과, 모임·메시지·보이스 이용 기록, 사진, 신고·차단, 결제·환불 처리 기록이 기능별로 처리될 수 있습니다. 비공개 친구 인식명은 초대 상대와 수락한 친구 범위 밖 커뮤니티·랜덤 상대에게 공개하지 않습니다.
          </Section>
          <Section title="2. 이용 목적과 보관">
            가입·친구 연결·커뮤니티·모임·안전·결제 기능 제공과 분쟁 대응에 필요한 범위로 사용합니다. 일반 앨범 파일은 표시된 만료 시점 후 물리 삭제 대기열에 들어가고 실패하면 재시도합니다. 분쟁 보전·결제·법적 의무 기록은 별도 근거와 기간을 확정한 후 분리 보관해야 합니다.
          </Section>
          <Section title="3. 탈퇴와 권리 행사">
            계정 페이지에서 탈퇴를 요청할 수 있습니다. 요청이 접수되면 친구 인식명·신규 메시지·보이스 접근을 먼저 차단하고, 저장 파일 삭제와 필수 보관 확인 후 인증 계정 삭제를 재시도합니다. 열람·정정·처리정지 문의는 아래 개인정보 문의처를 이용해 주세요.
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
