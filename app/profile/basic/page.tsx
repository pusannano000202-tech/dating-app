'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import BasicInfoForm, { type BasicInfoData } from '@/components/profile/BasicInfoForm'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
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
            sessionStorage.setItem('booting_dev_basic_profile', JSON.stringify(data))
          } catch {}
          router.push('/profile/worldcup')
          return
        }
        router.push('/login')
        return
      }

      const { phone, ...profileData } = data

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
    <div className="flex min-h-screen flex-col px-5 pb-28">
      <div className="mb-6">
        <p className="mb-2 text-xs font-black text-boot-primary">1단계 / 내 정보</p>
        <h1 className="text-2xl font-black gradient-fate-text">내 정보 등록</h1>
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          매칭 전에 필요한 기본정보만 먼저 채워요. 여기서 입력한 내용은 그룹 매칭과 다음 이상형 월드컵에 이어집니다.
        </p>
      </div>

      {loaded && (
        <section className="mb-4 rounded-2xl border border-boot-primary/25 bg-white/90 px-4 py-3">
          <p className="text-[11px] font-black text-boot-primary">오늘 할 일</p>
          <div className="mt-2 flex items-center gap-2 overflow-x-auto text-[11px]">
            <span className="whitespace-nowrap rounded-full bg-boot-soft px-3 py-1 text-boot-ink">기본정보 입력</span>
            <span className="whitespace-nowrap rounded-full border border-boot-hairline px-3 py-1 text-boot-muted">이상형 월드컵</span>
            <span className="whitespace-nowrap rounded-full border border-boot-hairline px-3 py-1 text-boot-muted">성향 질문</span>
            <span className="whitespace-nowrap rounded-full border border-boot-hairline px-3 py-1 text-boot-muted">사진 업로드</span>
          </div>
          <p className="mt-2 text-xs text-boot-muted">
            필수 항목을 채우면 아래 버튼으로 바로 다음 화면을 확인할 수 있어요.
          </p>
        </section>
      )}

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
            <div key={i} className="h-14 rounded-2xl bg-white/5" />
          ))}
        </div>
      )}
    </div>
  )
}
