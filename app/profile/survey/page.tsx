'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Big5Survey, { type Big5Scores } from '@/components/profile/Big5Survey'
import Big5Result from '@/components/profile/Big5Result'
import { createClient } from '@/lib/supabase'

type Phase = 'survey' | 'result'

export default function SurveyPage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('survey')
  const [scores, setScores] = useState<Big5Scores | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 기존 점수가 있으면 바로 결과 화면으로 이동
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase
        .from('profiles')
        .select('big5_openness, big5_conscientiousness, big5_extraversion, big5_agreeableness, big5_neuroticism')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (
            data?.big5_openness != null &&
            data?.big5_conscientiousness != null &&
            data?.big5_extraversion != null &&
            data?.big5_agreeableness != null &&
            data?.big5_neuroticism != null
          ) {
            setScores({
              openness: data.big5_openness,
              conscientiousness: data.big5_conscientiousness,
              extraversion: data.big5_extraversion,
              agreeableness: data.big5_agreeableness,
              neuroticism: data.big5_neuroticism,
            })
            setPhase('result')
          }
          setLoaded(true)
        })
    })
  }, [])

  function handleSurveyComplete(s: Big5Scores) {
    setScores(s)
    setPhase('result')
  }

  async function handleConfirm() {
    if (!scores) return
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
        <p className="text-sm text-gray-500 mt-1">
          {phase === 'survey'
            ? '나랑 잘 맞는 사람을 찾기 위한 5가지 성격 특성 테스트야.'
            : '테스트 결과야. 매칭할 때 참고할게.'}
        </p>
      </div>

      {!loaded ? (
        <div className="flex flex-col gap-5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-white/5 rounded-2xl" />
          ))}
        </div>
      ) : phase === 'survey' ? (
        <Big5Survey onComplete={handleSurveyComplete} />
      ) : (
        <Big5Result
          scores={scores!}
          onNext={handleConfirm}
          saving={saving}
          onRetry={() => { setScores(null); setPhase('survey') }}
        />
      )}

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}
    </div>
  )
}
