import Link from 'next/link'
import { AlertTriangle, LogIn, MessageCircleMore, RefreshCw } from 'lucide-react'

import { getSafeServiceRecoveryDestination } from '@/lib/auth/service-unavailable'

type ServiceUnavailablePageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>
}

export default async function ServiceUnavailablePage({ searchParams }: ServiceUnavailablePageProps) {
  const params = await searchParams
  const rawReturnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo
  const returnTo = getSafeServiceRecoveryDestination(rawReturnTo)
  const isOfflineUi = process.env.NODE_ENV === 'development'
    && process.env.QUANTUM_LOCAL_RUNTIME_MODE === 'offline-ui'

  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-10 text-boot-ink">
      <section
        aria-labelledby="service-unavailable-title"
        className="mx-auto max-w-md overflow-hidden rounded-[28px] border border-boot-hairline bg-white shadow-[0_22px_60px_rgba(95,54,40,0.12)]"
      >
        <div className="border-b border-boot-hairline bg-[#FFF4EF] px-6 py-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-boot-coral shadow-sm">
            <AlertTriangle size={24} aria-hidden="true" />
          </span>
          <p className="mt-5 text-xs font-black text-boot-coral">요청한 화면은 열리지 않았어요</p>
          <h1 id="service-unavailable-title" className="mt-2 break-keep text-2xl font-black leading-tight">
            {isOfflineUi ? '지금은 공개 화면 검수 모드예요' : '로그인 서비스에 연결할 수 없어요'}
          </h1>
        </div>

        <div className="space-y-5 px-6 py-6">
          <p className="text-sm font-bold leading-6 text-boot-body">
            {isOfflineUi
              ? '현재 실행 모드는 공개 화면을 살펴보는 용도예요. 로그인·홈·저장 기능은 사용할 수 없어요.'
              : '인증을 사용할 수 없어 보호된 화면으로의 이동을 멈췄어요.'}
          </p>
          <p className="border-l-2 border-boot-coral bg-[#FFF9F6] px-4 py-3 text-xs font-bold leading-5 text-boot-muted">
            {isOfflineUi
              ? '계정으로 이용하려면 전용 로컬 로그인 서비스에 연결해서 앱을 다시 실행해야 해요. 지금은 커뮤니티를 둘러볼 수 있어요.'
              : '잠시 뒤 원래 화면을 다시 열거나, 커뮤니티 화면으로 이동해 볼 수 있어요.'}
          </p>

          {returnTo && !isOfflineUi && (
            <Link
              href={returnTo}
              prefetch={false}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-boot-primary px-4 text-sm font-black text-white shadow-sm"
            >
              <RefreshCw size={17} aria-hidden="true" />
              원래 화면 다시 열기
            </Link>
          )}

          <div className={`grid gap-2 ${isOfflineUi ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Link
              href="/community"
              prefetch={false}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-boot-hairline bg-white px-3 text-sm font-black text-boot-ink"
            >
              <MessageCircleMore size={17} aria-hidden="true" />
              커뮤니티 보기
            </Link>
            {!isOfflineUi && <Link
              href="/login"
              prefetch={false}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-boot-primary/30 bg-boot-soft px-3 text-sm font-black text-boot-primary"
            >
              <LogIn size={17} aria-hidden="true" />
              로그인 화면
            </Link>}
          </div>
        </div>
      </section>
    </main>
  )
}
