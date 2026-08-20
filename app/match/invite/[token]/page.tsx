import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import QuantumEventRoomInviteAccept from '@/components/matching/QuantumEventRoomInviteAccept'

export default async function QuantumEventRoomInvitePage(props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  return (
    <main className="min-h-screen bg-[#FFF8F5] px-4 py-6 text-boot-ink sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-5 flex items-center gap-3">
          <Link href="/match" aria-label="매칭으로 돌아가기" className="flex h-11 w-11 items-center justify-center rounded-md border border-boot-hairline bg-white text-boot-body"><ChevronLeft size={18} /></Link>
          <div>
            <p className="text-[11px] font-black text-boot-primary">Quantum 친구 초대</p>
            <h1 className="text-xl font-black">같은 방 참여</h1>
          </div>
        </header>
        <QuantumEventRoomInviteAccept token={params.token} />
      </div>
    </main>
  )
}
