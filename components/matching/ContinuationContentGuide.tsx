'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import DalmutiRulesGuide from '@/components/matching/DalmutiRulesGuide'
import {
  getContinuationGuideRosterNote,
  getContinuationContentGuideForDay,
  resolveContinuationGuideArtworks,
  type ContinuationGuideMode,
} from '@/lib/matching/continuation-content-guide'

type ContinuationContentGuideProps = {
  programDay: number
  selectedGame?: string
  rosterSize?: number
  mode?: ContinuationGuideMode
}

function formatGuideWindow(offsetMinutes: number, durationMinutes: number) {
  return `${offsetMinutes}–${offsetMinutes + durationMinutes}분`
}

export default function ContinuationContentGuide({ programDay, selectedGame, rosterSize, mode = 'preview' }: ContinuationContentGuideProps) {
  const scenes = getContinuationContentGuideForDay(programDay)
  const [sceneIndex, setSceneIndex] = useState(0)

  useEffect(() => { setSceneIndex(0) }, [programDay])

  if (!scenes.length) return null

  const safeIndex = Math.min(sceneIndex, scenes.length - 1)
  const scene = scenes[safeIndex]
  const artworks = resolveContinuationGuideArtworks(scene, { selectedGame, rosterSize, mode })
  const rosterNote = getContinuationGuideRosterNote(scene, rosterSize, mode)

  const guideBody = (
    <div className={mode === 'occurrence' ? 'pt-4' : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.12em] text-[#B94B3F]">활동 안내 · 넘겨보아도 실제 진행은 바뀌지 않아요</p>
          {mode === 'occurrence'
            ? <p className="mt-1 text-xs font-bold leading-5 text-[#6C5953]">실제 진행은 아래 진행 영역에서 확인하고, 안내 보기는 저장되지 않아요.</p>
            : <p className="mt-1 text-xs font-bold leading-5 text-[#6C5953]">전체 일정 정보는 학습용이며 실제 확정 일정은 최신 진행 화면을 확인해 주세요.</p>}
        </div>
        <p aria-live="polite" className="shrink-0 rounded-full bg-[#FCECE6] px-3 py-1 text-xs font-black text-[#7C3E35]">{safeIndex + 1} / {scenes.length}</p>
      </div>

      <div className={`mt-4 min-h-44 overflow-hidden rounded-2xl bg-white ${artworks.length > 1 ? 'grid gap-2 sm:grid-cols-2' : 'flex items-center justify-center'}`}>
        {artworks.map((artwork) => (
          <div key={`${artwork.src}-${artwork.alt}`} className="flex min-h-44 items-center justify-center overflow-hidden">
            <Image src={artwork.src} alt={artwork.alt} width={960} height={640} sizes="(max-width: 640px) 100vw, 560px" className="max-h-[40dvh] w-full object-contain" />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <p className="text-xs font-black text-[#B94B3F]">예시 순서 · {formatGuideWindow(scene.offsetMinutes, scene.durationMinutes)} · {scene.durationMinutes}분</p>
        <p className="mt-2 text-xs font-black text-[#B94B3F]">장면 {safeIndex + 1}</p>
        <h2 className="mt-1 text-lg font-black leading-7">{scene.title}</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-[#6C5953]">{scene.body}</p>
        {rosterNote ? <p className="mt-3 rounded-2xl border border-[#EAD9D2] bg-white px-3 py-2 text-xs font-bold leading-5 text-[#6C5953]">{rosterNote}</p> : null}
        <p className="mt-3 rounded-2xl bg-[#FCECE6] px-3 py-2 text-sm font-black leading-6 text-[#7C3E35]">지금 알아둘 점 · {scene.nextAction}</p>
      </div>

      <ul aria-label="장면 말풍선 안내" className="mt-3 space-y-2">
        {scene.speech.map((speech) => <li key={speech} className="rounded-2xl border border-[#EAD9D2] bg-white px-3 py-2 text-sm font-bold leading-6 text-[#6C5953]">“{speech}”</li>)}
      </ul>

      {scene.id === 'day1_dalmuti_rules' ? <DalmutiRulesGuide /> : null}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" disabled={safeIndex === 0} onClick={() => setSceneIndex((current) => Math.max(0, current - 1))} className="min-h-11 rounded-2xl border border-[#D96B5D]/30 bg-white px-3 text-sm font-black text-[#7C3E35] disabled:opacity-45">이전 안내</button>
        <button type="button" disabled={safeIndex === scenes.length - 1} onClick={() => setSceneIndex((current) => Math.min(scenes.length - 1, current + 1))} className="min-h-11 rounded-2xl bg-[#B94B3F] px-3 text-sm font-black text-white disabled:opacity-45">다음 안내</button>
      </div>
    </div>
  )

  return (
    <section aria-label={`Day ${programDay} 활동 안내`} className="mb-5 overflow-hidden rounded-3xl border border-[#EAD9D2] bg-[#FFF9F6] p-4 text-[#3C2B27]">
      {mode === 'occurrence'
        ? <details><summary className="min-h-11 cursor-pointer py-3 text-sm font-black text-[#7C3E35]">활동 안내 보기</summary>{guideBody}</details>
        : guideBody}
    </section>
  )
}
