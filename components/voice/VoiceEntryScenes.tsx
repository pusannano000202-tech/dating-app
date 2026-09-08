'use client'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import type { AdviceRole, AdviceTopic } from '@/lib/voice/contracts'
import s from './voice-entry.module.css'

export type EntryTopic = AdviceTopic | 'social'
export const ENTRY_TOPICS: { id: EntryTopic; label: string; image: string; prompt: string }[] = [
  { id: 'romance', label: '연애', image: '/social-scenes/voice-talker-v2.webp', prompt: '이런 마음, 다들 느끼나요?' },
  { id: 'career', label: '취업·진로', image: '/social-scenes/voice-career-v2.webp', prompt: '내가 가는 방향, 괜찮은 걸까요?' },
  { id: 'social', label: '가벼운 수다', image: '/social-scenes/voice-social-v2.webp', prompt: '오늘 하루는 어땠어요?' },
  { id: 'general', label: '고민 전반', image: '/social-scenes/voice-listener-v2.webp', prompt: '어디서부터 말해야 할지 모르겠어요.' },
]

export default function VoiceEntryScenes({ selected, role, disabled, onRole, onTopic }: {
  selected: EntryTopic; role: AdviceRole | null; disabled: boolean
  onRole: (role: AdviceRole) => void; onTopic: (topic: EntryTopic) => void
}) {
  const rail = useRef<HTMLDivElement>(null)
  const index = ENTRY_TOPICS.findIndex(item => item.id === selected)
  useEffect(() => {
    const container = rail.current
    const button = container?.querySelector<HTMLButtonElement>(`[data-topic="${selected}"]`)
    if (!container || !button) return
    // Only move the horizontal rail; selecting a topic must not jump the page.
    container.scrollTo({ left: container.scrollLeft + button.getBoundingClientRect().left - container.getBoundingClientRect().left - (container.clientWidth - button.clientWidth) / 2, behavior: 'auto' })
  }, [selected])
  function choose(topic: EntryTopic, focus = false) {
    onTopic(topic)
    if (focus) rail.current?.querySelector<HTMLButtonElement>(`[data-topic="${topic}"]`)?.focus({ preventScroll: true })
  }
  function move(direction: number, focus = false) { choose(ENTRY_TOPICS[(index + direction + ENTRY_TOPICS.length) % ENTRY_TOPICS.length].id, focus) }
  return <>
    {selected !== 'social' ? <div className={s.roles} role="group" aria-label="고민 대화 역할">
      {([
        { id: 'talker', image: '/social-scenes/voice-talker-v2.webp', title: <>내 이야기<br />꺼내기</>, description: '답답한 마음을 나눠요', accessible: '내 이야기를 말할래요' },
        { id: 'listener', image: '/social-scenes/voice-listener-v2.webp', title: <>누군가의<br />말 들어주기</>, description: '그냥 들어줘도 좋아요', accessible: '오늘은 들어줄래요' },
      ] as const).map(item => <button type="button" key={item.id} disabled={disabled} aria-label={item.accessible} aria-pressed={role === item.id} className={s.rolePhoto} onClick={() => onRole(item.id)}>
        <Image src={item.image} alt="" fill priority sizes="(max-width: 640px) 46vw, 320px" />
        {role === item.id && <span className={s.check}><Check size={20} strokeWidth={3} /></span>}
        <span className={s.photoCopy}><strong>{item.title}</strong><span>{item.description}</span><small>주제 이미지</small></span>
      </button>)}
    </div> : <div className={s.casualPhoto}>
      <Image src="/social-scenes/voice-social-v2.webp" alt="가벼운 수다를 떠올리는 대학가 저녁 산책길 주제 이미지" fill priority sizes="(max-width: 640px) 94vw, 640px" />
      <span className={s.photoCopy}><strong>별일 없는 날도,<br />같이 이야기해요.</strong><span>말하기·듣기 역할 없이 편하게 번갈아 나눠요.</span><small>주제 이미지</small></span>
    </div>}
    <div className={s.railHeading}><span />이야기할 주제를 선택해 주세요<span /></div>
    <div className={s.topicRail} ref={rail} role="group" aria-label="대화 주제" onKeyDown={event => {
      if (disabled || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1, true)
    }}>
      {ENTRY_TOPICS.map(item => <button type="button" className={s.topicPhoto} key={item.id} data-topic={item.id} disabled={disabled} aria-pressed={selected === item.id} aria-label={`${item.label} 주제 선택`} onClick={() => choose(item.id)}>
        <Image src={item.image} alt="" fill priority sizes="(max-width: 640px) 112px, 180px" />
        {selected === item.id && <span className={s.topicCheck}><Check size={15} strokeWidth={3} /></span>}
        <strong>{item.label}</strong>
      </button>)}
    </div>
    <div className={s.railControls}>
      <button type="button" aria-label="이전 대화 주제" disabled={disabled} onClick={() => move(-1)}><ChevronLeft size={18} /></button>
      <span>{index + 1} / {ENTRY_TOPICS.length}<span className={s.railHint}> · 옆으로 넘겨보기</span></span>
      <button type="button" aria-label="다음 대화 주제" disabled={disabled} onClick={() => move(1)}><ChevronRight size={18} /></button>
    </div>
  </>
}
