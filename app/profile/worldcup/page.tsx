'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppearanceWorldcup from '@/components/profile/AppearanceWorldcup'
import WorldcupResult from '@/components/profile/WorldcupResult'
import { createClient } from '@/lib/supabase'
import type { AppearanceType } from '@/lib/types'

export default function WorldcupPage() {
  const router = useRouter()
  const [winner, setWinner] = useState<AppearanceType | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [key, setKey] = useState(0)

  async function handleConfirm() {
    if (!winner || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, appearance_type: winner }, { onConflict: 'user_id' })
      if (error) throw error

      router.push('/profile/basic')
    } catch {
      setSaveError('저장 중 오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  if (winner) {
    return (
      <WorldcupResult
        winner={winner}
        saving={saving}
        saveError={saveError}
        onConfirm={handleConfirm}
        onRetry={() => { setWinner(null); setSaveError(null); setKey((k) => k + 1) }}
      />
    )
  }

  return <AppearanceWorldcup key={key} onComplete={setWinner} />
}
