'use client'

import { CalendarDays, Check, MoonStar } from 'lucide-react'
import Image from 'next/image'
import { useState } from 'react'

import QuantumEventWheel from '@/components/matching/QuantumEventWheel'
import QuantumCoupleDoubleDateSpotlight from '@/components/matching/QuantumCoupleDoubleDateSpotlight'
import {
  quantumEventCatalog,
  type QuantumEventMode,
  type QuantumPartyType,
} from '@/lib/matching/quantum-event-catalog'

const modeOptions: ReadonlyArray<{
  id: QuantumEventMode
  label: string
  detail: string
  image: string
  imageAlt: string
  timeCue: string
  cueLabel: string
}> = [
  {
    id: 'tonight',
    label: '오늘 바로',
    detail: '오늘 바로 가볍게 만나기',
    image: '/images/match/quantum-tonight-five.webp',
    imageAlt: '오늘 밤 함께 활동하는 대학생들',
    timeCue: '오늘 18:30 · 20:30 · 23:00',
    cueLabel: '오늘 남은 자리에서 바로 선택',
  },
  {
    id: 'scheduled',
    label: '날짜 골라 만나기',
    detail: '원하는 날짜의 특별한 만남',
    image: '/images/match/quantum-scheduled-five.png',
    imageAlt: '날짜를 정해 함께 나들이하는 대학생들',
    timeCue: '금 · 토 · 일',
    cueLabel: '날짜를 먼저 고르고 일정 예약',
  },
]

export default function QuantumMatchDiscovery() {
  const [mode, setMode] = useState<QuantumEventMode>('tonight')
  const [party, setParty] = useState<QuantumPartyType>('solo')
  const [hasParticipation, setHasParticipation] = useState(false)
  const isTonight = mode === 'tonight'

  return (
    <section aria-labelledby="quantum-match-discovery-title" className="mx-auto w-full max-w-6xl py-4 text-boot-ink sm:py-6">
      {!hasParticipation ? <>
      <header className={`-mx-4 px-4 pb-5 pt-4 sm:-mx-6 sm:px-6 ${isTonight ? 'bg-[#121821] text-white' : 'border-y border-boot-hairline bg-boot-canvas text-boot-ink'}`}>
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-5">
          <div>
            <p className={`text-[11px] font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
              {isTonight ? '지금 바로 가볍게' : '좋아하는 날을 골라서'}
            </p>
            <h2 id="quantum-match-discovery-title" className="mt-1 text-2xl font-black leading-tight sm:text-3xl">
              {isTonight ? '오늘 밤, 같이 해볼까요?' : '날짜부터 잡고 제대로 만나요'}
            </h2>
            <p className={`mt-2 max-w-2xl text-sm font-bold leading-6 ${isTonight ? 'text-white/68' : 'text-boot-muted'}`}>
              활동 하나만 고르면 장소와 인원은 Quantum이 맞춰요. 사진을 넘기며 지금 끌리는 약속을 골라보세요.
            </p>
          </div>
          {isTonight
            ? <MoonStar size={24} className="mt-1 shrink-0 text-[#F3B95F]" aria-hidden="true" />
            : <CalendarDays size={24} className="mt-1 shrink-0 text-boot-primary" aria-hidden="true" />}
        </div>
      </header>

      <div
        role="tablist"
        aria-label="만날 시점"
        data-layout="mode-scene-switch"
        className="relative z-10 mx-auto flex min-h-[132px] w-full max-w-3xl overflow-hidden border-y border-white/15 bg-[#121821] shadow-[0_12px_28px_rgba(18,24,33,0.24)]"
      >
        {modeOptions.map((option) => {
          const active = option.id === mode
          const OptionIcon = option.id === 'tonight' ? MoonStar : CalendarDays
          return (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setMode(option.id)}
              className={`group relative min-h-[132px] overflow-hidden px-4 py-3 text-left text-white transition-[flex-basis,filter] duration-200 motion-reduce:transition-none ${active ? 'basis-[62%]' : 'basis-[38%] grayscale-[35%] hover:grayscale-0'}`}
            >
              <Image
                src={option.image}
                alt={option.imageAlt}
                fill
                sizes="(max-width: 768px) 58vw, 430px"
                className="object-cover object-center"
              />
              <span className={`absolute inset-0 ${active ? 'bg-gradient-to-r from-[#0D151C]/95 via-[#0D151C]/72 to-[#0D151C]/38' : 'bg-[#0D151C]/76'}`} />
              <span className="relative flex h-full min-w-0 items-end justify-between gap-3" data-layout="time-context-switch">
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[10px] font-black text-[#F3B95F]">
                    <OptionIcon size={16} aria-hidden="true" />
                    {option.id === 'tonight' ? '지금 가능한 활동' : '다가오는 일정'}
                  </span>
                  <span className="mt-1 block text-[15px] font-black leading-tight sm:text-lg">{option.label}</span>
                  {active ? (
                    <>
                      <span className="mt-2 block text-[12px] font-black text-white">{option.timeCue}</span>
                      <span className="mt-0.5 block text-[10px] font-bold text-white/72">{option.cueLabel}</span>
                    </>
                  ) : null}
                </span>
                {active ? (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-boot-primary text-white shadow-md">
                    <Check size={16} strokeWidth={3} aria-hidden="true" />
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
      </> : null}

      <div role="tabpanel">
        <QuantumEventWheel
          events={quantumEventCatalog[mode]}
          mode={mode}
          party={party}
          onPartyChange={setParty}
          onParticipationStateChange={setHasParticipation}
        />
      </div>
      {mode === 'scheduled' && !hasParticipation ? <QuantumCoupleDoubleDateSpotlight /> : null}
    </section>
  )
}
