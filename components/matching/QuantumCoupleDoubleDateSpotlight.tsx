import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CalendarDays, LockKeyhole, UsersRound } from 'lucide-react'

export default function QuantumCoupleDoubleDateSpotlight() {
  return (
    <section aria-labelledby="couple-double-date-title" className="mx-auto mt-7 w-full max-w-4xl overflow-hidden border-y border-[#E8CFC7] bg-[#FFF9F6] sm:rounded-lg sm:border">
      <div className="grid sm:grid-cols-[1.08fr_0.92fr]">
        <div className="relative min-h-[260px] overflow-hidden sm:min-h-[340px]">
          <Image
            src="/images/match/events/event-couple-double-date.png"
            alt="보드게임 카페에서 더블데이트를 즐기는 두 커플의 분위기 예시"
            fill
            sizes="(max-width: 640px) 100vw, 520px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(30,20,18,0.02)_35%,rgba(30,20,18,0.82)_100%)]" />
          <span className="absolute right-3 top-3 rounded-full bg-black/62 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-sm">
            분위기 예시 · 실제 참가자 사진 아님
          </span>
          <div className="absolute inset-x-0 bottom-0 p-5 text-white">
            <p className="text-[11px] font-black text-[#FFC7B5]">COUPLE DOUBLE DATE</p>
            <h3 id="couple-double-date-title" className="mt-1 text-2xl font-black leading-tight">다른 커플들은 어떨까?</h3>
            <p className="mt-2 max-w-md text-sm font-bold leading-6 text-white/82">아는 커플끼리의 부담은 덜고, 새로운 두 커플이 네 명만의 저녁을 즐겨요.</p>
          </div>
        </div>

        <div className="flex flex-col justify-between p-5 sm:p-6">
          <div>
            <p className="text-xs font-black text-[#A85F50]">이번 주 커플 약속 · 커플 전용</p>
            <h4 className="mt-2 text-xl font-black">커플 2팀 · 총 4명</h4>
            <div className="mt-5 space-y-3 text-sm font-bold text-boot-body">
              <p className="flex items-center gap-3"><UsersRound size={18} className="text-[#BD6B5C]" /> 파트너가 수락해야 커플팀 완성</p>
              <p className="flex items-center gap-3"><CalendarDays size={18} className="text-[#BD6B5C]" /> 토요일 오후, 보드게임과 가벼운 식사</p>
              <p className="flex items-center gap-3"><LockKeyhole size={18} className="text-[#BD6B5C]" /> 상대 커플 프로필은 만남 종료 후 공개</p>
            </div>
          </div>
          <Link href="/match/couples/double-date" className="mt-6 flex min-h-13 items-center justify-between rounded-lg bg-[#C86F60] px-5 text-sm font-black text-white shadow-[0_12px_24px_rgba(143,78,66,0.2)] transition-colors hover:bg-[#B85F52]">
            우리 커플도 참가해보기 <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
