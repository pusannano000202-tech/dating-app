'use client'

import Image from 'next/image'
import { ArrowLeft, ArrowRight, Clock3, ImageOff, Users } from 'lucide-react'
import { type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'

import type { TonightActivityCard } from './types'
import styles from './tonight-journey.module.css'

export default function TonightActivityExplorer({
  activities,
  activeIndex,
  onActiveIndexChange,
  onContinue,
  headingRef,
  summary,
  dateLabel,
  onPreview,
  disabled = false,
  disabledReason = '신청 상태 확인이 필요해요',
}: {
  activities: readonly [TonightActivityCard, TonightActivityCard, TonightActivityCard]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  onContinue: () => void
  headingRef?: RefObject<HTMLHeadingElement | null>
  summary?: ReactNode
  dateLabel?: string
  onPreview?: () => void
  disabled?: boolean
  disabledReason?: string
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<Array<HTMLElement | null>>([])
  const hasInitialCarouselAlignment = useRef(false)
  const [failedImageIds, setFailedImageIds] = useState<ReadonlySet<string>>(new Set())
  const safeIndex = Math.min(Math.max(activeIndex, 0), activities.length - 1)

  const moveTo = (index: number) => {
    const nextIndex = ((index % activities.length) + activities.length) % activities.length
    onActiveIndexChange(nextIndex)
    cardRefs.current[nextIndex]?.scrollIntoView({
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'start',
    })
  }

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    let frame = 0
    const updateIndex = () => {
      frame = 0
      const containerLeft = container.getBoundingClientRect().left
      const closestIndex = cardRefs.current.reduce((closest, card, index) => {
        if (!card) return closest
        const currentDistance = Math.abs(card.getBoundingClientRect().left - containerLeft)
        const closestCard = cardRefs.current[closest]
        const closestDistance = closestCard
          ? Math.abs(closestCard.getBoundingClientRect().left - containerLeft)
          : Number.POSITIVE_INFINITY
        return currentDistance < closestDistance ? index : closest
      }, 0)
      if (closestIndex !== safeIndex) onActiveIndexChange(closestIndex)
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(updateIndex)
    }
    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [safeIndex, onActiveIndexChange])

  useEffect(() => {
    if (hasInitialCarouselAlignment.current) return
    const container = scrollRef.current
    const activeCard = cardRefs.current[safeIndex]
    if (!container || !activeCard) return
    container.scrollTo({ left: activeCard.offsetLeft, behavior: 'auto' })
    hasInitialCarouselAlignment.current = true
  }, [safeIndex])

  const activeActivity = activities[safeIndex]

  return (
    <section aria-labelledby="tonight-explorer-title" className="pb-4">
      <div className="relative mb-5 pr-14">
        <div>
          <p className="text-xs font-black tracking-[0.14em] text-[#b94b3f]">{dateLabel ?? 'PNU TONIGHT'}</p>
          <h1 ref={headingRef} id="tonight-explorer-title" tabIndex={-1} className="mt-2 text-[30px] font-black tracking-[-0.05em] text-[#292321] outline-none sm:text-4xl">오늘밤 만나기</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">어떤 저녁을 함께 보낼까요?</p>
        </div>
        <p className="absolute right-0 top-0 text-sm font-black text-[#b94b3f]" aria-live="polite" aria-atomic="true">
          활동 {safeIndex + 1}/3<span className="sr-only"> · {activeActivity.title}</span>
        </p>
      </div>

      {summary}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-6">
        <div>
          <div
            ref={scrollRef}
            className="-mr-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pr-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mr-0 lg:max-w-[752px] lg:pr-0"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); moveTo(safeIndex - 1) }
          if (event.key === 'ArrowRight') { event.preventDefault(); moveTo(safeIndex + 1) }
          if (event.key === 'Home') { event.preventDefault(); moveTo(0) }
          if (event.key === 'End') { event.preventDefault(); moveTo(activities.length - 1) }
        }}
            aria-label="오늘 활동 둘러보기"
          >
            {activities.map((activity, index) => {
          const imageFailed = failedImageIds.has(activity.id)
          return (
            <article
              key={activity.id}
              ref={(node) => { cardRefs.current[index] = node }}
              tabIndex={index === safeIndex ? 0 : -1}
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${activities.length}: ${activity.title}`}
              data-title={activity.title}
              data-description={activity.description}
              data-duration={activity.durationMinutes}
              className="w-[calc(100%-24px)] shrink-0 snap-start overflow-hidden rounded-[22px] border border-[#ead9d2] bg-white shadow-[0_4px_14px_rgba(67,39,30,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f] focus-visible:ring-offset-2 lg:w-[calc(100%-32px)]"
            >
              <div className="relative h-[250px] bg-[#f4e9e4] sm:h-[320px]">
                {imageFailed ? (
                  <div className="flex h-full flex-col items-center justify-center bg-[#f4e9e4] text-[#8b7e78]">
                    <ImageOff className="h-8 w-8" aria-hidden />
                    <span className="mt-2 text-xs font-black">사진을 불러오지 못했어요</span>
                  </div>
                ) : (
                  <Image
                    src={activity.imageUrl}
                    alt={activity.imageAlt}
                    fill
                    sizes="(min-width: 1024px) 600px, calc(100vw - 56px)"
                    className="object-cover"
                    onError={() => setFailedImageIds((current) => new Set([...current, activity.id]))}
                  />
                )}
                {!imageFailed && <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />}
                <span className="absolute left-4 top-4 rounded-full bg-white/[0.92] px-3 py-1.5 text-xs font-black text-[#b94b3f] shadow-sm">오늘의 활동</span>
                {!imageFailed && <h2 className="absolute bottom-5 left-5 right-5 text-[25px] font-black leading-tight tracking-[-0.04em] text-white">{activity.title}</h2>}
              </div>
              <div className="p-4">
                {imageFailed && <h2 className="text-xl font-black tracking-[-0.04em] text-[#292321]">{activity.title}</h2>}
                <p className="text-sm font-semibold leading-6 text-[#665c58]">{activity.description}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-sm font-black text-[#8b7e78]"><Clock3 className="h-4 w-4" aria-hidden />약 {activity.durationMinutes}분</p>
              </div>
            </article>
          )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button type="button" onClick={() => moveTo(safeIndex - 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ead9d2] bg-white text-[#665c58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f]" aria-label="이전 활동"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
            <p className="text-xs font-bold text-[#8b7e78]">{activeActivity.title}을 보고 있어요</p>
            <button type="button" onClick={() => moveTo(safeIndex + 1)} className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#ead9d2] bg-white text-[#665c58] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f]" aria-label="다음 활동"><ArrowRight className="h-5 w-5" aria-hidden /></button>
          </div>
        </div>

        <div className="mt-5 rounded-[22px] border border-[#ead9d2] bg-white p-5 lg:mt-0 lg:self-start">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-[#b94b3f]" aria-hidden />
          <div className="text-sm font-semibold leading-6 text-[#665c58]">
            <p className="font-black text-[#292321]">활동이 달라도, 신청은 한곳에서.</p>
            <p className="mt-2 text-xs leading-5">한 신청 풀에서 팀을 만든 뒤, 팀의 순위 합산으로 활동을 정해요.</p>
          </div>
        </div>
        <button type="button" onClick={onContinue} disabled={disabled} className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-[#b94b3f] px-5 text-base font-black text-white shadow-[0_8px_18px_rgba(185,75,63,0.18)] transition hover:bg-[#963d34] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f] focus-visible:ring-offset-2">
          {disabled ? disabledReason : '세 활동 순위 정하러 가기'}
          <ArrowRight className="h-5 w-5" aria-hidden />
        </button>
        <div className="mt-3 space-y-1 text-xs font-semibold leading-5 text-[#665c58]">
          <p>둘러보기만으로는 신청되지 않아요</p>
          <p>다음 단계에서 1·2·3순위와 동의를 확인해요</p>
        </div>
        {onPreview && <button type="button" onClick={onPreview} className={styles.previewLink}>만나면 뭘 하나요? <ArrowRight size={16} aria-hidden /></button>}
      </div>
      </div>
    </section>
  )
}
