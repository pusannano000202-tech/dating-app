'use client'

import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import {
  parseDay1PrivateGameRuntime,
  type ContinuationDay1Game,
} from '@/lib/matching/continuation-day1-day3-runtime'
import { DAY1_DALMUTI_RULES, DAY1_GAME_CHOICES } from '@/lib/matching/day1-dalmuti-rules'

type Action = (action: string, payload?: Record<string, unknown>) => Promise<void>

export default function Day1PrivateGameRuntime({
  runtime,
  contentState,
  completed,
  busy,
  act,
}: {
  runtime: unknown
  contentState: Record<string, unknown>
  completed: boolean
  busy: boolean
  act: Action
}) {
  const parsed = parseDay1PrivateGameRuntime(runtime)
  const [draftChoice, setDraftChoice] = useState<ContinuationDay1Game | null>(null)
  const gameStarted = contentState.game_started === true
  const gameFinished = contentState.game_finished === true

  if (!parsed) {
    return <p role="status" className="rounded-2xl bg-boot-soft p-4 text-xs font-bold leading-5 text-boot-muted">
      비공개 투표 상태를 확인하지 못해 진행 버튼을 열지 않았어요. 잠시 뒤 다시 확인해 주세요.
    </p>
  }
  const currentChoice = draftChoice ?? parsed.myVote ?? 'dalmuti'

  return (
    <div>
      <div className="flex items-start gap-2 rounded-2xl bg-boot-soft p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-boot-primary" size={18} />
        <p className={helperText}>달무티를 먼저 함께 플레이해요. 이후 게임 투표는 내 투표만 보이며, 마감 전에는 집계 결과를 공개하지 않아요.</p>
      </div>

      <details className="mt-4 rounded-2xl border border-boot-hairline bg-white p-4">
        <summary className="cursor-pointer text-sm font-black">달무티 규칙 14개 보기</summary>
        <ol className="mt-3 space-y-2">
          {DAY1_DALMUTI_RULES.map((rule, index) => <li key={rule.title} className="text-xs font-bold leading-5 text-boot-muted"><b className="text-boot-ink">{index + 1}. {rule.title}</b> — {rule.rule}</li>)}
        </ol>
      </details>

      {!completed ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {!gameStarted ? <button type="button" disabled={busy} onClick={() => void act('start_game')} className={primaryButton}>달무티 먼저 시작</button> : null}
        {gameStarted && !gameFinished ? <button type="button" disabled={busy} onClick={() => void act('finish_game')} className={primaryButton}>달무티 마침</button> : null}
      </div> : null}

      <section className="mt-6 border-t border-boot-hairline pt-5" aria-labelledby="day1-private-vote-title">
        <h2 id="day1-private-vote-title" className="font-black">다음 게임 비공개 투표</h2>
        {parsed.voteOpen ? <>
          <p className={`${helperText} mt-1`}>마감 전까지 바꿀 수 있어요. 다른 사람의 선택과 득표수는 표시하지 않습니다.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {DAY1_GAME_CHOICES.map((game) => <label key={game.id} className={`cursor-pointer rounded-2xl border p-3 focus-within:ring-2 focus-within:ring-boot-primary/30 ${currentChoice === game.id ? 'border-boot-primary bg-boot-soft' : 'border-boot-hairline'}`}>
              <input type="radio" name="day1-private-game" value={game.id} checked={currentChoice === game.id} onChange={() => setDraftChoice(game.id)} className="sr-only" />
              <b className="text-sm">{game.label}</b>
              <span className="mt-1 block text-xs font-bold leading-5 text-boot-muted">{game.description}</span>
            </label>)}
          </div>
          <button type="button" disabled={busy || !parsed.canVote} onClick={() => void act('vote_day1_game', { choice: currentChoice })} className={`${secondaryButton} mt-3`}>
            {parsed.myVote ? '내 투표 바꾸기' : '내 투표 저장'}
          </button>
          {parsed.myVote ? <p className={`${helperText} mt-2`}>내 투표만 저장됐어요: {gameLabel(parsed.myVote)}</p> : null}
        </> : parsed.resultAvailable ? (
          <div className={`${helperText} mt-2`} aria-live="polite">
            <p>{parsed.selectedGame ? `투표 결과: ${gameLabel(parsed.selectedGame)}` : '저장된 투표가 없어 결과 게임을 정하지 않았어요.'}</p>
            {parsed.myVote ? <p className="mt-1">내 투표: {gameLabel(parsed.myVote)}</p> : null}
            {parsed.selectedGame ? <p className="mt-2 text-boot-ink">이제 함께 {gameLabel(parsed.selectedGame)} 게임을 플레이하세요. 다음 순서는 활동 안내에서 확인할 수 있어요.</p> : null}
          </div>
        ) : (
          <p className={`${helperText} mt-2`}>투표는 서버 시각 기준 달무티 진행 뒤 80~85분에 열려요.</p>
        )}
      </section>

      {!completed && gameFinished ? (
        parsed.canFinish
          ? <button type="button" disabled={busy} onClick={() => void act('finish_occurrence')} className={`${primaryButton} mt-5`}>오늘 만남 마치기</button>
          : <p className={`${helperText} mt-5 rounded-2xl bg-boot-soft p-4`}>전체 150분 흐름을 지키기 위해 종료 5분 전부터 만남을 마칠 수 있어요.</p>
      ) : null}
    </div>
  )
}

function gameLabel(game: ContinuationDay1Game) {
  return DAY1_GAME_CHOICES.find((choice) => choice.id === game)?.label ?? game
}

const primaryButton = 'min-h-12 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45'
const secondaryButton = 'min-h-12 rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary disabled:opacity-45'
const helperText = 'text-xs font-bold leading-5 text-boot-muted'
