'use client'

import { Clock3, LockKeyhole, Smartphone } from 'lucide-react'
import { useEffect } from 'react'

import { DAY4_SAME_ANSWER_CARDS } from '@/lib/matching/day4-same-answer-cards'

type Day4Runtime = {
  kind: 'day4'
  ready: boolean
  scene: string
  card_index: number
  card_version: number
  lease_version: number
  lease_active: boolean
  owner_is_me: boolean
  can_claim: boolean
  can_interact: boolean
  recommended_window_ended: boolean
  completed: boolean
}

type Props = {
  runtime: unknown
  busy: boolean
  occurrenceCompleted: boolean
  act: (action: string, payload?: Record<string, unknown>, options?: { quiet?: boolean }) => Promise<void>
}

export default function Day4ContinuationRuntime({ runtime: rawRuntime, busy, occurrenceCompleted, act }: Props) {
  const runtime = parseDay4Runtime(rawRuntime)
  useEffect(() => {
    if (occurrenceCompleted || !runtime?.owner_is_me || !runtime.lease_active || runtime.completed) return
    const timer = window.setInterval(() => {
      void act('heartbeat_shared_phone', { expected_lease_version: runtime.lease_version }, { quiet: true })
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [act, occurrenceCompleted, runtime?.card_index, runtime?.completed, runtime?.lease_active, runtime?.lease_version, runtime?.owner_is_me])

  if (!runtime?.ready) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4" role="status">
        <p className="text-sm font-black text-amber-950">공용폰 진행 권한을 확인할 수 없어요.</p>
        <p className="mt-1 text-xs font-bold leading-5 text-amber-900/75">확정 또는 출석한 참가자에게만 카드 진행 권한이 열립니다.</p>
      </div>
    )
  }

  if (occurrenceCompleted) {
    return (
      <div className="rounded-2xl border border-boot-hairline bg-boot-soft p-4" role="status">
        <p className="text-sm font-black text-boot-ink">마친 Day 4 기록이에요.</p>
        <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">저장된 카드 위치는 {runtime.card_index}/10이며, 완료된 회차에서는 더 진행하지 않아요.</p>
      </div>
    )
  }

  const nextCard = runtime.card_index < DAY4_SAME_ANSWER_CARDS.length
    ? DAY4_SAME_ANSWER_CARDS[runtime.card_index]
    : null
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-boot-soft p-4">
        <div className="flex items-center gap-2 text-boot-primary"><Smartphone size={18} /><p className="text-xs font-black">공용폰 한 대 · 같은 답 10카드</p></div>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">누가 마셨는지, 패스했는지, 어떤 답을 했는지는 저장하지 않아요. 카드 순서만 함께 이어집니다.</p>
      </div>

      {runtime.recommended_window_ended && !runtime.completed ? (
        <p className="rounded-2xl bg-[#FFF8EA] px-4 py-3 text-sm font-black leading-6 text-[#765319]"><Clock3 className="mr-2 inline" size={17} />권장 시간이 지났어요. 남은 카드 이어보기로 안전하게 계속할 수 있어요.</p>
      ) : null}

      {!runtime.can_interact && !runtime.completed ? (
        <p className="rounded-2xl border border-boot-hairline p-4 text-sm font-bold text-boot-muted">시작 30분 뒤 공용폰 카드가 열려요.</p>
      ) : null}

      {runtime.can_interact && !runtime.completed && !runtime.owner_is_me ? (
        runtime.can_claim ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act('claim_shared_phone', { expected_lease_version: runtime.lease_version })}
            className="min-h-12 w-full rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45"
          >{runtime.recommended_window_ended ? '남은 카드 이어보기' : '이 기기를 공용폰으로 시작'}</button>
        ) : (
          <p className="rounded-2xl border border-boot-hairline p-4 text-sm font-bold text-boot-muted"><LockKeyhole className="mr-2 inline text-boot-primary" size={17} />다른 참가자의 공용폰이 진행 중이에요. 연결이 끊기면 45초 뒤 이어받을 수 있어요.</p>
        )
      ) : null}

      {runtime.owner_is_me && nextCard ? (
        <section className="rounded-3xl border border-boot-primary/20 p-6 text-center" aria-labelledby="day4-card-heading">
          <p className="text-xs font-black text-boot-primary">카드 {runtime.card_index + 1}/10</p>
          <h2 id="day4-card-heading" className="mt-3 text-xl font-black leading-8">{nextCard.prompt}</h2>
          <p className="mt-2 text-xs font-bold text-boot-muted">{nextCard.guide}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('advance_shared_phone_card', {
                expected_lease_version: runtime.lease_version,
                expected_card_version: runtime.card_version,
                card_id: nextCard.id,
              })}
              className="min-h-12 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45"
            >이 카드 진행 완료</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('release_shared_phone', { expected_lease_version: runtime.lease_version })}
              className="min-h-12 rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary disabled:opacity-45"
            >다른 기기에 넘기기</button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        disabled={busy || occurrenceCompleted}
        onClick={() => void act('take_break')}
        className="min-h-12 w-full rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary disabled:opacity-45"
      >잠깐 쉬기</button>

      {runtime.completed ? (
        <button
          type="button"
          disabled={busy || occurrenceCompleted}
          onClick={() => void act('finish_occurrence')}
          className="min-h-12 w-full rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45"
        >Day 4 마치기</button>
      ) : <p className="text-center text-xs font-bold text-boot-muted">10장을 모두 진행한 뒤 회차를 마칠 수 있어요. 현재 {runtime.card_index}/10</p>}
    </div>
  )
}

function parseDay4Runtime(value: unknown): Day4Runtime | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.kind !== 'day4' || typeof row.ready !== 'boolean' || typeof row.scene !== 'string') return null
  const cardIndex = safeInteger(row.card_index, 0, 10)
  const cardVersion = safeInteger(row.card_version, 0, Number.MAX_SAFE_INTEGER)
  const leaseVersion = safeInteger(row.lease_version, 0, Number.MAX_SAFE_INTEGER)
  if (cardIndex === null || cardVersion === null || leaseVersion === null) return null
  for (const field of ['lease_active', 'owner_is_me', 'can_claim', 'can_interact', 'recommended_window_ended', 'completed'] as const) {
    if (typeof row[field] !== 'boolean') return null
  }
  return {
    kind: 'day4', ready: row.ready, scene: row.scene,
    card_index: cardIndex, card_version: cardVersion, lease_version: leaseVersion,
    lease_active: row.lease_active as boolean, owner_is_me: row.owner_is_me as boolean,
    can_claim: row.can_claim as boolean, can_interact: row.can_interact as boolean,
    recommended_window_ended: row.recommended_window_ended as boolean,
    completed: row.completed as boolean,
  }
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null
}
