import Link from 'next/link'
import { ArrowRight, CalendarDays, Zap } from 'lucide-react'

export default function QuantumHomeLead() {
  return <section className="overflow-hidden rounded-xl border border-[#e8cfc4] bg-white" aria-label="새로운 만남 고르기">
    <div className="px-4 pb-2 pt-4"><p className="text-xs font-bold text-[#a43f32]">아직 신청한 매칭이 없어요</p><h2 className="mt-1 text-lg font-black">오늘, 아니면 편한 날에.</h2><p className="mt-1 text-xs leading-5 text-[#807169]">오늘은 사진 3장, 이번 주는 날짜부터 골라요.</p></div>
    <Link href="/tonight" className="mx-4 my-3 flex min-h-12 items-center gap-2 rounded-lg bg-[#b34c3e] px-3 text-sm font-bold text-white"><Zap size={17} />오늘 밤 만나기<ArrowRight size={16} className="ml-auto" /></Link>
    <Link href="/match?discovery=scheduled" className="flex min-h-12 items-center gap-2 border-t border-[#edddd4] px-4 text-sm font-bold"><CalendarDays size={17} className="text-[#a43f32]" />이번 주 만나기<ArrowRight size={16} className="ml-auto" /></Link>
  </section>
}
