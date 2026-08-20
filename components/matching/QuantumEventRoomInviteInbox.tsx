'use client'

import Link from 'next/link'
import { ArrowRight, Clock3, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { parseQuantumEventRoomInvites, type QuantumEventRoomInvite } from '@/lib/matching/quantum-event-rooms'

export default function QuantumEventRoomInviteInbox() {
  const [invites, setInvites] = useState<QuantumEventRoomInvite[]>([])

  useEffect(() => {
    const controller = new AbortController()
    void fetch('/api/match/event-room-invites', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload: { invites?: unknown } | null) => {
        const parsed = parseQuantumEventRoomInvites(payload?.invites)
        if (parsed) setInvites(parsed.filter((invite) => invite.role === 'invitee' && invite.status === 'pending'))
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  if (invites.length === 0) return null
  const invite = invites[0]

  return (
    <section className="mx-auto mb-4 w-full max-w-3xl overflow-hidden rounded-lg border border-[#E2A93E] bg-[#FFF8E9] shadow-[0_10px_24px_rgba(116,83,23,0.12)]">
      <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F7BB58] text-[#252014]">
          <UsersRound size={20} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black text-[#96610C]">같은 방 친구 초대</p>
          <h2 className="mt-1 text-base font-black text-[#231D13]">{invite.counterpart_display_name}님이 {invite.room_label} 자리를 잡아뒀어요</h2>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#76674F]"><Clock3 size={13} /> 15분 안에 수락하면 같은 방으로 들어가요.</p>
        </div>
      </div>
      <Link href={`/match/invite/${invite.token}`} className="flex min-h-12 items-center justify-center gap-2 bg-[#231D13] px-4 text-sm font-black text-white">
        초대 확인 <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  )
}
