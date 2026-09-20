import { Suspense } from 'react'
import EventCalendarExperience from '@/components/matching/EventCalendarExperience'
import { seoulDateKey } from '@/lib/matching/calendar-navigation'

export default async function MatchCalendarPage({searchParams}: {searchParams: Promise<Record<string,string|string[]|undefined>>}) {
  const params = await searchParams
  const currentMonth = seoulDateKey(new Date().toISOString())!.slice(0,7)
  const month = typeof params.month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : currentMonth
  const preview = process.env.NODE_ENV !== 'production' && params.preview === '1'
  const previewData = preview ? (await import('@/lib/matching/calendar-preview')).calendarPreview(month,params.audience === 'couple' ? 'couple' : 'single') : undefined
  return <Suspense fallback={<p className="p-8 text-sm text-boot-muted">행사 일정을 준비하고 있어요.</p>}><EventCalendarExperience initialMonth={month} previewData={previewData} /></Suspense>
}
