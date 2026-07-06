import Link from 'next/link'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { missions } from '@/lib/community/mock-data'

export default function MissionsPage() {
  return (
    <main className="min-h-screen booting-paper px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <Link href="/community" className="mb-5 inline-flex items-center gap-2 text-sm font-black text-boot-body">
          <ArrowLeft size={16} className="text-boot-primary" />
          커뮤니티로
        </Link>

        <section className="mb-4 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[var(--boot-card-shadow)]">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-boot-primary">Mission</p>
          <h1 className="mt-1 text-2xl font-black">오늘의 캠퍼스 미션</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">
            앱을 오래 세로로 훑는 대신, 짧은 할 일을 눌러 방을 오가도록 설계했어요.
          </p>
        </section>

        <section className="grid gap-3">
          {missions.map((mission) => (
            <Link
              key={mission.id}
              href={mission.href}
              className="flex items-center justify-between gap-3 rounded-[24px] border border-boot-primary/15 bg-white p-4 shadow-sm"
            >
              <span className="flex items-start gap-3">
                {mission.completed ? (
                  <CheckCircle2 size={21} className="mt-0.5 shrink-0 text-boot-primary" />
                ) : (
                  <Circle size={21} className="mt-0.5 shrink-0 text-boot-muted" />
                )}
                <span className="min-w-0">
                  <span className="block text-base font-black">{mission.title}</span>
                  <span className="mt-1 block text-sm font-bold leading-5 text-boot-muted">{mission.description}</span>
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-boot-primary" />
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
