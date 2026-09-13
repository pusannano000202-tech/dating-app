'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle } from 'lucide-react'
import { voiceConversationPrompts, type VoicePromptContext } from '@/lib/community/voice-conversation-prompts'

export default function VoiceConversationPrompts(context: VoicePromptContext) {
  const pack = voiceConversationPrompts(context)
  const [index, setIndex] = useState(0)
  const [hidden, setHidden] = useState(false)
  const current = index % pack.cards.length
  if (hidden) return <button type="button" className="min-h-11 rounded-full border border-boot-hairline px-4 text-sm font-bold" onClick={() => setHidden(false)}>대화 카드 다시 열기</button>
  return <aside className="rounded-3xl border border-boot-hairline bg-white p-5 text-boot-ink" aria-label="선택형 보이스 대화 카드">
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-xs font-black text-boot-primary"><MessageCircle size={16}/>{pack.label}</span>
      <span className="shrink-0 text-xs text-boot-muted">{current + 1} / {pack.cards.length}</span>
    </div>
    <p aria-live="polite" className="my-5 break-keep text-lg font-black leading-relaxed">{pack.cards[current]}</p>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button type="button" onClick={() => setHidden(true)} className="min-h-11 px-2 text-sm font-bold text-boot-muted">자유롭게 대화</button>
      <div className="flex gap-2">
        <button type="button" aria-label="이전 보이스 대화 카드" onClick={() => setIndex((current + pack.cards.length - 1) % pack.cards.length)} className="flex h-11 w-11 items-center justify-center rounded-full border border-boot-hairline"><ChevronLeft size={18}/></button>
        <button type="button" aria-label="다른 보이스 대화 카드" onClick={() => setIndex((current + 1) % pack.cards.length)} className="flex h-11 w-11 items-center justify-center rounded-full bg-boot-primary text-white"><ChevronRight size={18}/></button>
      </div>
    </div>
    <p className="mt-3 text-xs leading-5 text-boot-muted">혼자 보는 참고 카드예요. 답하지 않아도 되고, 카드를 넘겨도 상대나 통화 상태는 바뀌지 않아요.</p>
    <Link href={pack.nextHref} className="mt-4 flex min-h-11 items-center justify-between gap-2 border-t border-boot-hairline pt-3 text-sm font-bold">{pack.nextLabel}<ChevronRight size={17}/></Link>
    <p className="mt-1 text-xs leading-5 text-boot-muted">둘러보기만 열려요. 새 모임 참가나 친구 추가는 별도 선택이에요.</p>
  </aside>
}
