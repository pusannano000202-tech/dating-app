'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CONFETTI = ['🎉', '✨', '🎊', '💜', '🌟']

export default function ProfileCompletePage() {
  const router = useRouter()
  const [particles, setParticles] = useState<{ id: number; emoji: string; x: number; delay: number }[]>([])

  useEffect(() => {
    setParticles(
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        emoji: CONFETTI[i % CONFETTI.length],
        x: Math.random() * 100,
        delay: Math.random() * 1.2,
      }))
    )
    // 3초 후 자동으로 그룹 생성 페이지로 이동
    const t = setTimeout(() => router.push('/group/create'), 3000)
    return () => clearTimeout(t)
  }, [router])

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white px-6 overflow-hidden relative">
      {/* 파티클 */}
      {particles.map(({ id, emoji, x, delay }) => (
        <span
          key={id}
          className="absolute top-0 text-2xl animate-bounce pointer-events-none select-none"
          style={{
            left: `${x}%`,
            animationDelay: `${delay}s`,
            animationDuration: `${1.5 + delay}s`,
          }}
        >
          {emoji}
        </span>
      ))}

      <div className="text-center">
        <div className="text-7xl mb-6">🎯</div>
        <h1 className="text-3xl font-black mb-2">프로필 완성!</h1>
        <p className="text-gray-400 mb-1">이제 친구들이랑 팀을 만들어봐</p>
        <p className="text-sm text-gray-600">잠시 후 자동으로 이동해요…</p>
      </div>

      <div className="mt-12 w-full max-w-xs flex flex-col gap-3">
        <Link
          href="/group/create"
          className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg text-center transition-colors"
        >
          그룹 만들기
        </Link>
      </div>
    </div>
  )
}
