'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Info } from 'lucide-react'
import SchedulePicker from '@/components/profile/SchedulePicker'
import { getSequentialMatchStartRedirect } from '@/lib/client-redirect'
import { markDevMatchSetupStepComplete } from '@/lib/dev-match-setup'
import { createClient } from '@/lib/supabase'
import type { AvailableTimeslots } from '@/lib/types'

export default function SchedulePage() {
  const router = useRouter()
  const [timeslots, setTimeslots] = useState<AvailableTimeslots>({ slots: [] })
  const [initialTimeslots, setInitialTimeslots] = useState<AvailableTimeslots | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase
        .from('profiles')
        .select('available_timeslots')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.available_timeslots) {
            const ts = data.available_timeslots as AvailableTimeslots
            setInitialTimeslots(ts)
            setTimeslots(ts)
          }
          setLoaded(true)
        })
    })
  }, [])

  async function handleNext() {
    if (timeslots.slots.length === 0) { setError('모든 시간이 막혀 있어요. 최소 한 시간은 가능하게 남겨줘.'); return }
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (markDevMatchSetupStepComplete('schedule')) {
          router.push(getSequentialMatchStartRedirect('/profile/preferences', '/profile/preferences'))
          return
        }
        router.push('/login')
        return
      }
      const { error: dbErr } = await supabase.from('profiles')
        .upsert({ user_id: user.id, available_timeslots: timeslots }, { onConflict: 'user_id' })
      if (dbErr) throw dbErr
      router.push(getSequentialMatchStartRedirect('/profile/preferences', '/profile/preferences'))
    } catch { setError('저장 중 오류가 발생했어요.') }
    finally { setSaving(false) }
  }

  return (
    <main className="min-h-screen booting-band px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto flex min-h-[calc(100vh-7rem)] w-full max-w-[calc(100vw-2.5rem)] flex-col sm:max-w-md">
      <div className="mb-7">
        <h1 className="text-2xl font-black gradient-fate-text">언제 절대 안 돼?</h1>
        <p className="text-sm text-gray-500 mt-1">기본은 가능으로 보고, 안 되는 시간만 체크해줘</p>
        <details className="mt-3 rounded-2xl border border-boot-primary/15 bg-white/85 px-4 py-3 shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 text-xs font-black text-boot-ink">
            <Info size={15} className="text-boot-primary" />
            왜 안 되는 시간을 고르나요?
          </summary>
          <p className="mt-2 text-xs leading-5 text-boot-muted">
            대부분의 시간은 가능하다고 보고, 수업이나 알바처럼 절대 안 되는 시간만 막는 방식이에요.
            18시를 누르면 “시작 18:00부터 그 구간은 안 됨”으로 저장됩니다.
          </p>
        </details>
      </div>

      {loaded ? (
        <SchedulePicker
          key={initialTimeslots ? 'loaded' : 'empty'}
          initialValue={initialTimeslots}
          onChange={setTimeslots}
        />
      ) : (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-10 bg-white/5 rounded-2xl" />
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-12 bg-white/5 rounded-xl" />
            ))}
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-white/5 rounded-2xl" />
          ))}
        </div>
      )}

      {timeslots.slots.length > 0 && (
        <div className="mt-4 glass rounded-2xl px-4 py-3 border border-violet-500/30">
          <p className="text-sm text-violet-300 font-medium">
            {timeslots.slots.length}개 가능 시간 구간 저장 준비됨 ✓
          </p>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-400 text-center">{error}</p>}

      <div className="mt-auto pt-8">
        <button onClick={handleNext} disabled={saving || timeslots.slots.length === 0}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-base shadow-lg shadow-violet-900/30">
          {saving ? '저장 중...' : '다음'}
        </button>
      </div>
      </div>
    </main>
  )
}
