'use client'

import { useState, useEffect } from 'react'
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
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase
        .from('profiles')
        .select('appearance_type')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.appearance_type) setWinner(data.appearance_type as AppearanceType)
          setLoaded(true)
        })
    })
  }, [])

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

      router.push('/profile/self-worldcup')
    } catch {
      setSaveError('저장 중 오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) {
    return (
      <div className="flex flex-col items-center min-h-screen px-4 py-6 animate-pulse">
        <div className="w-full max-w-md mb-6">
          <div className="flex justify-between mb-2">
            <div className="h-4 w-12 bg-white/10 rounded" />
            <div className="h-4 w-12 bg-white/10 rounded" />
          </div>
          <div className="h-1 bg-white/10 rounded-full mb-5" />
          <div className="h-7 w-52 bg-white/10 rounded mx-auto" />
        </div>
        <div className="w-full max-w-md flex gap-3">
          <div className="flex-1 rounded-3xl bg-white/5" style={{ aspectRatio: '3/4' }} />
          <div className="flex-1 rounded-3xl bg-white/5" style={{ aspectRatio: '3/4' }} />
        </div>
      </div>
    )
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
