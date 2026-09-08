import Link from 'next/link'

import FiveMeetingPostFlow from '@/components/matching/FiveMeetingPostFlow'

export default async function ContinuationOccurrenceAfterPage({ params }: { params: Promise<{ occurrenceId: string }> }) {
  const { occurrenceId } = await params
  return <main className="min-h-screen booting-paper px-4 pb-24 pt-6 text-boot-ink"><div className="mx-auto max-w-3xl space-y-4"><Link href={`/match/occurrences/${encodeURIComponent(occurrenceId)}`} className="inline-flex min-h-10 items-center rounded-xl border border-boot-hairline bg-white px-4 text-xs font-black text-boot-primary">회차 화면으로 돌아가기</Link><FiveMeetingPostFlow occurrenceId={occurrenceId} /></div></main>
}
