'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Big5Survey, { type Big5Scores } from '@/components/profile/Big5Survey'
import { createClient } from '@/lib/supabase'

export default function SurveyPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleComplete(scores: Big5Scores) {
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { error: dbErr } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            big5_openness:           scores.openness,
            big5_conscientiousness:  scores.conscientiousness,
            big5_extraversion:       scores.extraversion,
            big5_agreeableness:      scores.agreeableness,
            big5_neuroticism:        scores.neuroticism,
          },
          { onConflict: 'user_id' }
        )
      if (dbErr) throw dbErr

      router.push('/profile/schedule')
    } catch {
      setError('저장 중 오류가 발생했어요. 다시 시도해줘.')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">성격 테스트</h1>
        <p className="text-sm text-gray-500 mt-1">나랑 잘 맞는 사람을 찾기 위한 5가지 성격 특성 테스트야.</p>
      </div>

      {saving ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">🧬</div>
            <p className="text-sm text-gray-400">분석 결과 저장 중...</p>
          </div>
        </div>
      ) : (
        <Big5Survey onComplete={handleComplete} />
      )}

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
