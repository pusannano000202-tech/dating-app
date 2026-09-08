import FiveMeetingCalendar from '@/components/matching/FiveMeetingCalendar'
import FiveMeetingHomeNextActionCard from '@/components/matching/FiveMeetingHomeNextActionCard'

export default function CalendarPage() {
  return <main className="min-h-screen booting-paper px-4 pb-24 pt-6 text-boot-ink"><div className="mx-auto max-w-3xl space-y-5"><header><p className="text-[11px] font-black tracking-[0.18em] text-boot-primary">MY SCHEDULE</p><h1 className="mt-1 text-3xl font-black">약속 캘린더</h1></header><FiveMeetingHomeNextActionCard /><FiveMeetingCalendar /></div></main>
}
