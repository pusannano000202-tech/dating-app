'use client'
import Link from 'next/link'
import { ArrowRight, Heart } from 'lucide-react'
import LanguagePicker from './LanguagePicker'
import { useQuantumLocale } from './QuantumLocaleProvider'
export default function AccountPreferences(){
  const {locale}=useQuantumLocale()
  const title={ko:'내 연애 상태',en:'My relationship status',ja:'交際ステータス',zh:'我的恋爱状态'}[locale]
  const note={ko:'나에게만 보이는 상태 · 변경 후 30일 유지',en:'Private to you · 30-day change limit',ja:'自分だけに表示・変更後30日間保持',zh:'仅自己可见 · 更改后保持30天'}[locale]
  return <section className="mt-5 space-y-3"><LanguagePicker/><Link href="/profile/relationship" className="flex min-h-20 items-center gap-3 rounded-2xl border border-boot-hairline bg-white p-4"><Heart size={20} className="text-boot-primary"/><span className="flex-1"><strong className="block">{title}</strong><small className="text-boot-muted">{note}</small></span><ArrowRight size={17}/></Link></section>
}
