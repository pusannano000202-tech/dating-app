'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import SchedulePicker from '@/components/profile/SchedulePicker'
import { createClient } from '@/lib/supabase'
import type { AvailableTimeslots } from '@/lib/types'

export default function SchedulePage() {
  const router = useRouter()
  const [timeslots, setTimeslots] = useState<AvailableTimeslots>({ slots: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNext() {
    if (timeslots.slots.length === 0) { setError('가능한 시간대를 1개 이상 선택해줘.'); return }
    setSaving(true); setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { error: dbErr } = await supabase.from('profiles')
        .upsert({ user_id: user.id, available_timeslots: timeslots }, { onConflict: 'user_id' })
      if (dbErr) throw dbErr
      router.push('/profile/preferences')
    } catch { setError('저장 중 오류가 발생했어요.') }
    finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">언제 시간 돼?</h1>
        <p className="text-sm text-gray-500 mt-1">과팅 가능한 요일과 시간을 골라줘</p>
      </div>

      <SchedulePicker onChange={setTimeslots} />

      {timeslots.slots.length > 0 && (
        <div className="mt-4 glass rounded-2xl px-4 py-3 border border-violet-500/30">
          <p className="text-sm text-violet-300 font-medium">
            {timeslots.slots.length}개 시간대 선택됨 ✓
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
  )
}
