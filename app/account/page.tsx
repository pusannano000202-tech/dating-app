import Link from 'next/link'

import AccountDeletionStatus from '@/components/account/AccountDeletionStatus'

export default function AccountPage() {
  return (
    <main className="min-h-screen bg-boot-canvas px-4 py-8 text-boot-ink">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-black text-boot-info">QUANTUM ACCOUNT</p>
        <h1 className="mt-1 text-3xl font-black">계정과 정보</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">공개 안내를 확인하거나 계정 탈퇴를 요청할 수 있어요.</p>
        <div className="mt-7"><AccountDeletionStatus /></div>
        <nav className="mt-7 grid gap-3" aria-label="계정 메뉴">
          <AccountLink href="/privacy" title="개인정보 안내" />
          <AccountLink href="/terms" title="이용약관" />
          <AccountLink href="/account/delete" title="회원탈퇴·계정 삭제" danger />
        </nav>
      </div>
    </main>
  )
}

function AccountLink({ href, title, danger = false }: { href: string; title: string; danger?: boolean }) {
  return <Link href={href} className={`flex min-h-14 items-center justify-between rounded-xl border bg-white px-4 font-black ${danger ? 'border-[#F1B4AD] text-[#B44236]' : 'border-boot-hairline'}`}>{title}<span aria-hidden>›</span></Link>
}
