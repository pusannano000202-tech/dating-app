'use client'

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { sceneIndex, sceneSwipe } from '@/lib/social/scene-navigation'
import s from './social-scenes.module.css'

export type PhotoScene = {
  id: string
  eyebrow: string
  title: string
  description: string
  image: string
  imageAlt: string
  actionLabel: string
  href?: string
  onSelect?: () => void
  disabled?: boolean
  note?: string
}

export function PhotoSceneCarousel({ label, items, initialId, onChange, showNavigation = true }: {
  label: string
  items: readonly PhotoScene[]
  initialId?: string
  onChange?: (id: string) => void
  showNavigation?: boolean
}) {
  const id = useId()
  const [selectedId, setSelectedId] = useState(initialId ?? items[0]?.id)
  const start = useRef<{ x: number; y: number } | null>(null)
  const index = Math.max(0, items.findIndex(item => item.id === selectedId))
  const active = items[index]
  function choose(next: number) {
    if (!items[next]) return
    setSelectedId(items[next].id)
    onChange?.(items[next].id)
  }
  function move(direction: -1 | 1) { choose(sceneIndex(index, direction, items.length)) }
  function keyboard(event: KeyboardEvent<HTMLElement>) {
    if (!showNavigation) return
    const next = event.key === 'ArrowLeft' ? sceneIndex(index, -1, items.length)
      : event.key === 'ArrowRight' ? sceneIndex(index, 1, items.length)
      : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
    if (next === null) return
    event.preventDefault()
    choose(next)
  }
  function pointerUp(event: PointerEvent<HTMLElement>) {
    if (!showNavigation || !start.current) return
    const direction = sceneSwipe(event.clientX - start.current.x, event.clientY - start.current.y)
    start.current = null
    if (direction) move(direction)
  }
  if (!active) return <p role="status">아직 준비된 장면이 없어요.</p>
  return <section className={s.carousel} aria-label={label}>
    {showNavigation && <div className={s.choices} aria-label={label + ' 선택'} role="group" onKeyDown={keyboard}>
      {items.map((item, position) => <button key={item.id} type="button" aria-pressed={position === index} aria-controls={id}
        onClick={() => choose(position)}>{item.eyebrow}</button>)}
    </div>}
    <article id={id} className={s.scene} data-scene={active.id}>
      <div className={s.photo} style={!showNavigation ? { cursor: 'default' } : undefined} tabIndex={showNavigation ? 0 : undefined} role="group" aria-roledescription={showNavigation ? '캐러셀' : undefined} aria-label={label + (showNavigation ? ' 사진, 좌우로 넘기기' : ' 사진')} onKeyDown={keyboard}
        onPointerDown={event => { if (!showNavigation) return; start.current = { x:event.clientX, y:event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerUp={pointerUp} onPointerCancel={() => { start.current = null }} onLostPointerCapture={() => { start.current = null }}>
        {/* These are locally owned editorial assets, never a member's private photo. */}
        <Image key={active.image} src={active.image} alt={active.imageAlt} fill sizes="(min-width: 700px) 430px, 100vw" draggable={false} className={s.sceneImage}/>
        {showNavigation && <span className={s.photoTag}>사진을 옆으로 넘겨보세요</span>}
        {showNavigation && <span className={s.counter}>{index + 1} / {items.length}</span>}
      </div>
      <div className={s.sceneBody}>
        <div className={s.sceneHeading}><p className={s.eyebrow}>{active.eyebrow}</p>
          {showNavigation && <div className={s.arrows}>
            <button type="button" aria-label={label + ' 이전'} aria-controls={id} onClick={() => move(-1)}><ArrowLeft size={18}/></button>
            <button type="button" aria-label={label + ' 다음'} aria-controls={id} onClick={() => move(1)}><ArrowRight size={18}/></button>
          </div>}
        </div>
        <h2>{active.title}</h2>
        <p className={s.description}>{active.description}</p>
        {active.disabled ? <p className={s.pending} role="status">공개 준비 중 · 아직 참가할 수 없어요</p>
          : active.onSelect ? <button type="button" className={s.primary} onClick={active.onSelect}>{active.actionLabel}<ArrowRight size={18}/></button>
          : active.href ? <Link className={s.primary} href={active.href}>{active.actionLabel}<ArrowRight size={18}/></Link> : null}
        {active.note && <p className={s.note}>{active.note}</p>}
      </div>
    </article>
    <p className="sr-only" aria-live="polite" aria-atomic="true">{showNavigation ? `${index + 1} / ${items.length}, ` : ''}{active.title}</p>
  </section>
}
export default PhotoSceneCarousel
