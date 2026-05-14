'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AppearanceWorldcup from '@/components/profile/AppearanceWorldcup'
import WorldcupResult from '@/components/profile/WorldcupResult'
import type { AppearanceType } from '@/lib/types'

export default function WorldcupPage() {
  const router = useRouter()
  const [winner, setWinner] = useState<AppearanceType | null>(null)
  const [key, setKey] = useState(0) // remount 트리거

  async function handleConfirm() {
    if (!winner) return
    // TODO: Supabase에 profiles.appearance_type 저장 후 다음 단계로
    // const supabase = createClient()
    // await supabase.from('profiles').update({ appearance_type: winner }).eq('user_id', userId)
    router.push('/profile/photos') // 다음: 사진 업로드 단계
  }

  if (winner) {
    return (
      <WorldcupResult
        winner={winner}
        onConfirm={handleConfirm}
        onRetry={() => {
          setWinner(null)
          setKey((k) => k + 1) // 컴포넌트 완전 리셋
        }}
      />
    )
  }

  return <AppearanceWorldcup key={key} onComplete={setWinner} />
}
