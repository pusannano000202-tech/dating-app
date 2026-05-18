'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import IdealWorldcup from '@/components/profile/IdealWorldcup'
import IdealWorldcupResult from '@/components/profile/IdealWorldcupResult'
import { createClient } from '@/lib/supabase'
import { loadIdealMetadata, type IdealMetadata } from '@/lib/appearance/metadata'
import type { PreferenceResult } from '@/lib/appearance/preference'
import { legacyTypeFromBucketWeights } from '@/lib/appearance/bucket-to-legacy'
import type { Gender } from '@/lib/types'

// sessionStorage 키 (DB 컬럼 추가 전까지의 임시 저장소)
const SESSION_KEY = 'ideal_worldcup_preference_v1'

export default function WorldcupPage() {
  const router = useRouter()
  const [metadata, setMetadata] = useState<IdealMetadata | null>(null)
  const [gender, setGender] = useState<Gender | null>(null)
  const [result, setResult] = useState<PreferenceResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [key, setKey] = useState(0)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) setLoaded(true)
          return
        }

        // gender 조회 — 이상형 월드컵은 이성 풀에서 고르므로 반대 성별 풀 사용
        const { data: profile } = await supabase
          .from('profiles')
          .select('gender, appearance_type')
          .eq('user_id', user.id)
          .single()

        const userGender: Gender | null = (profile?.gender as Gender) ?? null
        if (cancelled) return
        if (!userGender) {
          setLoadError('성별 정보를 먼저 입력해줘.')
          setLoaded(true)
          return
        }
        setGender(userGender)

        // METADATA 로드
        const meta = await loadIdealMetadata()
        if (cancelled) return
        setMetadata(meta)
        setLoaded(true)
      } catch (e) {
        if (cancelled) return
        setLoadError('월드컵 데이터를 불러오지 못했어. 잠시 후 다시 시도해줘.')
        setLoaded(true)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleConfirm() {
    if (!result || !gender || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      // 임시: sessionStorage 에 저장 (DB 컬럼 추가 전까지)
      // TODO(성준 리뷰 후 마이그레이션 추가): profiles 테이블에 아래 컬럼 추가
      //   - preferred_appearance_vector        jsonb
      //   - preferred_appearance_delta_vector  jsonb
      //   - preferred_choice_delta_vector      jsonb
      //   - preferred_score_range              jsonb
      //   - preferred_bucket_weights           jsonb
      //   - worldcup_pool_mean_vector          jsonb
      //   - worldcup_choice_logs               jsonb
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
      } catch {
        // sessionStorage 미지원 환경은 조용히 무시
      }

      // 기존 appearance_type 컬럼 호환 (INTERFACE_CONTRACT 6 enum)
      const legacyType = legacyTypeFromBucketWeights(
        result.meta.gender,
        result.preferred_bucket_weights,
      )

      if (legacyType) {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            { user_id: user.id, appearance_type: legacyType },
            { onConflict: 'user_id' },
          )
        if (error) throw error
      }

      router.push('/profile/self-worldcup')
    } catch {
      setSaveError('저장 중 오류가 발생했어. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  function handleRetry() {
    setResult(null)
    setSaveError(null)
    try {
      sessionStorage.removeItem(SESSION_KEY)
    } catch {}
    setKey((k) => k + 1)
  }

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

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-center text-gray-300 text-sm leading-relaxed">{loadError}</p>
        <button
          onClick={() => router.push('/profile/basic')}
          className="mt-6 btn-gradient py-3 px-6 rounded-2xl font-bold text-sm"
        >
          기본정보로 가기
        </button>
      </div>
    )
  }

  if (!metadata || !gender) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-center text-gray-300 text-sm">월드컵을 준비할 수 없어.</p>
      </div>
    )
  }

  if (result) {
    return (
      <IdealWorldcupResult
        result={result}
        saving={saving}
        saveError={saveError}
        onConfirm={handleConfirm}
        onRetry={handleRetry}
      />
    )
  }

  // 이성 풀에서 골라야 하므로 반대 성별로 전달
  const oppositeGender: Gender = gender === 'male' ? 'female' : 'male'

  return (
    <IdealWorldcup
      key={key}
      metadata={metadata}
      gender={oppositeGender}
      onComplete={setResult}
    />
  )
}
