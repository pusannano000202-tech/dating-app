'use client'

import Image from 'next/image'
import { Clock3, GripVertical, Medal } from 'lucide-react'

import { moveRankedActivity } from './ranking'
import type { TonightActivityCard } from './types'

const RANK_LABELS = ['첫 번째로 하고 싶어요', '두 번째도 좋아요', '세 번째도 괜찮아요'] as const

export default function ActivityRanker({
  activities,
  rankedIds,
  onChange,
  disabled = false,
}: {
  activities: readonly [TonightActivityCard, TonightActivityCard, TonightActivityCard]
  rankedIds: readonly string[]
  onChange: (ids: readonly [string, string, string]) => void
  disabled?: boolean
}) {
  const rankedActivities = rankedIds
    .map((id) => activities.find((activity) => activity.id === id))
    .filter((activity): activity is TonightActivityCard => Boolean(activity))

  if (rankedActivities.length !== 3) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-900" role="alert">
        활동 3개를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.
      </div>
    )
  }

  const setRank = (activityId: string, rank: 1 | 2 | 3) => {
    const moved = moveRankedActivity(rankedIds, activityId, rank)
    onChange(moved as [string, string, string])
  }

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="sr-only">오늘 하고 싶은 활동 세 개의 순위를 정해 주세요</legend>
      <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:mx-0 lg:grid lg:grid-cols-3 lg:overflow-visible lg:px-0 lg:pb-0">
        {rankedActivities.map((activity, index) => (
          <article
            key={activity.id}
            className="group w-[82vw] max-w-[340px] shrink-0 snap-center overflow-hidden rounded-[26px] border border-[#ead9d2] bg-white shadow-[0_16px_38px_rgba(67,39,30,0.07)] transition focus-within:border-[#b94b3f] focus-within:ring-2 focus-within:ring-[#b94b3f]/15 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(67,39,30,0.11)] lg:w-auto lg:max-w-none"
          >
            <button
              type="button"
              onClick={() => setRank(activity.id, 1)}
              disabled={disabled}
              aria-label={`${activity.title}을 1순위로 선택`}
              className="relative block h-44 w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#b94b3f] sm:h-52 lg:h-44"
            >
              <Image
                src={activity.imageUrl}
                alt={activity.imageAlt}
                fill
                sizes="(min-width: 1024px) 30vw, 100vw"
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
              <span className="absolute left-4 top-4 inline-flex h-10 min-w-10 items-center justify-center rounded-full bg-white px-3 text-sm font-black text-[#b94b3f] shadow-lg">
                {index + 1}순위
              </span>
              <p className="absolute bottom-4 left-4 right-4 text-lg font-black leading-snug text-white">
                {activity.title}
              </p>
            </button>

            <div className="p-4">
              <p className="min-h-[44px] text-sm font-semibold leading-[1.55] text-[#665c58]">{activity.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs font-black text-[#8b7e78]">
                <Clock3 className="h-4 w-4" aria-hidden />
                약 {activity.durationMinutes}분
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f1e5df] pt-3">
                <span className="inline-flex items-center gap-1 text-xs font-bold text-[#8b7e78]">
                  <GripVertical className="h-4 w-4" aria-hidden />
                  순위 바꾸기
                </span>
                <div className="flex gap-1.5" role="group" aria-label={`${activity.title} 순위 선택`}>
                  {([1, 2, 3] as const).map((rank) => (
                    <button
                      key={rank}
                      type="button"
                      onClick={() => setRank(activity.id, rank)}
                      disabled={disabled}
                      aria-label={`${activity.title} ${rank}순위`}
                      aria-pressed={rank === index + 1}
                      className={`flex h-11 w-11 items-center justify-center rounded-full text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b94b3f] focus-visible:ring-offset-2 ${
                        rank === index + 1
                          ? 'bg-[#b94b3f] text-white'
                          : 'border border-[#ead9d2] bg-[#fffaf7] text-[#665c58] hover:border-[#b94b3f]'
                      }`}
                    >
                      {rank === 1 && <Medal className="h-3.5 w-3.5" aria-hidden />}
                      <span className={rank === 1 ? 'sr-only' : ''}>{rank}</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="mt-3 text-xs font-black text-[#b94b3f]">{RANK_LABELS[index]}</p>
            </div>
          </article>
        ))}
      </div>
    </fieldset>
  )
}
