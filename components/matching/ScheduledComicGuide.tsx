'use client'

import Image from 'next/image'
import { useState } from 'react'
import { resolveContinuationGuideArtworks, type ContinuationContentGuideScene } from '@/lib/matching/continuation-content-guide'
import s from './ScheduledComicGuide.module.css'

/** A presentational view of the current server stage. No command, vote or timer write. */
export default function ScheduledComicGuide({ scene, rosterSize, selectedGame, preview = false }: { scene: ContinuationContentGuideScene; rosterSize?: number; selectedGame?: string; preview?: boolean }) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const artworks = resolveContinuationGuideArtworks(scene, { rosterSize, selectedGame, mode: 'occurrence' })
  return <section className={s.shell} aria-label="현재 장면 만화 안내" data-current-scene={scene.id}>
    <header className={s.header}><span>{preview ? '진행 장면 미리보기' : '지금 함께할 장면'}</span><small>{preview ? '실제 시간·진행 아님' : '서버 진행 상태 기준'}</small></header>
    <h2 className={s.title}>{scene.title}</h2>
    <div className={s.art}>
      {artworks.map(art => failed.has(art.src) ? <div key={art.src} className={s.fallback}>그림을 불러오지 못했어요. 아래 안내로 이어가세요.</div>
        : <Image key={art.src} src={art.src} alt={`만화 예시 · ${art.alt}`} width={1448} height={1086} sizes="(max-width: 640px) 90vw, 540px" onError={() => setFailed(previous => new Set(previous).add(art.src))} />)}
    </div>
    <div className={s.speech} aria-live="polite" aria-atomic="true"><span>QUANTUM</span><p>{scene.speech[0]}</p></div>
    <p className={s.action}>{scene.nextAction}</p>
    <details className={s.details}><summary>편하게 참여하는 방법</summary><p>{scene.speech.slice(1).join(' ') || '답하기 어려우면 듣기만 해도 괜찮아요.'}</p><p>그림은 진행 예시예요. 실제 내 조와 행동 버튼은 아래에서 확인해요. 안내를 읽어도 투표·출석·완료는 처리되지 않아요.</p></details>
  </section>
}
