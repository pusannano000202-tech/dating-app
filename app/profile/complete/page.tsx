'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CONFETTI = ['🎉', '✨', '🎊', '💜', '🌟', '💫', '🎈', '⭐']
const AUTO_REDIRECT_SECS = 5

const COMPLETED_STEPS = [
  { label: '이상형 월드컵', icon: '💘' },
  { label: '기본 정보', icon: '📋' },
  { label: '프로필 사진', icon: '📸' },
  { label: '성격 분석', icon: '🧠' },
  { label: '가능 시간대', icon: '🕐' },
  { label: '이상형 가중치', icon: '⚖️' },
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
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[500px] h-[500px] rounded-full bg-violet-600/25 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-20%] w-[400px] h-[400px] rounded-full bg-fuchsia-600/20 blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-rose-500/10 blur-[80px]" />
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
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl gradient-brand mb-6 shadow-2xl shadow-violet-900/50">
          <span className="text-5xl">🎯</span>
        </div>

        <h1 className="text-3xl font-black mb-2">프로필 완성!</h1>
        <p className="text-gray-400 mb-6">이제 친구들이랑 팀을 만들어봐</p>

        {/* 완료 항목 체크리스트 */}
        <div className="glass rounded-2xl p-4 mb-6 text-left space-y-2">
          {COMPLETED_STEPS.map(({ label, icon }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="text-lg">{icon}</span>
              <span className="text-sm text-gray-300 flex-1">{label}</span>
              <span className="text-green-400 text-sm font-bold">✓</span>
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
