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

const AGE_INPUT_MIN = 18
const AGE_INPUT_MAX = 35
const DEFAULT_TOLERANCE = 3

export default function PreferencesPage() {
  const router = useRouter()
  const [weights, setWeights] = useState<PreferenceWeights>(DEFAULT_WEIGHTS)
  const [initialWeights, setInitialWeights] = useState<PreferenceWeights | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myAge, setMyAge] = useState<number | null>(null)
  const [ageMin, setAgeMin] = useState<number>(AGE_INPUT_MIN)
  const [ageMax, setAgeMax] = useState<number>(AGE_INPUT_MAX)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase
        .from('profiles')
        .select('preference_weights, age, preferred_age_min, preferred_age_max')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.preference_weights) {
            const w = data.preference_weights as PreferenceWeights
            setWeights(w)
            setInitialWeights(w)
          }
          const age = typeof data?.age === 'number' ? data.age : null
          setMyAge(age)
          const fallbackMin = age != null ? Math.max(AGE_INPUT_MIN, age - DEFAULT_TOLERANCE) : AGE_INPUT_MIN
          const fallbackMax = age != null ? Math.min(AGE_INPUT_MAX, age + DEFAULT_TOLERANCE) : AGE_INPUT_MAX
          setAgeMin(typeof data?.preferred_age_min === 'number' ? data.preferred_age_min : fallbackMin)
          setAgeMax(typeof data?.preferred_age_max === 'number' ? data.preferred_age_max : fallbackMax)
          setLoaded(true)
        })
    })
  }, [])

  const total = Math.round(Object.values(weights).reduce((s, v) => s + v, 0) * 100)
  const ageRangeOk = ageMin >= AGE_INPUT_MIN && ageMax <= AGE_INPUT_MAX && ageMin <= ageMax

  async function handleComplete() {
    if (total !== 100 || !ageRangeOk || saving) return
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
            preference_weights: weights,
            preferred_age_min: ageMin,
            preferred_age_max: ageMax,
            is_profile_complete: true,
          },
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

  function bumpMin(delta: number) {
    setAgeMin(prev => {
      const next = Math.max(AGE_INPUT_MIN, Math.min(AGE_INPUT_MAX, prev + delta))
      return Math.min(next, ageMax)
    })
  }
  function bumpMax(delta: number) {
    setAgeMax(prev => {
      const next = Math.max(AGE_INPUT_MIN, Math.min(AGE_INPUT_MAX, prev + delta))
      return Math.max(next, ageMin)
    })
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black gradient-fate-text">뭘 제일 중요하게 봐?</h1>
        <p className="text-sm text-gray-500 mt-1">슬라이더로 중요도 조절해봐. 자동으로 100%가 맞춰져.</p>
      </div>

      {loaded ? (
        <PreferenceSliders
          key={initialWeights ? 'loaded' : 'default'}
          initialValue={initialWeights ?? undefined}
          onChange={setWeights}
        />
      ) : (
        <div className="flex flex-col gap-4 animate-pulse">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex justify-between">
                <div className="h-4 w-20 bg-white/10 rounded" />
                <div className="h-4 w-10 bg-white/10 rounded" />
              </div>
              <div className="h-3 bg-white/5 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <section className="mt-8 mb-1">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-bold">상대 나이는 어디까지 괜찮아?</h2>
            {myAge != null && (
              <span className="text-[11px] text-gray-500">내 나이 {myAge}</span>
            )}
          </div>
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            기본은 위아래 3살. 같은 나이대일수록 매칭 점수에 가점이 붙어. 폭이 넓을수록 후보가 늘어나.
          </p>

          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex-1">
                <p className="text-[11px] text-gray-500 mb-1">최소</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpMin(-1)}
                    className="h-9 w-9 rounded-xl border border-white/10 hover:border-white/25 text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-lg font-black tabular-nums">{ageMin}</span>
                  <button
                    type="button"
                    onClick={() => bumpMin(+1)}
                    className="h-9 w-9 rounded-xl border border-white/10 hover:border-white/25 text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="text-gray-600 pt-5">~</span>
              <div className="flex-1">
                <p className="text-[11px] text-gray-500 mb-1">최대</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpMax(-1)}
                    className="h-9 w-9 rounded-xl border border-white/10 hover:border-white/25 text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-lg font-black tabular-nums">{ageMax}</span>
                  <button
                    type="button"
                    onClick={() => bumpMax(+1)}
                    className="h-9 w-9 rounded-xl border border-white/10 hover:border-white/25 text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {myAge != null && (
              <button
                type="button"
                onClick={() => {
                  setAgeMin(Math.max(AGE_INPUT_MIN, myAge - DEFAULT_TOLERANCE))
                  setAgeMax(Math.min(AGE_INPUT_MAX, myAge + DEFAULT_TOLERANCE))
                }}
                className="mt-1 w-full py-2 rounded-xl text-xs text-violet-200/80 border border-violet-300/15 hover:border-violet-300/30 hover:bg-violet-500/5"
              >
                내 나이 ±3 으로 다시 맞추기
              </button>
            )}
            {!ageRangeOk && (
              <p className="mt-2 text-xs text-red-300/80 text-center">
                최소 나이가 최대 나이보다 클 수 없어 ({AGE_INPUT_MIN}-{AGE_INPUT_MAX})
              </p>
            )}
          </div>
        </section>
      )}

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}

      <div className="mt-auto pt-8">
        <button
          onClick={handleComplete}
          disabled={saving || total !== 100 || !ageRangeOk}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? '저장 중...' : '프로필 완성!'}
        </button>
        <p className="mt-3 text-xs text-gray-700 text-center">완성 후 그룹을 만들고 과팅을 신청할 수 있어</p>
      </div>
    </div>
  )
}
