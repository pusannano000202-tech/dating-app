'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, MessageCircleMore, RefreshCw } from 'lucide-react'

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[ProfileError]', error)
  }, [error])

  return (
    <main className="grid min-h-screen place-items-center booting-paper px-5 pb-28 pt-10 text-boot-ink">
      <section aria-labelledby="profile-error-title" className="w-full max-w-md rounded-[28px] border border-boot-hairline bg-white p-6 shadow-[0_22px_60px_rgba(95,54,40,0.12)]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF0ED] text-boot-coral">
          <AlertTriangle size={24} aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-black text-boot-coral">프로필 화면 오류</p>
        <h1 id="profile-error-title" className="mt-2 text-2xl font-black">프로필 화면을 불러오지 못했어요</h1>
        <p className="mt-4 text-sm font-bold leading-6 text-boot-body">
          저장이 끝난 항목은 다시 연결한 뒤 확인할 수 있어요. 이 화면에서 아직 저장하지 않은 내용은 남지 않았을 수 있어요.
        </p>
        <p className="mt-2 text-xs font-bold leading-5 text-boot-muted">연결을 확인한 뒤 다시 시도해 주세요.</p>

        <div className="mt-7 flex flex-col gap-3">
          <button
            onClick={reset}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-boot-primary px-4 text-sm font-black text-white shadow-sm"
          >
            <RefreshCw size={17} aria-hidden="true" />
            다시 시도
          </button>
          <Link
            href="/community"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-boot-hairline bg-white px-4 text-sm font-black text-boot-ink"
          >
            <MessageCircleMore size={17} aria-hidden="true" />
            커뮤니티로 이동
          </Link>
        </div>
      </section>
    </main>
  )
}
