'use client'

import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, CirclePlus, UsersRound } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { FeaturedMeetupIdea } from '@/lib/community/catalog'
import { getMeetupCapacityRecommendation } from '@/lib/community/catalog'
import { getMeetupCylinderOffset, getNextMeetupIdeaIndex } from '@/lib/community/meetup-cylinder'

interface MeetupIdeaCylinderProps {
  ideas: readonly FeaturedMeetupIdea[]
  onBrowseCategory: (category: FeaturedMeetupIdea['category']) => void
}

export default function MeetupIdeaCylinder({ ideas, onBrowseCategory }: MeetupIdeaCylinderProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const pointerStartX = useRef<number | null>(null)
  const activeIdea = ideas[activeIndex] ?? ideas[0]

  useEffect(() => {
    setActiveIndex(0)
  }, [ideas])

  if (!activeIdea) return null

  function move(direction: -1 | 1) {
    setActiveIndex((current) => getNextMeetupIdeaIndex(current, direction, ideas.length))
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStartX.current = event.clientX
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = pointerStartX.current
    pointerStartX.current = null
    if (start === null) return
    const distance = event.clientX - start
    if (Math.abs(distance) < 44) return
    move(distance < 0 ? 1 : -1)
  }

  return (
    <div
      data-layout="cylindrical-carousel"
      className="relative mt-4 overflow-hidden bg-[#121821] px-3 pb-5 pt-4 text-white sm:px-7 sm:pb-7"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black text-[#F3B95F]">사진으로 골라보기</p>
          <h3 className="mt-1 text-xl font-black">지금 끌리는 모임은?</h3>
        </div>
        <span className="text-xs font-black text-white/70">{activeIndex + 1} / {ideas.length}</span>
      </div>

      <div
        data-swipe-surface="meetup-ideas"
        className="relative mt-4 h-[430px] touch-pan-y sm:h-[470px]"
        style={{ perspective: '1200px', transformStyle: 'preserve-3d' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerStartX.current = null }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') move(-1)
          if (event.key === 'ArrowRight') move(1)
        }}
        tabIndex={0}
        aria-label="모임 아이디어 사진 넘기기"
      >
        {ideas.map((idea, index) => {
          const offset = getMeetupCylinderOffset(index, activeIndex, ideas.length)
          if (offset === null) return null
          const active = offset === 0
          const transform = active
            ? 'translate3d(-50%, 0, 70px) rotateY(0deg) scale(1)'
            : offset < 0
              ? 'translate3d(-116%, 18px, -120px) rotateY(31deg) scale(0.82)'
              : 'translate3d(16%, 18px, -120px) rotateY(-31deg) scale(0.82)'

          return (
            <button
              key={idea.id}
              type="button"
              aria-label={active ? `${idea.title}, 현재 선택` : `${idea.title} 보기`}
              onClick={() => setActiveIndex(index)}
              className={`absolute left-1/2 top-0 h-[410px] w-[min(78vw,330px)] overflow-hidden rounded-lg border text-left shadow-2xl transition-[transform,opacity] duration-200 motion-reduce:transition-none sm:h-[450px] sm:w-[360px] ${active ? 'z-20 border-boot-coral opacity-100' : 'z-10 border-white/20 opacity-55'}`}
              style={{ transform, transformStyle: 'preserve-3d' }}
            >
              <Image
                src={idea.imageSrc}
                alt={idea.imageAlt}
                fill
                priority={activeIndex < 2}
                sizes="(max-width: 640px) 78vw, 360px"
                className="object-cover"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black via-black/15 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-5">
                <span className="text-[11px] font-black text-[#F3B95F]">{idea.label}</span>
                <span className="mt-1 block text-2xl font-black leading-tight">{idea.title}</span>
                <span className="mt-2 block text-sm font-bold leading-6 text-white/78">{idea.description}</span>
                <span className="mt-3 flex items-center gap-1 text-xs font-black text-white/85">
                  <UsersRound size={15} /> 권장 {getMeetupCapacityRecommendation(idea.category)}명
                </span>
              </span>
              {active ? (
                <span className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-boot-primary text-white" aria-label="선택됨">
                  <Check size={21} strokeWidth={3} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="mt-1 flex items-center justify-center gap-3">
        <button type="button" onClick={() => move(-1)} aria-label="이전 모임" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/8 text-white hover:bg-white/14">
          <ArrowLeft size={20} />
        </button>
        <div className="flex min-w-20 items-center justify-center gap-1.5" aria-hidden="true">
          {ideas.map((idea, index) => (
            <span key={`${idea.title}-dot`} className={`h-1.5 rounded-full transition-all ${index === activeIndex ? 'w-6 bg-[#F3B95F]' : 'w-1.5 bg-white/35'}`} />
          ))}
        </div>
        <button type="button" onClick={() => move(1)} aria-label="다음 모임" className="flex h-12 w-12 items-center justify-center rounded-full border border-white/25 bg-white/8 text-white hover:bg-white/14">
          <ArrowRight size={20} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => onBrowseCategory(activeIdea.category)}
        className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-base font-black text-white transition-colors hover:bg-boot-primary-dark active:scale-[0.99]"
      >
        {activeIdea.title} 모임 보기 <ArrowRight size={18} />
      </button>
      <Link
        href={`/meetups/create?category=${activeIdea.category}&idea=${activeIdea.id}`}
        className="mt-3 flex min-h-16 w-full items-center gap-3 rounded-lg border border-[#F3B95F]/75 bg-white/[0.08] px-4 py-3 text-left text-white transition-colors hover:bg-white/[0.13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F3B95F] active:scale-[0.99]"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F3B95F] text-[#121821]">
          <CirclePlus size={20} strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black text-[#F3B95F]">원하는 시간이 없나요?</span>
          <span className="mt-0.5 block text-base font-black">내 시간으로 새 모임 열기</span>
          <span className="mt-0.5 block text-xs font-bold text-white/70">선택한 활동이 그대로 입력돼요</span>
        </span>
        <ArrowRight size={19} className="shrink-0" aria-hidden="true" />
      </Link>
    </div>
  )
}
