'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import IdealWorldcup from '@/components/profile/IdealWorldcup'
import IdealWorldcupResult from '@/components/profile/IdealWorldcupResult'
import { createClient } from '@/lib/supabase'
import { loadIdealMetadata, type IdealMetadata } from '@/lib/appearance/metadata'
import type { PreferenceResult } from '@/lib/appearance/preference'
import { legacyTypeFromBucketWeights } from '@/lib/appearance/bucket-to-legacy'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import { normalizeGender, oppositeGenderForWorldcup } from '@/lib/gender'
import { readDevBasicProfileGender } from '@/lib/profile/dev-basic-profile'
import { isSupabaseConfigured } from '@/lib/utils'
import type { Gender } from '@/lib/types'

// 개발 환경(Supabase 미설정)용 폴백 저장소
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
        if (!isSupabaseConfigured() || isDevPreviewClientSession()) {
          const meta = await loadIdealMetadata()
          if (cancelled) return
          const savedGender = readDevBasicProfileGender()
          if (!savedGender) {
            setLoadError('기본정보에서 성별을 먼저 저장해줘.')
            setMetadata(meta)
            setLoaded(true)
            return
          }
          setMetadata(meta)
          setGender(savedGender)
          setLoaded(true)
          return
        }

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          if (!cancelled) router.push('/login')
          return
        }

        // gender 조회 — 이상형 월드컵은 이성 풀에서 고르므로 반대 성별 풀 사용
        const { data: profile } = await supabase
          .from('profiles')
          .select('gender, appearance_type')
          .eq('user_id', user.id)
          .single()

        const userGender = normalizeGender(profile?.gender)
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
  }, [router])

  async function handleConfirm() {
    if (!result || !gender || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      if (!isSupabaseConfigured() || isDevPreviewClientSession()) {
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
        } catch {
          // sessionStorage 미지원 환경은 조용히 무시
        }
        router.push('/profile/survey')
        return
      }

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (isDevPreviewClientSession()) {
          try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(result))
          } catch {}
          router.push('/profile/survey')
          return
        }
        router.push('/login')
        return
      }

      // 기존 appearance_type 컬럼 호환 (INTERFACE_CONTRACT 6 enum)
      const legacyType = legacyTypeFromBucketWeights(
        result.meta.gender,
        result.preferred_bucket_weights,
      )

      // 마이그레이션 20260521_profile_add_preference_vectors.sql 에 정의된 컬럼들에
      // 월드컵 결과 영속 저장 (D-09 결정).
      const profileUpdate: Record<string, unknown> = {
        user_id: user.id,
        preferred_appearance_vector: result.preferred_appearance_vector,
        preferred_appearance_delta_vector: result.preferred_appearance_delta_vector,
        preferred_choice_delta_vector: result.preferred_choice_delta_vector,
        preferred_axis_percentile_vector: result.preferred_axis_percentile_vector,
        preferred_axis_z_vector: result.preferred_axis_z_vector,
        preferred_score_range: result.preferred_score_range,
        preferred_bucket_weights: result.preferred_bucket_weights,
        worldcup_pool_mean_vector: result.worldcup_pool_mean_vector,
        worldcup_pool_axis_stats: result.pool_axis_stats,
        worldcup_completed_at: new Date().toISOString(),
      }
      if (legacyType) {
        profileUpdate.appearance_type = legacyType
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileUpdate, { onConflict: 'user_id' })
      if (profileError) throw profileError

      // worldcup_choice_logs 에 라운드별 선택 기록 batch insert
      // 매칭 엔진 디버깅 + 향후 ML 학습 데이터용. 사용자 노출 금지.
      if (result.choice_logs.length > 0) {
        const worldcupSessionId = crypto.randomUUID()
        const logRows = result.choice_logs.map((log) => ({
          user_id: user.id,
          worldcup_session_id: worldcupSessionId,
          round: log.round,
          match_index: log.match_index,
          winner_id: log.winner_id,
          loser_id: log.loser_id,
          winner_vector: log.winner_vector,
          loser_vector: log.loser_vector,
          choice_delta_vector: log.choice_delta_vector,
          weight: log.weight,
        }))
        const { error: logError } = await supabase
          .from('worldcup_choice_logs')
          .insert(logRows)
        if (logError) {
          // 로그 실패는 매칭에 치명적이지 않으므로 경고만 남기고 계속 진행
          console.warn('worldcup_choice_logs insert failed', logError)
        }
      }

      // 개발 환경 복귀시 디버깅 폴백
      try {
        sessionStorage.removeItem(SESSION_KEY)
      } catch {}

      router.push('/profile/survey')
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
  const oppositeGender = oppositeGenderForWorldcup(gender)
  if (!oppositeGender) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <p className="text-center text-gray-300 text-sm">성별 정보를 다시 확인해줘.</p>
      </div>
    )
  }

  return (
    <IdealWorldcup
      key={key}
      metadata={metadata}
      gender={oppositeGender}
      onComplete={setResult}
    />
  )
}
