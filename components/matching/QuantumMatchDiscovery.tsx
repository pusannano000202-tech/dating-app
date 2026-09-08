'use client'

import { ArrowRight, CalendarDays, Check, Clock3, MoonStar, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import QuantumCoupleDoubleDateSpotlight from '@/components/matching/QuantumCoupleDoubleDateSpotlight'
import WeeklyActivityExplorer from '@/components/matching/WeeklyActivityExplorer'
import type { QuantumEventMode } from '@/lib/matching/quantum-event-catalog'

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
    label: '오늘 만나기',
    detail: '오늘 바로 가볍게 만나기',
    image: '/images/match/quantum-tonight-five.webp',
    imageAlt: '오늘 밤 함께 활동하는 대학생들',
    timeCue: '오늘 18:30 · 20:30 · 23:00',
    cueLabel: '오늘 남은 자리에서 바로 선택',
  },
  {
    id: 'scheduled',
    label: '이번 주 만나기',
    detail: '원하는 날짜의 특별한 만남',
    image: '/images/match/quantum-scheduled-five.png',
    imageAlt: '날짜를 정해 함께 나들이하는 대학생들',
    timeCue: '금 · 토 · 일',
    cueLabel: '날짜를 먼저 고르고 일정 예약',
  },
]

export default function QuantumMatchDiscovery() {
  const [mode, setMode] = useState<QuantumEventMode>('tonight')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('discovery') === 'scheduled') setMode('scheduled')
  }, [])
  const isTonight = mode === 'tonight'

  return (
    <section aria-labelledby="quantum-match-discovery-title" className="mx-auto w-full max-w-6xl py-4 text-boot-ink sm:py-6">
      <header className={`-mx-4 px-4 pb-5 pt-4 sm:-mx-6 sm:px-6 ${isTonight ? 'bg-[#121821] text-white' : 'border-y border-boot-hairline bg-boot-canvas text-boot-ink'}`}>
        <div className="mx-auto flex w-full max-w-6xl items-start justify-between gap-5">
          <div>
            <p className={`text-[11px] font-black ${isTonight ? 'text-[#F3B95F]' : 'text-boot-primary'}`}>
              {isTonight ? '오늘 만나기' : '이번 주 만나기'}
            </p>
            <h2 id="quantum-match-discovery-title" className="mt-1 text-2xl font-black leading-tight sm:text-3xl">
              {isTonight ? '오늘 밤, 같이 해볼까요?' : '날짜부터 잡고 제대로 만나요'}
            </h2>
            <p className={`mt-2 max-w-2xl text-sm font-bold leading-6 ${isTonight ? 'text-white/68' : 'text-boot-muted'}`}>
              {isTonight
                ? '사진 세 장을 1·2·3순위로 고르면, 한 신청 풀에서 Quantum이 기본 남 3·여 2 팀과 장소를 맞춰요.'
                : '활동 사진을 둘러보고 가능한 날짜를 모두 고르면, 한 신청 풀에서 한 일정만 확정해요.'}
            </p>
          </div>
          {isTonight
            ? <MoonStar size={24} className="mt-1 shrink-0 text-[#F3B95F]" aria-hidden="true" />
            : <CalendarDays size={24} className="mt-1 shrink-0 text-boot-primary" aria-hidden="true" />}
        </div>
      </header>

      <div
        role="group"
        aria-label="오늘 또는 이번 주 만나기 선택"
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
              aria-pressed={active}
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
      <div>
        {mode === 'tonight' ? (
          <TonightRankedEntryCard />
        ) : null}
        {mode === 'scheduled' ? <WeeklyActivityExplorer /> : null}
      </div>
      {mode === 'scheduled' ? <QuantumCoupleDoubleDateSpotlight /> : null}
    </section>
  )
}

function TonightRankedEntryCard() {
  return (
    <section className="overflow-hidden border-b border-boot-hairline bg-white shadow-[0_18px_42px_rgba(23,20,18,0.08)] sm:mx-auto sm:mt-5 sm:max-w-3xl sm:rounded-3xl sm:border">
      <div className="grid sm:grid-cols-[0.95fr_1.05fr]">
        <div className="relative min-h-[250px] overflow-hidden">
          <Image
            src="/images/match/quantum-tonight-five.webp"
            alt="오늘 밤 함께 활동할 대학생 팀"
            fill
            sizes="(max-width: 640px) 100vw, 360px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111820]/80 via-transparent to-transparent" />
          <p className="absolute bottom-4 left-4 right-4 text-sm font-black leading-6 text-white">
            세 활동을 먼저 보고,<br />순위와 동의는 다음 화면에서 정해요
          </p>
        </div>
        <div className="flex flex-col justify-center p-5 sm:p-7">
          <p className="text-[11px] font-black tracking-[0.16em] text-boot-primary">오늘 밤 · 부산대 파일럿</p>
          <h3 className="mt-2 text-2xl font-black leading-tight text-boot-ink">오늘 할 활동부터 둘러봐요</h3>
          <p className="mt-3 text-sm font-bold leading-6 text-boot-muted">
            실제 오늘의 세 활동을 먼저 보고, 다음 단계에서 1·2·3순위와 동의를 확인해요. 한 신청 풀에서 팀을 만든 뒤 팀의 순위 합산으로 활동을 정합니다. 여성 친구 3명이 함께 신청한 경우에만 남성 3명과 6명 팀으로 편성합니다.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-black text-boot-body">
            <span className="flex min-h-11 items-center gap-2 rounded-xl bg-boot-soft px-3"><Clock3 size={15} />18:30 마감</span>
            <span className="flex min-h-11 items-center gap-2 rounded-xl bg-boot-soft px-3"><Users size={15} />친구와 함께 가능</span>
          </div>
          <Link
            href="/tonight"
            className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-boot-primary px-4 text-base font-black text-white shadow-[0_14px_28px_rgba(255,79,105,0.24)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-boot-primary focus-visible:ring-offset-2"
          >
            오늘 활동 둘러보기
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </section>
  )
}
