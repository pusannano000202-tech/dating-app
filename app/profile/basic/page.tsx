'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import BasicInfoForm, { type BasicInfoData } from '@/components/profile/BasicInfoForm'
import { createClient } from '@/lib/supabase'

export default function BasicInfoPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

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

      router.push('/profile/photos')
    } catch {
      setServerError('저장 중 오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen px-5 pb-10">
      <div className="mb-7">
        <h1 className="text-2xl font-black">기본 정보</h1>
        <p className="text-sm text-gray-500 mt-1">매칭에 활용되는 정보야. 솔직하게 적어줘.</p>
      </div>

      <BasicInfoForm onSubmit={handleSubmit} saving={saving} serverError={serverError} />
    </div>
  )
}
