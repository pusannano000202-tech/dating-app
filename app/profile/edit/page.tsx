'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { APPEARANCE_TYPE_INFO } from '@/lib/constants'
import type { AppearanceType, Gender } from '@/lib/types'

const EDIT_SECTIONS = [
  { href: '/profile/worldcup',      emoji: '🎯', title: '이상형 스타일', desc: '선호하는 외모 타입 다시 고르기' },
  { href: '/profile/self-worldcup', emoji: '🪞', title: '내 외모 스타일', desc: '자기유사 월드컵 다시 하기' },
  { href: '/profile/basic',         emoji: '📝', title: '기본 정보',      desc: '나이, 키, 학과 등 수정하기' },
  { href: '/profile/photos',   emoji: '📸', title: '사진',          desc: '프로필 사진 바꾸기' },
  { href: '/profile/survey',   emoji: '🧬', title: '성격 테스트',   desc: 'Big5 성격 테스트 다시 하기' },
  { href: '/profile/schedule', emoji: '🗓️', title: '가능한 시간대', desc: '과팅 가능한 요일/시간 수정' },
  { href: '/profile/preferences', emoji: '⚖️', title: '매칭 가중치', desc: '중요하게 보는 조건 조정하기' },
]

interface ProfileSummary {
  gender: Gender | null
  age: number | null
  school: string | null
  department: string | null
  appearance_type: AppearanceType | null
  photo_count: number
}

export default function ProfileEditPage() {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [summary, setSummary] = useState<ProfileSummary | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const [{ data: profile }, { count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('gender, age, school, department, appearance_type')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('photos')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ])
      if (profile) {
        setSummary({
          gender: profile.gender as Gender | null,
          age: profile.age,
          school: profile.school,
          department: profile.department,
          appearance_type: profile.appearance_type as AppearanceType | null,
          photo_count: count ?? 0,
        })
      }
    })
  }, [])

  async function handleReset() {
    setResetting(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      await supabase.from('profiles').delete().eq('user_id', user.id)
      await supabase.from('photos').delete().eq('user_id', user.id)
      router.push('/profile/worldcup')
    } catch {
      setResetting(false)
      setShowConfirm(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      {/* 배경 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/15 blur-[100px]" />
      </div>

      <div className="relative pt-6 mb-7 flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 glass rounded-xl">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-xl font-black">프로필 수정</h1>
          <p className="text-xs text-gray-500 mt-0.5">수정할 항목을 골라줘</p>
        </div>
      </div>

      {/* 프로필 요약 카드 — 로딩 중 스켈레톤 */}
      {!summary && (
        <div className="glass rounded-2xl p-4 mb-5 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-white/10 rounded w-3/4" />
              <div className="h-3 bg-white/5 rounded w-1/2" />
              <div className="flex gap-2 mt-1">
                <div className="h-4 bg-white/10 rounded-full w-20" />
                <div className="h-4 bg-white/5 rounded-full w-14" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 프로필 요약 카드 */}
      {summary && (
        <div className="relative glass rounded-2xl p-4 mb-5 border border-white/8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl gradient-brand flex items-center justify-center text-2xl flex-shrink-0">
              {summary.gender === 'male' ? '👨' : summary.gender === 'female' ? '👩' : '👤'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">
                {summary.gender === 'male' ? '남' : summary.gender === 'female' ? '여' : '?'}
                {summary.age != null ? ` · ${summary.age}세` : ''}
                {summary.school ? ` · ${summary.school}` : ''}
              </p>
              {summary.department && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">{summary.department}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {summary.appearance_type && (
                  <span className="text-[10px] bg-violet-500/20 text-violet-300 rounded-full px-2 py-0.5">
                    {APPEARANCE_TYPE_INFO[summary.appearance_type].label} 스타일 선호
                  </span>
                )}
                <span className="text-[10px] bg-white/10 text-gray-400 rounded-full px-2 py-0.5">
                  사진 {summary.photo_count}장
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative flex flex-col gap-3">
        {EDIT_SECTIONS.map(({ href, emoji, title, desc }) => (
          <Link
            key={href}
            href={href}
            className="glass rounded-2xl px-4 py-4 flex items-center gap-4 hover:border-violet-500/30 border border-white/5 transition-colors"
          >
            <span className="text-2xl w-10 text-center flex-shrink-0">{emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{title}</p>
              <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
            </div>
            <svg className="w-4 h-4 text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        ))}

        {/* 위험 구역 */}
        <div className="mt-4 pt-4 border-t border-white/5">
          {!showConfirm ? (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full py-3.5 rounded-2xl text-sm text-red-400 glass border border-red-500/20 hover:border-red-500/40 transition-colors"
            >
              프로필 초기화
            </button>
          ) : (
            <div className="glass rounded-2xl p-4 border border-red-500/30">
              <p className="text-sm font-bold text-red-400 mb-1">정말 초기화할 거야?</p>
              <p className="text-xs text-gray-500 mb-4">프로필 정보가 모두 삭제돼. 되돌릴 수 없어.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl glass text-sm font-medium"
                >
                  취소
                </button>
                <button
                  onClick={handleReset}
                  disabled={resetting}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-sm font-bold text-red-400 disabled:opacity-50"
                >
                  {resetting ? '초기화 중...' : '초기화'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
