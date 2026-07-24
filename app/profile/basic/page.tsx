'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BasicInfoConversation from '@/components/profile/BasicInfoConversation'
import type { BasicInfoData } from '@/components/profile/BasicInfoForm'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import { DEV_BASIC_PROFILE_STORAGE_KEY } from '@/lib/profile/dev-basic-profile'
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
      if (!user) {
        if (isDevPreviewClientSession()) {
          try {
            const stored = sessionStorage.getItem(DEV_BASIC_PROFILE_STORAGE_KEY)
            if (stored) {
              setInitialData(JSON.parse(stored) as Partial<BasicInfoData>)
            }
          } catch {}
        }
        setLoaded(true)
        return
      }
      Promise.all([
        supabase
          .from('profiles')
          .select('display_name, gender, age, height, body_type, hair_density, school, department, year')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('users')
          .select('phone')
          .eq('id', user.id)
          .single(),
      ])
        .then(([profileResult, userResult]) => {
          if (profileResult.data || userResult.data) {
            setInitialData({
              ...(profileResult.data as Partial<BasicInfoData> | null ?? {}),
              phone: typeof userResult.data?.phone === 'string' ? userResult.data.phone : '',
            })
          }
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
      if (!user) {
        if (isDevPreviewClientSession()) {
          try {
            sessionStorage.setItem(DEV_BASIC_PROFILE_STORAGE_KEY, JSON.stringify(data))
          } catch {}
          router.push('/profile/worldcup')
          return
        }
        router.push('/login')
        return
      }

      const { phone, ...profileData } = data
      const nicknameClaim = await claimNickname(profileData.display_name)
      if (!nicknameClaim.ok) {
        setServerError(translateNicknameClaimError(nicknameClaim.error))
        return
      }

      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: user.id, ...profileData }, { onConflict: 'user_id' })
      if (error) throw error

      const { error: userError } = await supabase
        .from('users')
        .upsert({ id: user.id, phone }, { onConflict: 'id' })
      if (userError) throw userError

      router.push('/profile/worldcup')
    } catch {
      setServerError('저장 중 오류가 생겼어요. 잠시 뒤 다시 시도해 주세요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-5 pb-28 pt-8">
      <header className="mb-7">
        <p className="text-xs font-black text-boot-primary">QUANTUM · 프로필 시작</p>
        <h1 className="mt-2 text-2xl font-black text-boot-ink">내 정보를 차례로 알려주세요</h1>
        <p className="mt-2 text-sm leading-6 text-boot-muted">매칭에 필요한 정보부터 짧게 묻고, 마지막에 한 번에 확인해요.</p>
      </header>

      {loaded ? (
        <BasicInfoConversation
          key={initialData ? 'loaded' : 'empty'}
          initialValue={initialData}
          onSubmit={handleSubmit}
          saving={saving}
          serverError={serverError}
        />
      ) : (
        <div className="flex flex-col gap-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-boot-soft" />
          ))}
        </div>
      )}
    </div>
  )
}

async function claimNickname(nickname: string): Promise<{ ok: true } | { ok: false; error?: string }> {
  try {
    const res = await fetch('/api/profiles/claim-nickname', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname }),
    })

    if (res.ok) return { ok: true }
    const data = await res.json().catch(() => ({})) as { error?: string }
    return { ok: false, error: data.error }
  } catch {
    return { ok: false, error: 'nickname_claim_failed' }
  }
}

function translateNicknameClaimError(code?: string): string {
  switch (code) {
    case 'nickname_taken':
      return '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.'
    case 'invalid_nickname':
      return '닉네임은 2~20자 사이로 입력해 주세요.'
    default:
      return '닉네임을 확정하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}
