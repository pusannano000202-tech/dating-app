'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ArrowUpRight, BarChart3, Plus } from 'lucide-react'
import styles from './chat-polls.module.css'

export default function ChatComposerActions({ onCreatePoll, disabled = false }: {
  onCreatePoll: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const action = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    action.current?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return <div className={styles.composerTools} ref={root}>
    <button ref={trigger} type="button" disabled={disabled} className={styles.addTool} aria-label="채팅 도구 열기" aria-expanded={open && !disabled} aria-controls={id} onClick={() => setOpen(value => !value)}><Plus size={22} /></button>
    {open && !disabled ? <div className={styles.toolPopover} id={id} role="region" aria-label="채팅 도구">
      <p>대화하다, 함께 정하고 싶을 때</p>
      <button ref={action} type="button" onClick={() => { trigger.current?.focus(); setOpen(false); onCreatePoll() }}>
        <span className={styles.toolIcon}><BarChart3 size={22} /></span>
        <span><strong>투표 만들기</strong><small>질문과 선택지를 직접 적어요</small></span>
        <ArrowUpRight size={18} />
      </button>
    </div> : null}
  </div>
}
