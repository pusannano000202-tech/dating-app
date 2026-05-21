'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BasicInfoForm, { type BasicInfoData } from '@/components/profile/BasicInfoForm'
import { createClient } from '@/lib/supabase'

export default function BasicInfoPage() {
  const router = useRouter()
  const [initialData, setInitialData] = useState<Partial<BasicInfoData> | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return }
      supabase
        .from('profiles')
        .select('gender, age, height, body_type, hair_density, school, department, year')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setInitialData(data as Partial<BasicInfoData>)
          setLoaded(true)
        })
    })
  }, [])

  async function handleSubmit(data: BasicInfoData) {
    setSaving(true)
    setServerError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, ...data }, { onConflict: 'user_id' })
      if (error) throw error

      router.push('/profile/worldcup')
    } catch {
      setServerError('저장 중 오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black gradient-fate-text">기본 정보</h1>
        <p className="text-sm text-gray-500 mt-1">매칭에 활용되는 정보야. 솔직하게 적어줘.</p>
      </div>

      {loaded ? (
        <BasicInfoForm
          key={initialData ? 'loaded' : 'empty'}
          initialValue={initialData}
          onSubmit={handleSubmit}
          saving={saving}
          serverError={serverError}
        />
      ) : (
        <div className="flex flex-col gap-5 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-white/5 rounded-2xl" />
          ))}
        </div>
      )}
    </div>
  )
}
