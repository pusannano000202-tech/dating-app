'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Crosshair, ClipboardList, Camera, Brain, CalendarDays, SlidersHorizontal, Check } from 'lucide-react'
import DestinyLogo from '@/components/DestinyLogo'

const CONFETTI = ['🎉', '✨', '🎊', '💜', '🌟', '💫', '🎈', '⭐']
const AUTO_REDIRECT_SECS = 5

// D-02 결정으로 self-worldcup(내 외모 스타일) 단계는 폐기되어 체크리스트에서 제외.
const COMPLETED_STEPS = [
  { label: '기본 정보',     Icon: ClipboardList,   color: 'text-indigo-400' },
  { label: '이상형 월드컵', Icon: Crosshair,       color: 'text-violet-400' },
  { label: '프로필 사진',   Icon: Camera,          color: 'text-pink-400' },
  { label: '성격 분석',     Icon: Brain,           color: 'text-purple-400' },
  { label: '가능 시간대',   Icon: CalendarDays,    color: 'text-violet-400' },
  { label: '이상형 가중치', Icon: SlidersHorizontal, color: 'text-fuchsia-400' },
]

export default function ProfileCompletePage() {
  const router = useRouter()
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number; delay: number; duration: number }[]>([])
  const [countdown, setCountdown] = useState(AUTO_REDIRECT_SECS)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    setParticles(
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        emoji: CONFETTI[i % CONFETTI.length],
        x: Math.random() * 100,
        delay: Math.random() * 2.5,
        duration: 2.5 + Math.random() * 2,
      }))
    )
  }, [])

  useEffect(() => {
    if (cancelled) return
    if (countdown <= 0) {
      router.push('/group/create')
      return
    }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [countdown, cancelled, router])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6 overflow-hidden relative">
      {/* 배경 glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[-25%] w-[600px] h-[600px] rounded-full bg-violet-600/30 blur-[140px]" />
        <div className="absolute bottom-[-15%] right-[-25%] w-[500px] h-[500px] rounded-full bg-fuchsia-700/25 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-rose-600/12 blur-[100px]" />
        <div className="absolute top-1/3 right-[10%] w-[200px] h-[200px] rounded-full bg-pink-600/10 blur-[70px]" />
      </div>

      {/* 파티클 */}
      {particles.map(({ id, emoji, x, delay, duration }) => (
        <span
          key={id}
          className="fixed top-0 text-2xl confetti-fall pointer-events-none select-none"
          style={{ left: `${x}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s` }}
        >
          {emoji}
        </span>
      ))}

      <div className="relative text-center w-full max-w-xs">
        {/* 아이콘 */}
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-[28px] bg-gradient-to-br from-violet-950 via-rose-950 to-amber-950 mb-6 shadow-2xl animate-pulse-glow border border-white/10">
          <DestinyLogo size={58} />
        </div>

        <h1 className="font-destiny text-3xl font-bold mb-1 gradient-brand-text">당신의 인연이<br/>완성되었습니다</h1>
        <p className="text-gray-400 text-sm mb-6 mt-1">이제 친구들이랑 팀을 만들어봐</p>

        {/* 완료 항목 체크리스트 */}
        <div className="glass-card rounded-2xl p-4 mb-6 text-left space-y-2.5">
          {COMPLETED_STEPS.map(({ label, Icon, color }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} strokeWidth={2} />
              <span className="text-sm text-gray-300 flex-1">{label}</span>
              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check className="w-3 h-3 text-green-400" strokeWidth={3} />
              </div>
            </div>
          ))}
        </div>

        {/* 카운트다운 */}
        {!cancelled && (
          <p className="text-sm text-gray-500 mb-4">
            <span className="text-violet-400 font-bold">{countdown}초</span> 후 자동으로 이동해요
          </p>
        )}

        {/* 버튼 그룹 */}
        <div className="space-y-3">
          <Link
            href="/group/create"
            className="btn-gradient w-full py-4 rounded-2xl font-bold text-lg text-center block shadow-lg shadow-violet-900/40"
          >
            그룹 만들기
          </Link>

          <Link
            href="/profile/edit"
            onClick={() => setCancelled(true)}
            className="w-full py-3 rounded-2xl text-sm text-gray-500 hover:text-gray-300 transition-colors underline underline-offset-2 text-center block"
          >
            프로필 수정하기
          </Link>
        </div>
      </div>
    </div>
  )
}
