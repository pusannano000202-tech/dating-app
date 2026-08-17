import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, Clock3, MapPin, Sparkles } from 'lucide-react'
import { quantumEventCatalog, quantumEventPhotos } from '@/lib/matching/quantum-event-catalog'

export default function QuantumHomeLead() {
  const event = quantumEventCatalog.tonight[0]
  const photo = quantumEventPhotos[event.kind]

  return (
    <section className="overflow-hidden rounded-lg border border-boot-hairline bg-[#111a22] text-white shadow-[0_18px_42px_rgba(17,26,34,0.16)]">
      <div className="relative aspect-[4/3] min-h-[310px] overflow-hidden sm:aspect-[16/10]">
        <Image
          src={photo.src}
          alt={photo.alt}
          fill
          priority
          sizes="(max-width: 1024px) calc(100vw - 32px), 620px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,14,19,0.08)_15%,rgba(8,14,19,0.92)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-white/92 px-2.5 py-1 text-[11px] font-black text-[#147A70]">
            <Sparkles size={13} />
            오늘의 Quantum 추천
          </div>
          <h2 className="mt-3 text-[28px] font-black leading-tight sm:text-[32px]">
            오늘 밤, 같이 뛰어볼래요?
          </h2>
          <p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-white/82">
            대화 가능한 속도로 달리고, 음료 한 잔과 단체 사진으로 가볍게 마무리해요.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/88">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/35 px-2.5 py-2">
              <Clock3 size={14} />
              {event.schedule}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-black/35 px-2.5 py-2">
              <MapPin size={14} />
              {event.location}
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-2 bg-[#111a22] p-4 sm:grid-cols-[1fr_auto]">
        <Link
          href="/match"
          className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#F6B95E] px-4 text-sm font-black text-[#18231F] transition hover:bg-[#ffd185] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          오늘 밤 고르기
          <ArrowRight size={17} />
        </Link>
        <Link
          href="/meetups"
          className="flex min-h-12 items-center justify-center rounded-md border border-white/18 px-4 text-sm font-black text-white transition hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          직접 만든 모임 보기
        </Link>
      </div>
    </section>
  )
}
