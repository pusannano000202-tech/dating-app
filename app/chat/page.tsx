import Link from 'next/link'
import { ChevronRight, LockKeyhole, MessageCircle, Zap } from 'lucide-react'

export default function ChatHubPage() {
  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-8 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-8">
          <p className="text-sm font-bold text-boot-muted">확정된 매칭만 열려요</p>
          <h1 className="mt-1 text-3xl font-black leading-tight">채팅</h1>
        </header>

        <section className="booting-deep-card rounded-[30px] p-6">
          <div className="mb-10 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-white/60">오늘 열릴 수 있는 방</p>
              <h2 className="mt-2 text-2xl font-black text-white">매칭 채팅방</h2>
            </div>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-boot-primary to-boot-coral text-white">
              <MessageCircle size={24} />
            </span>
          </div>

          <p className="text-sm leading-6 text-white/65">
            상대팀과 약속이 확정되고 공개 조건이 맞으면 채팅방이 열려요. 지금은 확정 매칭 상세에서 채팅 진입 흐름을 확인할 수 있어요.
          </p>

          <Link
            href="/match/dev-match-1/chat"
            className="mt-6 flex h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-boot-ink"
          >
            확정 매칭 채팅 미리보기
            <ChevronRight size={16} />
          </Link>
        </section>

        <section className="mt-5 rounded-[30px] bg-white px-5 py-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <LockKeyhole size={18} />
            </span>
            <div>
              <h2 className="text-base font-black">아무 때나 열리지 않아요</h2>
              <p className="mt-1 text-sm leading-6 text-boot-muted">
                매칭 전에는 상대 정보와 연락 수단을 숨기고, 약속 조건이 맞을 때만 단계적으로 공개돼요.
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/match"
          className="mt-5 flex h-12 items-center justify-center gap-2 rounded-[24px] bg-boot-ink px-4 text-sm font-black text-white shadow-[0_14px_32px_rgba(23,20,18,0.18)]"
        >
          <Zap size={17} />
          매칭 현황으로 가기
        </Link>
      </div>
    </main>
  )
}
