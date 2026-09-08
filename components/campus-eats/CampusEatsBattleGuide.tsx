'use client'

import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react'
import { useState } from 'react'

import { CAMPUS_EATS_BATTLE_GUIDE_SCENES } from '@/lib/campus-eats/battle-guide'

type Props = {
  onComplete: () => void
  onClose?: () => void
}

const backgroundPositions = {
  top: '50% 0%',
  center: '50% 50%',
  bottom: '50% 100%',
} as const

export default function CampusEatsBattleGuide({ onComplete, onClose }: Props) {
  const [sceneIndex, setSceneIndex] = useState(0)
  const scene = CAMPUS_EATS_BATTLE_GUIDE_SCENES[sceneIndex]
  const isFirst = sceneIndex === 0
  const isLast = sceneIndex === CAMPUS_EATS_BATTLE_GUIDE_SCENES.length - 1

  return (
    <article
      data-layout="campus-eats-comic-guide"
      className="overflow-hidden rounded-lg border border-[#173b3a]/15 bg-white shadow-[0_24px_80px_rgba(7,34,32,0.28)]"
    >
      <header className="flex items-start justify-between gap-4 border-b border-[#d8e5e2] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[11px] font-black text-[#087f78]">맛집 월드컵 진행 방법</p>
          <h2 className="mt-1 break-keep text-xl font-black leading-tight text-[#173b3a]">{scene.title}</h2>
        </div>
        <p className="shrink-0 text-sm font-black text-[#607875]">{scene.stepNumber} / {CAMPUS_EATS_BATTLE_GUIDE_SCENES.length}</p>
      </header>

      <div
        className="relative aspect-[2/1] w-full overflow-hidden bg-[#f0eee8]"
        style={{
          backgroundImage: "url('/campus-eats/campus-eats-battle-guide-v1.png')",
          backgroundPosition: backgroundPositions[scene.imagePosition],
          backgroundRepeat: 'no-repeat',
          backgroundSize: '100% 300%',
        }}
        role="img"
        aria-label={`${scene.eyebrow}. ${scene.description}`}
      >
        <div
          data-bubble="comic"
          className="absolute left-[34%] top-[6%] flex h-[31%] w-[33%] items-center justify-center px-[3%] text-center"
        >
          <p className="break-keep text-[clamp(11px,2.8vw,20px)] font-black leading-[1.25] text-[#173b3a]">
            {scene.dialogue.map((line) => <span key={line} className="block">{line}</span>)}
          </p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <p className="text-[11px] font-black text-[#d58a18]">{scene.eyebrow}</p>
        <p className="mt-1 break-keep text-sm font-bold leading-6 text-[#476c68]">{scene.description}</p>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSceneIndex((current) => Math.max(0, current - 1))}
            disabled={isFirst}
            aria-label="이전 안내"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[#cddfdb] text-[#315a57] disabled:opacity-35"
          >
            <ArrowLeft size={19} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => isLast ? onComplete() : setSceneIndex((current) => current + 1)}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-[#087f78] px-4 text-sm font-black text-white hover:bg-[#066c66]"
          >
            {isLast ? <><Check size={18} aria-hidden="true" />안내 확인 완료</> : <>다음 안내<ArrowRight size={18} aria-hidden="true" /></>}
          </button>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="안내 닫기"
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#cddfdb] bg-white px-4 text-sm font-black text-[#315a57] hover:bg-[#f3f8f7]"
          >
            <X size={17} aria-hidden="true" />
            안내 닫기
          </button>
        ) : null}
      </div>
    </article>
  )
}
