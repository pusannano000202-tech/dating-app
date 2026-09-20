'use client'

import { ArrowLeft, ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { getMeetingCoachingCards, meetingCoachingSwipeDirection, moveMeetingCoachingCard, resolveMeetingCoachingCue, resolveMeetingCoachingMode, type MeetingCoachingCue } from './meeting-coaching-content'
import styles from './MeetingCoachingCards.module.css'

export type MeetingCoachingCardsProps = {
  audience?: 'singles' | 'couples'
  preview?: boolean
  /** Must come from the caller's verified participation/time state, never a local start button. */
  unlocked?: boolean
  /** Only pass a cue from verified server participation and progress state. */
  currentCue?: MeetingCoachingCue
  activityKind?: string
  className?: string
}

export default function MeetingCoachingCards({ audience = 'singles', preview = true, unlocked = false, currentCue, activityKind, className = '' }: MeetingCoachingCardsProps) {
  const titleId = useId()
  const mode = resolveMeetingCoachingMode({ preview, unlocked })
  const cards = getMeetingCoachingCards(audience, activityKind)
  const cue = resolveMeetingCoachingCue(cards, mode, currentCue)
  const cueIndex = cue?.index
  const cueLabel = cue?.label
  const [index, setIndex] = useState(() => cueIndex ?? 0)
  const [failedIllustration, setFailedIllustration] = useState<string | null>(null)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => { setIndex(cueIndex ?? 0) }, [audience, activityKind, mode, cueIndex, cueLabel])
  const safeIndex = Math.max(0, Math.min(index, cards.length - 1))
  const card = cards[safeIndex]
  const viewingCurrentCue = cueIndex === safeIndex
  const move = (direction: -1 | 1) => setIndex(current => moveMeetingCoachingCard(current, direction, cards.length))

  return (
    <section className={`${styles.shell} ${className}`} aria-labelledby={titleId} data-coaching-mode={mode} data-coaching-card={card.id}>
      <header className={styles.header}>
        <div>
          <span className={styles.badge}>{mode === 'preview' ? '만화로 미리보기' : cue ? cue.label : '참여 확인 안내 · 전체 순서'}</span>
          <h2 id={titleId} className={styles.title}>{card.title}</h2>
        </div>
        <span className={styles.counter} aria-label={`안내 ${safeIndex + 1}, 전체 ${cards.length}`}>{String(safeIndex + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}</span>
      </header>
      {cue && <div className={styles.cueRow}>
        <span>{viewingCurrentCue ? '현재 안내를 보고 있어요' : '다른 순서를 둘러보고 있어요'}</span>
        {!viewingCurrentCue && <button type="button" onClick={() => setIndex(cue.index)}>현재 안내로<ArrowRight size={13} aria-hidden /></button>}
      </div>}
      <article
        className={styles.card}
        aria-live="polite"
        aria-atomic="true"
        onTouchStart={event => {
          const touch = event.touches.length === 1 ? event.touches[0] : null
          gesture.current = touch ? { x: touch.clientX, y: touch.clientY } : null
        }}
        onTouchEnd={event => {
          const start = gesture.current
          const touch = event.changedTouches[0]
          gesture.current = null
          if (!start || !touch) return
          const direction = meetingCoachingSwipeDirection(touch.clientX - start.x, touch.clientY - start.y)
          if (direction) move(direction)
        }}
        onTouchCancel={() => { gesture.current = null }}
      >
        <div className={styles.scene}>
          <div className={styles.art}>
            {failedIllustration !== card.illustration
              // The scene is decorative; all instructions remain readable without the image.
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={card.illustration} alt="" draggable={false} onError={() => setFailedIllustration(card.illustration)} />
              : <p className={styles.imageFallback}>그림을 불러오지 못했어요.<br />말풍선 안내는 그대로 볼 수 있어요.</p>}
            <span className={styles.illustrationLabel}>안내용 일러스트</span>
          </div>
          <blockquote className={styles.speech} key={card.id}><span className={styles.srOnly}>대화 예시: </span>{card.example}</blockquote>
        </div>
        <p className={styles.action}>{card.action}</p>
      </article>
      <nav className={styles.navigation} aria-label="진행 카드 넘기기">
        <button type="button" disabled={safeIndex === 0} onClick={() => move(-1)}><ArrowLeft size={17} aria-hidden />이전 장면</button>
        <div className={styles.progress} aria-hidden>{cards.map((item, i) => <span key={item.id} data-active={i === safeIndex} />)}</div>
        <button type="button" disabled={safeIndex === cards.length - 1} onClick={() => move(1)}>{safeIndex === cards.length - 1 ? '마지막 장면' : '다음 장면'}<ArrowRight size={17} aria-hidden /></button>
      </nav>
      <details className={styles.safety} key={`${audience}-${card.id}`}>
        <summary><ShieldCheck size={14} aria-hidden />편하게 참여하려면<ChevronDown size={14} aria-hidden /></summary>
        <p>{card.note}</p>
        <p>{mode === 'preview' ? '전체 순서를 둘러보는 예시예요. 신청·팀 확정이나 모임 시작을 뜻하지 않아요.' : cue ? '확인된 진행 단계에 맞춘 안내예요. 앞뒤 장면도 자유롭게 둘러볼 수 있어요.' : '참여가 확인된 만남의 전체 순서를 둘러봐요. 현재 시간에 맞춘 자동 안내는 아니에요.'}</p>
        <p>장면을 넘겨도 출석·완료·다음 만남 동의는 처리되지 않아요. 그림 속 인물은 실제 참가자가 아니에요.</p>
      </details>
    </section>
  )
}
