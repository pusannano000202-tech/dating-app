import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import WeeklyActivityExplorer from '@/components/matching/WeeklyActivityExplorer'
import { weeklyPageNavigation } from '@/lib/matching/weekly-navigation'

/** Existing friend-consent/withdrawal/assigned-result links remain accessible. */
export default async function ExistingWeeklyApplicationsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const navigation = weeklyPageNavigation(await searchParams)
  if (!navigation) notFound()
  return <main className="min-h-screen bg-[#fffaf6] px-5 pb-28 pt-5 text-boot-ink"><div className="mx-auto max-w-3xl"><Link href={navigation.calendarHref} className="inline-flex min-h-11 items-center gap-2 text-sm text-boot-muted"><ArrowLeft size={18} /> 이벤트 캘린더</Link><h1 className="mt-3 text-2xl font-black">내 신청·배정 확인</h1><WeeklyActivityExplorer key={navigation.weekKey ?? 'current'} weekKey={navigation.weekKey} calendarHref={navigation.calendarHref} /></div></main>
}
