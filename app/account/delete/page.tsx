import Link from 'next/link'

import AccountDeletionForm from '@/components/account/AccountDeletionForm'

export default function AccountDeletePage() {
  return (
    <main className="min-h-screen bg-boot-canvas px-4 py-8 text-boot-ink">
      <div className="mx-auto max-w-2xl">
        <Link href="/account" className="inline-flex min-h-11 items-center text-sm font-black text-boot-info">← 계정으로</Link>
        <h1 className="mt-3 text-3xl font-black">회원탈퇴·계정 삭제</h1>
        <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">오류로 삭제되지 않도록 최근 로그인과 확인 문구를 모두 확인합니다.</p>
        <div className="mt-7"><AccountDeletionForm /></div>
      </div>
    </main>
  )
}
