import { notFound } from 'next/navigation'

import QuantumEventRoomInviteAccept from '@/components/matching/QuantumEventRoomInviteAccept'

export default function EventRoomInvitePreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <main className="min-h-screen bg-[#FFF8F5] px-4 py-8 text-boot-ink sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-lg">
        <p className="mb-4 text-xs font-black text-boot-coral">개발 미리보기 · 실제 저장 안 됨</p>
        <QuantumEventRoomInviteAccept token="11111111111111111111111111111111" preview />
      </div>
    </main>
  )
}
