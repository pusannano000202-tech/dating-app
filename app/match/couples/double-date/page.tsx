import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import QuantumCoupleDoubleDate from '@/components/matching/QuantumCoupleDoubleDate'

type PageProps = { searchParams?: Promise<{ preview?: string | string[] }> }

export default async function CoupleDoubleDatePage({ searchParams }: PageProps) {
  const params = await searchParams
  const devPreview = process.env.NODE_ENV !== 'production' && params?.preview === '1'

  return (
    <main className="min-h-screen bg-[#FFF8F5] pb-28 text-boot-ink">
      <header className="border-b border-[#E8CFC7] bg-[#FFFDFC]">
        <div className="mx-auto flex min-h-16 w-full max-w-4xl items-center gap-3 px-4 sm:px-6">
          <Link href="/match" aria-label="매칭으로 돌아가기" className="flex h-11 w-11 items-center justify-center rounded-lg border border-[#E8CFC7] bg-white text-boot-muted"><ChevronLeft size={19} /></Link>
          <div><p className="text-xs font-black text-[#A85F50]">QUANTUM COUPLE</p><h1 className="text-xl font-black">커플 더블데이트</h1></div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-9">
        <section className="relative min-h-[280px] overflow-hidden rounded-lg text-white sm:min-h-[360px]">
          <Image src="/images/match/events/event-couple-double-date.png" alt="보드게임 카페에서 함께 웃는 두 커플의 분위기 예시" fill priority sizes="(max-width: 768px) 100vw, 900px" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(29,19,17,0.08)_25%,rgba(29,19,17,0.9)_100%)]" />
          <span className="absolute right-3 top-3 rounded-full bg-black/62 px-3 py-1.5 text-[10px] font-black backdrop-blur-sm">분위기 예시 · 실제 참가자 사진 아님</span>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
            <p className="text-[11px] font-black text-[#FFC7B5]">토요일 오후 · 커플 2팀</p>
            <h2 className="mt-1 text-3xl font-black leading-tight">우리 말고 다른 커플은<br />어떻게 놀까?</h2>
            <p className="mt-3 max-w-xl text-sm font-bold leading-6 text-white/82">서로 모르는 두 커플이 보드게임과 식사를 함께하며 부담 없이 새로운 데이트를 경험해요.</p>
          </div>
        </section>

        {devPreview ? <p className="mt-3 rounded-lg bg-[#F9E9E3] px-4 py-3 text-xs font-black text-[#98584C]">디자인 미리보기 · 아래 상태는 저장되지 않아요.</p> : null}
        <div className="mt-6"><QuantumCoupleDoubleDate devPreview={devPreview} /></div>
      </div>
    </main>
  )
}
