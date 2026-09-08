'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { FRIEND_INVITE_SESSION_KEY } from '@/components/tonight/FriendInviteExperience'
import { PEACH_PANEL, TonightPageShell } from '@/components/tonight/TonightUi'

export default function TonightFriendInviteResumePage() {
  const router = useRouter()
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    const token = sessionStorage.getItem(FRIEND_INVITE_SESSION_KEY)
    sessionStorage.removeItem(FRIEND_INVITE_SESSION_KEY)
    if (!token || !/^[0-9a-f]{64}$/.test(token)) {
      setMissing(true)
      return
    }
    router.replace(`/tonight/invite/${token}`)
  }, [router])

  return (
    <TonightPageShell eyebrow="PNU TONIGHT" title="친구 초대로 돌아가는 중이에요" description="같은 탭에 보관한 일회용 초대만 이어서 확인합니다.">
      <section className={`${PEACH_PANEL} p-8 text-center`}>
        {missing ? <><h2 className="text-xl font-black">이어갈 초대를 찾지 못했어요</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">초대받은 원래 탭에서 다시 시작해 주세요.</p><Link href="/tonight" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-[#292321] px-5 text-sm font-black text-white">오늘밤으로</Link></> : <p className="font-black">안전하게 초대를 불러오는 중이에요…</p>}
      </section>
    </TonightPageShell>
  )
}
