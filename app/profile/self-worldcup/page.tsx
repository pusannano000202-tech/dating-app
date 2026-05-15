'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AppearanceSelfWorldcup from '@/components/profile/AppearanceSelfWorldcup'
import SelfWorldcupResult from '@/components/profile/SelfWorldcupResult'
import { createClient } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/utils'
import type { Gender } from '@/lib/types'

export default function SelfWorldcupPage() {
  const router = useRouter()
  const [gender, setGender] = useState<Gender | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      // 개발 환경: gender 없으면 female로 기본값
      setGender('female')
      setLoaded(true)
      return
    }
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      supabase
        .from('profiles')
        .select('gender, self_appearance_score')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.gender) setGender(data.gender as Gender)
          if (data?.self_appearance_score != null) {
            // 이미 완료했으면 결과 화면 스킵하고 다음으로
            setScore(data.self_appearance_score as number)
          }
          setLoaded(true)
        })
    })
  }, [router])

  async function handleConfirm() {
    if (score === null || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      if (!isSupabaseConfigured()) {
        router.push('/profile/basic')
        return
      }
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { error } = await supabase
        .from('profiles')
        .upsert(
          { user_id: user.id, self_appearance_score: score },
          { onConflict: 'user_id' }
        )
      if (error) throw error

      router.push('/profile/basic')
    } catch {
      setSaveError('저장 중 오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  // 로딩 중 스켈레톤
  if (!loaded) {
    return (
      <div className="flex flex-col items-center min-h-screen px-4 py-6 animate-pulse">
        <div className="w-full max-w-md mb-6">
          <div className="flex justify-between mb-2">
            <div className="h-4 w-12 bg-white/10 rounded" />
            <div className="h-4 w-12 bg-white/10 rounded" />
          </div>
          <div className="h-1 bg-white/10 rounded-full mb-5" />
          <div className="h-7 w-52 bg-white/10 rounded mx-auto" />
        </div>
        <div className="w-full max-w-md flex gap-3">
          <div className="flex-1 rounded-3xl bg-white/5" style={{ aspectRatio: '3/4' }} />
          <div className="flex-1 rounded-3xl bg-white/5" style={{ aspectRatio: '3/4' }} />
        </div>
      </div>
    )
  }

  // gender를 못 불러온 경우 (비정상 상태)
  if (!gender) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-5 text-center">
        <p className="text-gray-400 mb-4">기본 정보를 먼저 입력해줘.</p>
        <button
          onClick={() => router.push('/profile/basic')}
          className="btn-gradient px-6 py-3 rounded-2xl font-bold text-sm"
        >
          기본 정보 입력하기
        </button>
      </div>
    )
  }

  if (score !== null) {
    return (
      <SelfWorldcupResult
        saving={saving}
        saveError={saveError}
        onConfirm={handleConfirm}
        onRetry={() => { setScore(null); setSaveError(null); setRetryKey((k) => k + 1) }}
      />
    )
  }

  return (
    <AppearanceSelfWorldcup
      key={retryKey}
      gender={gender}
      onComplete={setScore}
    />
  )
}
