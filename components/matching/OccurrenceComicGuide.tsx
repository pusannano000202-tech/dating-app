'use client'

import { RotateCw } from 'lucide-react'
import { parseDay1PrivateGameRuntime } from '@/lib/matching/continuation-day1-day3-runtime'
import { resolveScheduledComicScene } from '@/lib/matching/scheduled-comic'
import ScheduledComicGuide from './ScheduledComicGuide'
import s from './ScheduledComicGuide.module.css'

type Props = {
  snapshot: Parameters<typeof resolveScheduledComicScene>[0]
  rosterSize?: number
  onRefresh: () => void
  refreshing?: boolean
  preview?: boolean
}

/** Uses the same guarded rendering path in real occurrences and the offline rehearsal. */
export default function OccurrenceComicGuide({ snapshot, rosterSize, onRefresh, refreshing = false, preview = false }: Props) {
  if (![1, 2, 4].includes(snapshot.programDay) || !['confirmed', 'in_progress'].includes(snapshot.status)) return null
  const scene = resolveScheduledComicScene(snapshot)
  const day1 = snapshot.programDay === 1 ? parseDay1PrivateGameRuntime(snapshot.runtime) : null
  if (scene) return <ScheduledComicGuide
    key={`${scene.id}:${day1?.selectedGame ?? ''}`}
    scene={scene} rosterSize={rosterSize} preview={preview}
    selectedGame={day1?.resultAvailable ? day1.selectedGame ?? undefined : undefined}
  />
  return <section className={s.recovery} aria-label="만화 안내 상태 확인">
    <span className={s.recoveryLabel}>{preview ? '연결 복구 화면 예시' : '현재 안내 확인'}</span>
    <h2>진행 상태를 다시 확인해 주세요</h2>
    <p>시작 전이거나 최신 장면을 확인하지 못했어요. 이전 그림을 현재 안내로 보여주지 않아요.</p>
    <button type="button" onClick={onRefresh} disabled={refreshing}>
      <RotateCw size={16} aria-hidden />{refreshing ? '확인하는 중…' : '진행 상태 다시 확인'}
    </button>
    <small>이 버튼은 조회만 해요. 게임·투표·출석을 처리하지 않아요.</small>
  </section>
}
