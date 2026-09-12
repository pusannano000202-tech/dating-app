'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { getActivityContent } from '@/lib/meetups/activity-content'

export default function ActivityPromptDeck({ activityKey, category }: { activityKey: string | null; category: string }) {
  const pack = getActivityContent(activityKey, category)
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const current = Math.min(index, pack.prompts.length - 1)
  if (dismissed) return <button type="button" onClick={() => setDismissed(false)} className="mt-3 min-h-11 rounded-full border border-boot-hairline px-4 text-sm font-bold">대화 카드 다시 열기</button>
  return <aside className="mt-4 rounded-3xl border border-boot-primary/15 bg-boot-soft p-5" aria-label="선택형 대화 카드">
    <div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-xs font-black text-boot-primary"><MessageCircle size={16}/>한 장으로 말문 열기</span><span className="text-xs text-boot-muted">{current + 1} / {pack.prompts.length}</span></div>
    <p aria-live="polite" className="my-5 break-keep text-xl font-black leading-relaxed">{pack.prompts[current]}</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" onClick={() => setDismissed(true)} className="min-h-11 px-2 text-sm font-bold text-boot-muted">자유롭게 진행</button>
      <div className="flex gap-2"><button type="button" aria-label="이전 대화 카드" onClick={() => setIndex((current + pack.prompts.length - 1) % pack.prompts.length)} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline bg-white"><ChevronLeft size={19}/></button><button type="button" aria-label="다른 대화 카드" onClick={() => setIndex((current + 1) % pack.prompts.length)} className="flex h-11 w-11 items-center justify-center rounded-full bg-boot-primary text-white"><ChevronRight size={19}/></button></div>
    </div>
    <p className="mt-3 text-xs leading-5 text-boot-muted">답하지 않고 넘겨도 좋아요. 카드를 넘겨도 실제 모임 진행 상태는 바뀌지 않아요.</p>
  </aside>
}
