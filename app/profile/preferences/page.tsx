'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PreferenceSliders from '@/components/profile/PreferenceSliders'
import { createClient } from '@/lib/supabase'
import type { PreferenceWeights } from '@/lib/types'

const DEFAULT_WEIGHTS: PreferenceWeights = {
  appearance:  0.25,
  personality: 0.25,
  height:      0.10,
  body_type:   0.10,
  school:      0.10,
  hobby:       0.10,
  time_fit:    0.10,
}

export default function PreferencesPage() {
  const router = useRouter()
  const [weights, setWeights] = useState<PreferenceWeights>(DEFAULT_WEIGHTS)
  const [initialWeights, setInitialWeights] = useState<PreferenceWeights | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('profiles')
        .select('preference_weights')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.preference_weights) {
            const w = data.preference_weights as PreferenceWeights
            setWeights(w)
            setInitialWeights(w)
          }
        })
    })
  }, [])

  const total = Math.round(Object.values(weights).reduce((s, v) => s + v, 0) * 100)

  async function handleComplete() {
    if (total !== 100 || saving) return
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { error: dbErr } = await supabase
        .from('profiles')
        .upsert(
          { user_id: user.id, preference_weights: weights, is_profile_complete: true },
          { onConflict: 'user_id' }
        )

      if (dbErr) throw dbErr
      router.push('/profile/complete')
    } catch {
      setError('저장 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">뭘 제일 중요하게 봐?</h1>
        <p className="text-sm text-gray-500 mt-1">슬라이더로 중요도 조절해봐. 자동으로 100%가 맞춰져.</p>
      </div>

      <PreferenceSliders
        key={initialWeights ? 'loaded' : 'default'}
        initialValue={initialWeights ?? undefined}
        onChange={setWeights}
      />

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}

      <div className="mt-auto pt-8">
        <button
          onClick={handleComplete}
          disabled={saving || total !== 100}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? '저장 중...' : '프로필 완성!'}
        </button>
        <p className="mt-3 text-xs text-gray-700 text-center">완성 후 그룹을 만들고 과팅을 신청할 수 있어</p>
      </div>
    </div>
  )
}
