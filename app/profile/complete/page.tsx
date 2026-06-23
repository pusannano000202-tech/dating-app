'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Brain, Camera, Check, ClipboardList, Crosshair, Home, Search } from 'lucide-react'
import BootingLogo from '@/components/BootingLogo'

const AUTO_REDIRECT_SECS = 5

const COMPLETED_STEPS = [
  { label: '기본 정보', Icon: ClipboardList, color: 'text-sky-600' },
  { label: '이상형 월드컵', Icon: Crosshair, color: 'text-boot-primary' },
  { label: '성향 질문', Icon: Brain, color: 'text-emerald-700' },
  { label: '사진 업로드', Icon: Camera, color: 'text-boot-coral' },
]

export default function ProfileCompletePage() {
  const router = useRouter()
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECS)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (cancelled) return
    if (countdown <= 0) {
      router.push('/')
      return
    }

    const timer = setTimeout(() => setCountdown((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown, cancelled, router])

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden booting-band px-6 text-boot-ink">
      <section className="w-full max-w-xs text-center">
        <div className="mb-6 flex justify-center">
          <BootingLogo size="lg" />
        </div>

        <h1 className="mb-1 text-3xl font-black text-boot-ink">프로필 준비 완료</h1>
        <p className="mb-6 mt-1 text-sm leading-6 text-boot-muted">
          이제 홈에서 친구를 추가하거나 매칭찾기를 시작할 수 있어요.
        </p>

        <div className="glass-card mb-6 space-y-2.5 rounded-2xl border border-boot-hairline p-4 text-left">
          {COMPLETED_STEPS.map(({ label, Icon, color }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className={`h-4 w-4 flex-shrink-0 ${color}`} strokeWidth={2} />
              <span className="flex-1 text-sm text-boot-body">{label}</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20">
                <Check className="h-3 w-3 text-green-700" strokeWidth={3} />
              </span>
            </div>
          ))}
        </div>

        {!cancelled && (
          <p className="mb-4 text-sm text-boot-muted">
            <span className="font-bold text-boot-primary">{countdown}초</span> 뒤 홈으로 이동해요
          </p>
        )}

        <div className="space-y-3">
          <Link
            href="/"
            className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-center text-lg font-bold shadow-sm"
          >
            <Home size={18} />
            홈으로 가기
          </Link>

          <Link
            href="/match/start"
            onClick={() => setCancelled(true)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-boot-hairline bg-white/85 py-3 text-center text-sm font-bold text-boot-primary transition-colors hover:border-boot-primary/30"
          >
            <Search size={16} />
            매칭찾기 준비하기
          </Link>
        </div>
      </section>
    </main>
  )
}

