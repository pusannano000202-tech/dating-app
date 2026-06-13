'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PreferenceWeightInputs from '@/components/profile/PreferenceWeightInputs'
import { getSafeClientRedirect } from '@/lib/client-redirect'
import { markDevMatchSetupStepComplete } from '@/lib/dev-match-setup'
import { createClient } from '@/lib/supabase'
import type { PreferenceWeights } from '@/lib/types'

const DEFAULT_WEIGHTS: PreferenceWeights = {
  appearance: 0.35,
  personality: 0.35,
  height: 0.15,
  body_type: 0.15,
}

const VISIBLE_WEIGHT_KEYS: (keyof PreferenceWeights)[] = [
  'appearance',
  'personality',
  'height',
  'body_type',
]

const AGE_INPUT_MIN = 18
const AGE_INPUT_MAX = 35
const DEFAULT_TOLERANCE = 3

function normalizeVisibleWeights(weights: PreferenceWeights): PreferenceWeights {
  const activeTotal = VISIBLE_WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0)
  if (activeTotal <= 0) return DEFAULT_WEIGHTS

  let remaining = 100
  const normalized = { ...DEFAULT_WEIGHTS }

  VISIBLE_WEIGHT_KEYS.forEach((key, index) => {
    if (index === VISIBLE_WEIGHT_KEYS.length - 1) {
      normalized[key] = remaining / 100
      return
    }

    const percent = Math.max(0, Math.min(100, Math.round((weights[key] / activeTotal) * 100)))
    normalized[key] = percent / 100
    remaining -= percent
  })
  return normalized
}

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
      if (!user) {
        setLoaded(true)
        return
      }

      supabase
        .from('profiles')
        .select('preference_weights, age, preferred_age_min, preferred_age_max')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.preference_weights) {
            const nextWeights = normalizeVisibleWeights(data.preference_weights as PreferenceWeights)
            setWeights(nextWeights)
            setInitialWeights(nextWeights)
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

  const total = Math.round(Object.values(weights).reduce((sum, value) => sum + value, 0) * 100)
  const ageRangeOk = ageMin >= AGE_INPUT_MIN && ageMax <= AGE_INPUT_MAX && ageMin <= ageMax
  const weightStatus =
    total === 100
      ? '가중치 합계가 100%라 저장할 수 있어요.'
      : total < 100
        ? `가중치가 ${100 - total}% 부족해요.`
        : `가중치가 ${total - 100}% 초과됐어요.`

  async function handleComplete() {
    if (total !== 100 || !ageRangeOk || saving) return

    setSaving(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (markDevMatchSetupStepComplete('preferences')) {
          router.push(getSafeClientRedirect('/'))
          return
        }

        router.push('/login')
        return
      }

      const { error: dbErr } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            preference_weights: weights,
            preferred_age_min: ageMin,
            preferred_age_max: ageMax,
          },
          { onConflict: 'user_id' }
        )

      if (dbErr) throw dbErr
      router.push(getSafeClientRedirect('/'))
    } catch {
      setError('저장 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setSaving(false)
    }
  }

  function bumpMin(delta: number) {
    setAgeMin((prev) => {
      const next = Math.max(AGE_INPUT_MIN, Math.min(AGE_INPUT_MAX, prev + delta))
      return Math.min(next, ageMax)
    })
  }

  function bumpMax(delta: number) {
    setAgeMax((prev) => {
      const next = Math.max(AGE_INPUT_MIN, Math.min(AGE_INPUT_MAX, prev + delta))
      return Math.max(next, ageMin)
    })
  }

  return (
    <div className="flex min-h-screen flex-col px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black gradient-fate-text">매칭에서 무엇을 더 중요하게 볼까?</h1>
        <p className="mt-1 text-sm leading-relaxed text-boot-muted">
          지금은 실제로 판단 가능한 외모, 성격, 키, 체형만 입력해요. 네 항목의 합계가 정확히 100%가 되어야 저장할 수 있어.
        </p>
      </div>

      {loaded ? (
        <PreferenceWeightInputs
          key={initialWeights ? 'loaded' : 'default'}
          initialValue={initialWeights ?? undefined}
          onChange={setWeights}
        />
      ) : (
        <div className="flex flex-col gap-4 animate-pulse">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="glass-card rounded-3xl p-4">
              <div className="mb-4 flex items-center justify-between">
                <div className="h-4 w-24 rounded bg-white/40" />
                <div className="h-4 w-12 rounded bg-white/40" />
              </div>
              <div className="h-11 rounded-2xl bg-white/35" />
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <section className="mt-8 mb-1">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold text-boot-ink">상대 나이는 어디까지 괜찮아?</h2>
            {myAge != null && (
              <span className="text-[11px] text-boot-muted">내 나이 {myAge}</span>
            )}
          </div>
          <p className="mb-4 text-xs leading-relaxed text-boot-muted">
            기본은 내 나이 기준 ±3살이에요. 범위를 넓힐수록 후보가 늘고, 좁힐수록 조건이 더 강하게 적용돼요.
          </p>

          <div className="glass-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="mb-1 text-[11px] text-boot-muted">최소</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpMin(-1)}
                    className="h-9 w-9 rounded-xl border border-boot-hairline text-lg font-bold hover:border-boot-primary/30"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center text-lg font-black tabular-nums">{ageMin}</span>
                  <button
                    type="button"
                    onClick={() => bumpMin(1)}
                    className="h-9 w-9 rounded-xl border border-boot-hairline text-lg font-bold hover:border-boot-primary/30"
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="pt-5 text-boot-muted">~</span>
              <div className="flex-1">
                <p className="mb-1 text-[11px] text-boot-muted">최대</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bumpMax(-1)}
                    className="h-9 w-9 rounded-xl border border-boot-hairline text-lg font-bold hover:border-boot-primary/30"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center text-lg font-black tabular-nums">{ageMax}</span>
                  <button
                    type="button"
                    onClick={() => bumpMax(1)}
                    className="h-9 w-9 rounded-xl border border-boot-hairline text-lg font-bold hover:border-boot-primary/30"
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
                className="mt-1 w-full rounded-xl border border-boot-hairline py-2 text-xs font-bold text-boot-body hover:border-boot-primary/30 hover:text-boot-primary"
              >
                내 나이 ±3살로 다시 맞추기
              </button>
            )}

            {!ageRangeOk && (
              <p className="mt-2 text-center text-xs text-red-500">
                최소 나이가 최대 나이보다 클 수 없어요. ({AGE_INPUT_MIN}-{AGE_INPUT_MAX})
              </p>
            )}
          </div>
        </section>
      )}

      {error && <p className="mt-3 text-center text-xs text-red-500">{error}</p>}

      <div className="mt-auto pt-8">
        {loaded && total !== 100 && (
          <p className="mb-3 text-center text-xs font-bold text-rose-500">{weightStatus}</p>
        )}
        <button
          onClick={handleComplete}
          disabled={saving || total !== 100 || !ageRangeOk}
          className="btn-gradient w-full rounded-2xl py-4 text-base font-bold shadow-lg shadow-violet-900/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? '저장 중...' : '프로필 완성!'}
        </button>
        <p className="mt-3 text-center text-xs text-boot-muted">완성 후 그룹을 만들고 과팅을 신청할 수 있어요.</p>
      </div>
    </div>
  )
}
