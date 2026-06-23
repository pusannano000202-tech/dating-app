'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PersonalityPreferenceResult from '@/components/profile/PersonalityPreferenceResult'
import PersonalityPreferenceSurvey from '@/components/profile/PersonalityPreferenceSurvey'
import {
  buildPersonalityPreferenceProfile,
  buildPersonalityPreferenceStoragePayload,
  type PersonalityPreferenceAnswer,
  type PersonalityPreferenceAxis,
  type PersonalityPreferenceProfile,
} from '@/lib/matching/personality-preference'
import type { Big5Vector } from '@/lib/matching/types'
import { getSafeClientRedirect } from '@/lib/client-redirect'
import { markDevMatchSetupStepComplete } from '@/lib/dev-match-setup'
import { createClient } from '@/lib/supabase'

type Phase = 'survey' | 'result'

const AXES: PersonalityPreferenceAxis[] = [
  'openness',
  'conscientiousness',
  'extraversion',
  'agreeableness',
  'emotional_stability',
]

export default function PersonalityPreferencePage() {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('survey')
  const [profile, setProfile] = useState<PersonalityPreferenceProfile | null>(null)
  const [selfBig5, setSelfBig5] = useState<Big5Vector | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoaded(true)
        return
      }

      supabase
        .from('profiles')
        .select(`
          big5_openness,
          big5_conscientiousness,
          big5_extraversion,
          big5_agreeableness,
          big5_neuroticism,
          personality_preference_answer_logs
        `)
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          const big5 = getSelfBig5(data)
          setSelfBig5(big5)

          const logs = coerceAnswerLogs(data?.personality_preference_answer_logs)
          if (logs && logs.length > 0) {
            setProfile(buildPersonalityPreferenceProfile(logs))
            setPhase('result')
          }
          setLoaded(true)
        })
    })
  }, [])

  function handleSurveyComplete(nextProfile: PersonalityPreferenceProfile) {
    setProfile(nextProfile)
    setPhase('result')
  }

  async function handleConfirm() {
    if (!profile) return
    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (markDevMatchSetupStepComplete('personality')) {
          router.push(getSafeClientRedirect('/profile/schedule'))
          return
        }
        router.push('/login')
        return
      }

      const payload = buildPersonalityPreferenceStoragePayload(profile, selfBig5)
      const { error: dbErr } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            ...payload,
            personality_preference_completed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

      if (dbErr) throw dbErr
      router.push(getSafeClientRedirect('/profile/schedule'))
    } catch {
      setError('저장 중 오류가 발생했어요. 다시 시도해줘.')
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen booting-band px-5 pb-10 text-boot-ink">
      <div className="mb-7">
        <h1 className="text-2xl font-black text-boot-ink">상대 성격 취향</h1>
        <p className="text-sm text-boot-muted mt-1">
          {phase === 'survey'
            ? '내가 어떤 성격의 상대에게 끌리는지 골라볼게.'
            : '네가 끌리는 상대 성격 방향이야.'}
        </p>
      </div>

      {!loaded ? (
        <div className="flex flex-col gap-5 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl border border-boot-hairline bg-white/70" />
          ))}
        </div>
      ) : phase === 'survey' ? (
        <PersonalityPreferenceSurvey onComplete={handleSurveyComplete} />
      ) : (
        <PersonalityPreferenceResult
          profile={profile!}
          onNext={handleConfirm}
          saving={saving}
          onRetry={() => {
            setProfile(null)
            setPhase('survey')
          }}
        />
      )}

      {error && <p className="mt-3 text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}

function getSelfBig5(data: unknown): Big5Vector | null {
  if (!data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  const openness = row.big5_openness
  const conscientiousness = row.big5_conscientiousness
  const extraversion = row.big5_extraversion
  const agreeableness = row.big5_agreeableness
  const neuroticism = row.big5_neuroticism
  if (
    typeof openness !== 'number' ||
    typeof conscientiousness !== 'number' ||
    typeof extraversion !== 'number' ||
    typeof agreeableness !== 'number' ||
    typeof neuroticism !== 'number'
  ) {
    return null
  }

  return { openness, conscientiousness, extraversion, agreeableness, neuroticism }
}

function coerceAnswerLogs(value: unknown): PersonalityPreferenceAnswer[] | null {
  if (!Array.isArray(value)) return null
  const logs: PersonalityPreferenceAnswer[] = []

  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const axis = row.axis
    const answer = row.answer
    const questionId = row.questionId
    if (typeof axis !== 'string' || !AXES.includes(axis as PersonalityPreferenceAxis)) return null
    if (!Number.isInteger(answer) || typeof answer !== 'number' || answer < 1 || answer > 5) return null
    logs.push({
      axis: axis as PersonalityPreferenceAxis,
      answer: answer as 1 | 2 | 3 | 4 | 5,
      questionId: typeof questionId === 'string' ? questionId : undefined,
    })
  }

  return logs
}
