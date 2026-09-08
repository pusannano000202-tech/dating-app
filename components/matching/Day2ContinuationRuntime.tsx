'use client'

import { Clock3, Users } from 'lucide-react'

import { getDay2Question } from '@/lib/matching/day2-conversation-roulette'

type Day2Runtime = {
  kind: 'day2'
  ready: boolean
  scene: string
  round: number | null
  previous_scene: string | null
  previous_available_until: string | null
  my_group: { aliases: string[] } | null
  question_index: number | null
  prompt_version: number | null
  can_advance_prompt: boolean
  can_finish: boolean
}

type Props = {
  runtime: unknown
  busy: boolean
  completed: boolean
  act: (action: string, payload?: Record<string, unknown>, options?: { quiet?: boolean }) => Promise<void>
}

export default function Day2ContinuationRuntime({ runtime: rawRuntime, busy, completed, act }: Props) {
  const runtime = parseDay2Runtime(rawRuntime)
  if (!runtime?.ready) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4" role="status">
        <p className="text-sm font-black text-amber-950">현재 조 편성을 안전하게 확인할 수 없어요.</p>
        <p className="mt-1 text-xs font-bold leading-5 text-amber-900/75">출석 상태와 3남 2녀 또는 3남 3녀 구성이 확인되면 내 조만 표시됩니다.</p>
      </div>
    )
  }

  const question = runtime.question_index === null ? null : getDay2Question(runtime.question_index)
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-boot-soft p-4">
        <div className="flex items-center gap-2 text-boot-primary"><Clock3 size={17} /><p className="text-xs font-black">서버 시간 기준 · 대화 30분 × 3라운드</p></div>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">화면을 다시 열어도 현재 라운드와 내 조를 서버가 다시 계산합니다. 누구도 혼자 남지 않아요.</p>
      </div>

      {runtime.round && runtime.my_group ? (
        <section className="rounded-2xl border border-boot-hairline p-4" aria-labelledby="day2-my-group-heading">
          <div className="flex items-center gap-2"><Users size={18} className="text-boot-primary" /><h2 id="day2-my-group-heading" className="text-sm font-black">라운드 {runtime.round}/3 · 내 조</h2></div>
          <ul className="mt-3 flex flex-wrap gap-2">
            {runtime.my_group.aliases.map((alias) => <li key={alias} className="rounded-full bg-boot-soft px-3 py-2 text-xs font-black text-boot-primary">{alias}</li>)}
          </ul>
          <p className="mt-3 text-xs font-bold leading-5 text-boot-muted">먼저 공통점 하나를 찾고, 그다음 편하게 대화해요. 질문은 막힐 때만 선택해요.</p>
        </section>
      ) : (
        <p className="rounded-2xl border border-boot-hairline p-4 text-sm font-bold text-boot-muted">{sceneMessage(runtime.scene)}</p>
      )}

      {runtime.previous_scene ? (
        <p className="rounded-2xl bg-[#FFF8EA] px-4 py-3 text-xs font-bold leading-5 text-[#765319]">방금 전 라운드 안내는 전환 뒤 10분 동안 다시 확인할 수 있어요.</p>
      ) : null}

      {runtime.round && question ? (
        <details className="rounded-2xl border border-boot-hairline p-4 text-center">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-black text-boot-primary">대화가 막힐 때 우리 조 질문 열기</summary>
          <p className="mt-3 text-lg font-black leading-7">{question}</p>
          <p className="mt-2 text-xs font-bold text-boot-muted">답하고 싶지 않으면 질문을 건너뛰어도 괜찮아요.</p>
          {runtime.can_advance_prompt && runtime.prompt_version !== null ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void act('advance_group_prompt', {
                round: runtime.round,
                expected_runtime_version: runtime.prompt_version,
              })}
              className="mt-3 min-h-12 rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary disabled:opacity-45"
            >다음 질문</button>
          ) : <p className="mt-3 text-xs font-bold text-boot-muted">라운드 시작 5분 뒤부터 조별 질문을 넘길 수 있어요.</p>}
        </details>
      ) : null}

      {runtime.can_finish ? (
        <button
          type="button"
          disabled={busy || completed}
          onClick={() => void act('finish_occurrence')}
          className="min-h-12 w-full rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45"
        >Day 2 마치기</button>
      ) : null}
    </div>
  )
}

function parseDay2Runtime(value: unknown): Day2Runtime | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  if (row.kind !== 'day2' || typeof row.ready !== 'boolean' || typeof row.scene !== 'string') return null
  const round = row.round === null ? null : safeInteger(row.round, 1, 3)
  const questionIndex = row.question_index === null ? null : safeInteger(row.question_index, 0, 5)
  const promptVersion = row.prompt_version === null ? null : safeInteger(row.prompt_version, 0, Number.MAX_SAFE_INTEGER)
  if (row.round !== null && round === null) return null
  if (row.question_index !== null && questionIndex === null) return null
  if (row.prompt_version !== null && promptVersion === null) return null
  const myGroup = parseMyGroup(row.my_group)
  if (row.my_group !== null && myGroup === null) return null
  if (typeof row.can_advance_prompt !== 'boolean' || typeof row.can_finish !== 'boolean') return null
  return {
    kind: 'day2', ready: row.ready, scene: row.scene, round,
    previous_scene: typeof row.previous_scene === 'string' ? row.previous_scene : null,
    previous_available_until: typeof row.previous_available_until === 'string' ? row.previous_available_until : null,
    my_group: myGroup, question_index: questionIndex, prompt_version: promptVersion,
    can_advance_prompt: row.can_advance_prompt, can_finish: row.can_finish,
  }
}

function parseMyGroup(value: unknown) {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const aliases = (value as Record<string, unknown>).aliases
  if (!Array.isArray(aliases) || ![2, 3].includes(aliases.length) || !aliases.every((alias) => typeof alias === 'string')) return null
  return { aliases: aliases as string[] }
}

function safeInteger(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null
}

function sceneMessage(scene: string) {
  if (scene === 'day2_arrival' || scene === 'day2_waiting') return '집결 안내를 확인하고 첫 라운드를 기다려 주세요.'
  if (scene === 'day2_wrap_and_end') return '세 라운드를 마쳤어요. 모두 다시 모여 안전하게 마무리해요.'
  return '현재 라운드 정보를 다시 확인하고 있어요.'
}
