'use client'

import { ArrowLeft, ArrowRight, Check, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'

import { MEETING_GUIDE_SCENES } from '@/lib/matching/meeting-guide'

export default function MeetingGuideStory({ onComplete }: { onComplete?: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [reduceMotion, setReduceMotion] = useState(false)
  const scene = MEETING_GUIDE_SCENES[activeIndex]
  const isLast = activeIndex === MEETING_GUIDE_SCENES.length - 1

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduceMotion(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  function previous() {
    setActiveIndex((index) => Math.max(0, index - 1))
  }

  function next() {
    if (isLast) {
      onComplete?.()
      return
    }
    setActiveIndex((index) => Math.min(MEETING_GUIDE_SCENES.length - 1, index + 1))
  }

  return (
    <section aria-labelledby="meeting-guide-title" className="overflow-hidden rounded-lg border border-boot-hairline bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-boot-hairline px-4 py-3">
        <div>
          <p className="text-[11px] font-black text-boot-primary">참여 전 1분 안내</p>
          <h2 id="meeting-guide-title" className="mt-0.5 text-base font-black">만남이 편해지는 여섯 가지 약속</h2>
        </div>
        <span className="text-xs font-black text-boot-muted">{scene.stepNumber} / {MEETING_GUIDE_SCENES.length}</span>
      </div>

      <div className={`grid md:grid-cols-[minmax(300px,1.05fr)_minmax(0,0.95fr)] ${reduceMotion ? '' : 'transition-opacity duration-200'}`}>
        <div
          data-layout="character-speech-overlay"
          data-scene-step={scene.stepNumber}
          className="relative aspect-[3/4] w-full self-start overflow-hidden bg-[#DFF3F0] bg-no-repeat"
          role="img"
          aria-label={`${scene.title} 안내 그림과 대화`}
          style={{
            backgroundImage: "url('/images/match/meeting-rules-comic-v2.webp')",
            backgroundSize: '200% 300%',
            backgroundPosition: `${scene.imageCell.column * 100}% ${scene.imageCell.row * 50}%`,
          }}
        >
          <div className="absolute inset-0 bg-black/[0.02]" aria-hidden="true" />
          <div className="absolute inset-0" aria-label="안내 대화">
            {getComicBubbleGroups(scene.stepNumber, scene.dialogue).map((group, index) => (
              <div
                key={`${scene.stepNumber}-${index}`}
                data-bubble="comic"
                data-bubble-index={index}
                className={`absolute flex flex-col items-center justify-center px-2 text-center text-[#172126] sm:px-3 ${getComicBubblePlacement(scene.stepNumber, index)}`}
              >
                {group.map((bubble) => (
                  <div
                    key={`${bubble.speaker}-${bubble.text}`}
                    className="flex h-full w-full max-w-full flex-col items-center justify-center text-center"
                  >
                    <p className={`${getComicSpeakerSizeClassName(scene.stepNumber)} font-black leading-none ${getComicSpeakerClassName(bubble.tone)}`}>{bubble.speaker}</p>
                    <p className={`mt-1 font-black leading-[1.2] tracking-[0] ${getComicBodySizeClassName(scene.stepNumber)}`}>
                      {bubble.lines.map((line) => (
                        <span key={line} className="block whitespace-nowrap">{line}</span>
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[300px] flex-col px-4 py-4 sm:min-h-[360px] sm:px-6 sm:py-5">
          <p className="text-xs font-black text-[#147A70]">{scene.eyebrow}</p>
          <h3 className="mt-1 text-xl font-black leading-tight text-boot-ink">{scene.title}</h3>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">{scene.description}</p>

          <div className="mt-5 flex items-start gap-3 border-y border-boot-hairline py-4">
            <ShieldCheck size={20} className="mt-0.5 shrink-0 text-boot-primary" aria-hidden="true" />
            <p className="text-xs font-bold leading-5 text-boot-muted">
              여섯 장을 모두 확인해야 참여 신청이 열립니다. 안내를 닫으면 신청은 저장되지 않아요.
            </p>
          </div>

          <div className="mt-auto pt-4 sm:pt-6">
            <div className="mb-3 flex justify-center gap-1.5" aria-hidden="true">
              {MEETING_GUIDE_SCENES.map((item, index) => (
                <span key={item.stepNumber} className={`h-1.5 rounded-full ${index === activeIndex ? 'w-6 bg-boot-primary' : 'w-1.5 bg-boot-hairline'}`} />
              ))}
            </div>
            <div className="grid grid-cols-[48px_1fr] gap-2">
              <button
                type="button"
                aria-label="이전"
                disabled={activeIndex === 0}
                onClick={previous}
                className="flex min-h-12 items-center justify-center rounded-lg border border-boot-hairline text-boot-ink disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ArrowLeft size={19} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={next}
                className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white"
              >
                {isLast ? <><Check size={18} aria-hidden="true" /> 안내 확인 완료</> : <>다음 <ArrowRight size={18} aria-hidden="true" /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function getComicBubbleGroups(
  _stepNumber: number,
  dialogue: typeof MEETING_GUIDE_SCENES[number]['dialogue'],
) {
  return dialogue.map((bubble) => [bubble])
}

function getComicBubblePlacement(stepNumber: number, bubbleIndex: number) {
  const placements: Record<number, readonly string[]> = {
    1: ['left-[17%] top-[8%] h-[18%] w-[45%]', 'left-[28%] top-[74%] h-[21%] w-[52%]'],
    2: ['left-[37%] top-[8%] h-[18%] w-[53%]', 'left-[10%] top-[74%] h-[23%] w-[58%]'],
    3: ['left-[17%] top-[2%] h-[19%] w-[57%]', 'left-[55%] top-[68%] h-[18%] w-[32%] px-1'],
    4: ['left-[21%] top-[2%] h-[19%] w-[51%]', 'left-[8%] top-[70%] h-[20%] w-[62%]'],
    5: ['left-[18%] top-[2%] h-[19%] w-[58%] gap-0'],
    6: ['left-[19%] top-[2%] h-[19%] w-[53%]', 'left-[13%] top-[80%] h-[18%] w-[52%]'],
  }
  return placements[stepNumber]?.[bubbleIndex] ?? 'left-[10%] top-[5%] h-[20%] w-[80%]'
}

function getComicSpeakerSizeClassName(_stepNumber: number) {
  return 'text-[11px] sm:text-[12px]'
}

function getComicBodySizeClassName(_stepNumber: number) {
  return 'text-[15px] sm:text-[16px]'
}

function getComicSpeakerClassName(tone: 'participant' | 'quantum' | 'warning') {
  if (tone === 'warning') return 'text-[#B33B2E]'
  if (tone === 'quantum') return 'text-[#147A70]'
  return 'text-[#40515B]'
}
