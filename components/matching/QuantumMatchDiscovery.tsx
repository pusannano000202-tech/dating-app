'use client'

import { ArrowRight, CalendarDays, Check, Clock3, MoonStar, Users } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import QuantumCoupleDoubleDateSpotlight from '@/components/matching/QuantumCoupleDoubleDateSpotlight'
import WeeklyActivityExplorer from '@/components/matching/WeeklyActivityExplorer'
import type { QuantumEventMode } from '@/lib/matching/quantum-event-catalog'
import s from './match-discovery.module.css'

const modeOptions: ReadonlyArray<{
  id: QuantumEventMode
  label: string
  detail: string
  image: string
  imageAlt: string
  timeCue: string
}> = [
  {
    id: 'tonight',
    label: '오늘 만나기',
    detail: '오늘 바로 가볍게 만나기',
    image: '/images/match/quantum-tonight-five.webp',
    imageAlt: '오늘 밤 함께 활동하는 대학생들의 분위기 예시',
    timeCue: '오늘 18:30 · 20:30 · 23:00',
  },
  {
    id: 'scheduled',
    label: '이번 주 만나기',
    detail: '원하는 날짜의 특별한 만남',
    image: '/images/match/quantum-scheduled-five.png',
    imageAlt: '날짜를 정해 함께 나들이하는 대학생들의 분위기 예시',
    timeCue: '금 · 토 · 일',
  },
]

export default function QuantumMatchDiscovery() {
  const [mode, setMode] = useState<QuantumEventMode>('tonight')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('discovery') === 'scheduled') setMode('scheduled')
  }, [])

  return (
    <section aria-labelledby="quantum-match-discovery-title" className={s.discovery}>
      <header className={s.heading}>
        <h2 id="quantum-match-discovery-title">언제 만나볼까요?</h2>
        <p>끌리는 활동과 일정을 먼저 둘러봐요.</p>
      </header>

      <div role="group" aria-label="오늘 또는 이번 주 만나기 선택" data-layout="mode-scene-switch" className={s.modeCards}>
        {modeOptions.map((option) => {
          const active = option.id === mode
          const OptionIcon = option.id === 'tonight' ? MoonStar : CalendarDays
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              aria-controls="match-discovery-selection"
              onClick={() => setMode(option.id)}
              className={`${s.sceneCard} ${active ? s.active : ''}`}
            >
              <span className={s.photo}>
                <Image src={option.image} alt={option.imageAlt} fill sizes="(min-width: 900px) 160px, 36vw" className={s.image} />
              </span>
              <span className={s.sceneCopy} data-layout="time-context-switch">
                <span className={s.category}><OptionIcon size={14} aria-hidden="true" />{option.id === 'tonight' ? '오늘 밤' : '이번 주'}</span>
                <span className={s.title}>{option.label}</span>
                <span className={s.description}>{option.detail}</span>
                <span className={s.timeCue}>{option.timeCue}</span>
                <span className={s.cardAction}>
                  {active ? '선택한 일정' : '활동 살펴보기'}
                  {active ? <Check size={15} strokeWidth={2.5} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div id="match-discovery-selection">
        {mode === 'tonight' ? <TonightRankedEntryCard /> : null}
        {mode === 'scheduled' ? <WeeklyActivityExplorer /> : null}
      </div>
      {mode === 'scheduled' ? <QuantumCoupleDoubleDateSpotlight /> : null}
    </section>
  )
}

function TonightRankedEntryCard() {
  return (
    <section className={s.selectionPanel} aria-labelledby="tonight-entry-title">
      <div>
        <p className={s.category}>오늘 밤 · 부산대 파일럿</p>
        <h3 id="tonight-entry-title" className={s.selectionTitle}>오늘 할 활동부터 둘러봐요</h3>
        <p className={s.description}>오늘의 세 활동을 보고, 다음 화면에서 1·2·3순위와 동의를 정해요.</p>
        <div className={s.facts}>
          <span><Clock3 size={14} aria-hidden="true" />18:30 마감</span>
          <span><Users size={14} aria-hidden="true" />친구와 함께 가능</span>
        </div>
      </div>
      <Link href="/tonight" className={s.primaryAction}>오늘 활동 둘러보기 <ArrowRight size={17} aria-hidden="true" /></Link>
      <details className={s.rules}>
        <summary>팀이 정해지는 방식</summary>
        <p>한 신청 풀에서 Quantum이 기본 남 3·여 2 팀과 장소를 맞춰요. 팀을 만든 뒤 팀의 순위 합산으로 활동을 정합니다. 여성 친구 3명이 함께 신청한 경우에만 남성 3명과 6명 팀으로 편성합니다.</p>
      </details>
    </section>
  )
}
