'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PreferenceWeightInputs from '@/components/profile/PreferenceWeightInputs'
import { getSequentialMatchStartRedirect } from '@/lib/client-redirect'
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
  const ageTrackSpan = AGE_INPUT_MAX - AGE_INPUT_MIN
  const ageMinPercent = ((ageMin - AGE_INPUT_MIN) / ageTrackSpan) * 100
  const ageMaxPercent = ((ageMax - AGE_INPUT_MIN) / ageTrackSpan) * 100
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
          router.push(getSequentialMatchStartRedirect('/profile/match-card', '/'))
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
      router.push(getSequentialMatchStartRedirect('/profile/match-card', '/'))
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
        <section className="mt-8 mb-1 rounded-[30px] border border-boot-primary/15 bg-white p-5 shadow-[0_18px_42px_rgba(23,20,18,0.08)]">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">Age range</p>
              <h2 className="mt-1 text-xl font-black text-boot-ink">상대 나이 범위</h2>
              <p className="mt-2 text-xs leading-relaxed text-boot-muted">
                이 범위 안의 상대만 우선 매칭해요. 좁히면 더 정확하고, 넓히면 후보가 많아져요.
              </p>
            </div>
            {myAge != null && (
              <span className="rounded-full bg-boot-soft px-3 py-1.5 text-[11px] font-black text-boot-primary">
                내 나이 {myAge}
              </span>
            )}
          </div>

          <div className="mb-5 rounded-[26px] border border-boot-hairline bg-boot-soft px-4 py-4">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[11px] font-bold text-boot-muted">선호 범위</p>
                <p className="mt-0.5 text-3xl font-black tabular-nums text-boot-ink">
                  {ageMin}<span className="mx-1 text-lg text-boot-muted">~</span>{ageMax}세
                </p>
              </div>
              <p className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-boot-body">
                {ageMax - ageMin + 1}살 폭
              </p>
            </div>

            <div className="relative h-12 rounded-full bg-white px-4">
              <div className="absolute inset-x-4 top-1/2 h-2 -translate-y-1/2 rounded-full bg-boot-hairline" />
              <div className="absolute inset-x-4 top-0 h-full">
                <div
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-boot-primary to-orange-400"
                  style={{
                    left: `${ageMinPercent}%`,
                    right: `${100 - ageMaxPercent}%`,
                  }}
                />
                <span
                  className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-boot-primary shadow"
                  style={{ left: `${ageMinPercent}%` }}
                />
                <span
                  className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white bg-orange-400 shadow"
                  style={{ left: `${ageMaxPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-between text-[10px] font-bold text-boot-muted">
              <span>{AGE_INPUT_MIN}세</span>
              <span>{AGE_INPUT_MAX}세</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <AgeControlCard
              label="최소 나이"
              value={ageMin}
              onMinus={() => bumpMin(-1)}
              onPlus={() => bumpMin(1)}
            />
            <AgeControlCard
              label="최대 나이"
              value={ageMax}
              onMinus={() => bumpMax(-1)}
              onPlus={() => bumpMax(1)}
            />
          </div>

          {myAge != null && (
            <button
              type="button"
              onClick={() => {
                setAgeMin(Math.max(AGE_INPUT_MIN, myAge - DEFAULT_TOLERANCE))
                setAgeMax(Math.min(AGE_INPUT_MAX, myAge + DEFAULT_TOLERANCE))
              }}
              className="mt-4 w-full rounded-2xl border border-boot-primary/20 bg-white py-3 text-sm font-black text-boot-primary shadow-sm hover:border-boot-primary/40"
            >
              내 나이 ±3살로 다시 맞추기
            </button>
          )}

          {!ageRangeOk && (
            <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-center text-xs font-bold text-red-500">
              최소 나이가 최대 나이보다 클 수 없어요. ({AGE_INPUT_MIN}-{AGE_INPUT_MAX})
            </p>
          )}
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

function AgeControlCard({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string
  value: number
  onMinus: () => void
  onPlus: () => void
}) {
  return (
    <div className="rounded-[24px] border border-boot-hairline bg-white px-3 py-3 shadow-sm">
      <p className="text-center text-[11px] font-black text-boot-muted">{label}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onMinus}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-boot-hairline text-lg font-black text-boot-ink hover:border-boot-primary/40 hover:text-boot-primary"
          aria-label={`${label} 낮추기`}
        >
          -
        </button>
        <span className="min-w-0 flex-1 text-center text-2xl font-black tabular-nums text-boot-ink">
          {value}
        </span>
        <button
          type="button"
          onClick={onPlus}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-boot-hairline text-lg font-black text-boot-ink hover:border-boot-primary/40 hover:text-boot-primary"
          aria-label={`${label} 높이기`}
        >
          +
        </button>
      </div>
    </div>
  )
}
