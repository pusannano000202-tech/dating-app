'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BasicInfoConversation from '@/components/profile/BasicInfoConversation'
import type { BasicInfoData } from '@/components/profile/BasicInfoForm'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import { DEV_BASIC_PROFILE_STORAGE_KEY } from '@/lib/profile/dev-basic-profile'
import { createClient } from '@/lib/supabase'

const PROFILE_LOAD_TIMEOUT_MS = 10_000

export default function BasicInfoPage() {
  const router = useRouter()
  const [initialData, setInitialData] = useState<Partial<BasicInfoData> | undefined>(undefined)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProfile() {
      setLoaded(false)
      setLoadError(null)

      try {
        const supabase = createClient()
        await withTimeout((async () => {
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          const isDevPreview = isDevPreviewClientSession()
          if (authError && !isDevPreview) throw authError

          if (!user) {
            if (isDevPreview) {
              try {
                const stored = sessionStorage.getItem(DEV_BASIC_PROFILE_STORAGE_KEY)
                if (stored && active) {
                  setInitialData(JSON.parse(stored) as Partial<BasicInfoData>)
                }
              } catch {}
            }
            return
          }

          const [profileResult, userResult] = await Promise.all([
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

          if (profileResult.error && profileResult.error.code !== 'PGRST116') {
            throw profileResult.error
          }
          if (userResult.error && userResult.error.code !== 'PGRST116') {
            throw userResult.error
          }

          if (active && (profileResult.data || userResult.data)) {
            setInitialData({
              ...(profileResult.data as Partial<BasicInfoData> | null ?? {}),
              phone: typeof userResult.data?.phone === 'string' ? userResult.data.phone : '',
            })
          }
        })(), PROFILE_LOAD_TIMEOUT_MS)
      } catch {
        if (active) {
          setLoadError('프로필 정보를 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.')
        }
      } finally {
        if (active) setLoaded(true)
      }
    }

    void loadProfile()
    return () => {
      active = false
    }
  }, [loadAttempt])

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

      const response = await fetch('/api/profile/basic', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, phone: '' }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setServerError(translateBasicProfileSaveError(payload.error))
        return
      }

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

      {loaded && loadError ? (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-black text-rose-800">프로필을 불러오지 못했어요</p>
          <p className="mt-1 text-sm leading-6 text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((current) => current + 1)}
            className="mt-4 min-h-11 rounded-lg border border-rose-300 bg-white px-4 text-sm font-black text-rose-800"
          >
            다시 불러오기
          </button>
        </div>
      ) : loaded ? (
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('profile_load_timeout')), timeoutMs)

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

function translateBasicProfileSaveError(code?: string): string {
  switch (code) {
    case 'nickname_taken':
      return '이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해 주세요.'
    case 'invalid_nickname':
      return '닉네임은 2~20자 사이로 입력해 주세요.'
    case 'invalid_phone':
      return '휴대폰 번호 형식을 다시 확인해 주세요.'
    case 'phone_verification_required':
      return '확인되지 않은 전화번호는 저장할 수 없어요. 앱 안의 채팅을 이용해 주세요.'
    case 'school_change_requires_support':
      return '학교 변경은 본인 확인이 필요해요. 고객지원에 문의해 주세요.'
    case 'unauthorized':
      return '로그인 시간이 만료됐어요. 다시 로그인한 뒤 저장해 주세요.'
    default:
      return '기본 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}
