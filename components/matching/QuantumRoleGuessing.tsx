'use client'

import { CheckCircle2, LockKeyhole, RefreshCw, Send, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  parseQuantumRoleGuessState,
  QUANTUM_SECRET_ROLE_DEFINITIONS,
  SECRET_ROLE_KEYS,
  type QuantumRoleGuessState,
  type QuantumSecretRoleKey,
} from '@/lib/matching/quantum-secret-roles'

export type QuantumRoleGuessingRequestClient = {
  loadState: (matchId: string) => Promise<QuantumRoleGuessState | null>
  submitGuesses: (
    matchId: string,
    guesses: Array<{ seatLabel: string; role: QuantumSecretRoleKey }>,
  ) => Promise<QuantumRoleGuessState | null>
}

export type QuantumRoleGuessingProps = {
  matchId: string
  meetingCompleted: boolean
  initialState?: QuantumRoleGuessState | null
  requestClient?: QuantumRoleGuessingRequestClient
  onSubmitted?: (state: QuantumRoleGuessState) => void
}

type GuessLoadState = 'locked' | 'loading' | 'ready' | 'empty' | 'error'

const defaultRequestClient: QuantumRoleGuessingRequestClient = {
  async loadState(matchId) {
    const response = await fetch(
      `/api/match/event-role-guesses?match_id=${encodeURIComponent(matchId)}`,
      { cache: 'no-store' },
    )
    return parseGuessResponse(response)
  },
  async submitGuesses(matchId, guesses) {
    const response = await fetch('/api/match/event-role-guesses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        match_id: matchId,
        guesses: guesses.map((guess) => ({ seat_label: guess.seatLabel, role: guess.role })),
      }),
      cache: 'no-store',
    })
    return parseGuessResponse(response)
  },
}

export default function QuantumRoleGuessing({
  matchId,
  meetingCompleted,
  initialState,
  requestClient = defaultRequestClient,
  onSubmitted,
}: QuantumRoleGuessingProps) {
  const [loadState, setLoadState] = useState<GuessLoadState>(meetingCompleted ? 'loading' : 'locked')
  const [state, setState] = useState<QuantumRoleGuessState | null>(null)
  const [selections, setSelections] = useState<Record<string, QuantumSecretRoleKey | null>>({})
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState('')

  const applyState = useCallback((nextState: QuantumRoleGuessState | null) => {
    if (!nextState) {
      setState(null)
      setLoadState('empty')
      return false
    }

    setState(nextState)
    setSelections(Object.fromEntries(nextState.targets.map((target) => [target.seatLabel, target.guessedRole])))
    setLoadState('ready')
    return true
  }, [])

  const loadGuessState = useCallback(async () => {
    if (!meetingCompleted) return
    setLoadState('loading')
    setNotice('')
    try {
      applyState(await requestClient.loadState(matchId))
    } catch {
      setState(null)
      setLoadState('error')
      setNotice('역할 맞히기를 불러오지 못했어요. 다시 확인해 주세요.')
    }
  }, [applyState, matchId, meetingCompleted, requestClient])

  useEffect(() => {
    if (!meetingCompleted) {
      setLoadState('locked')
      return
    }
    if (initialState === undefined) {
      void loadGuessState()
      return
    }
    applyState(initialState)
  }, [applyState, initialState, loadGuessState, meetingCompleted])

  const canSubmit = useMemo(() => {
    if (!state || state.status !== 'open' || state.submitted || submitting) return false
    if (state.targets.length < 2) return false
    return state.targets.every((target) => selections[target.seatLabel] !== null && selections[target.seatLabel] !== undefined)
  }, [selections, state, submitting])

  async function submitGuesses() {
    if (!state || !canSubmit) return

    const guesses = state.targets.map((target) => ({
      seatLabel: target.seatLabel,
      role: selections[target.seatLabel] as QuantumSecretRoleKey,
    }))
    setSubmitting(true)
    setNotice('')
    try {
      const nextState = await requestClient.submitGuesses(matchId, guesses)
      if (nextState && applyState(nextState)) {
        setNotice('역할 추측을 제출했어요. 결과 공개를 기다려 주세요.')
        onSubmitted?.(nextState)
      }
    } catch {
      setNotice('역할 추측을 제출하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!meetingCompleted) {
    return (
      <section aria-labelledby="role-guess-title" className="rounded-lg border border-[#E7CFC9] bg-[#FFFDFB] px-5 py-5 text-boot-ink">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#FFF0ED] text-boot-coral">
            <LockKeyhole size={19} aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-black text-boot-coral">만남 후 미션</p>
            <h2 id="role-guess-title" className="mt-1 text-lg font-black">만남이 끝난 뒤 열려요</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">지금은 서로의 역할을 추측하거나 정답을 볼 수 없어요.</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="role-guess-title" aria-busy={loadState === 'loading' || submitting} className="rounded-lg border border-[#E7CFC9] bg-[#FFFDFB] px-5 py-5 text-boot-ink">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[#FFF0ED] text-boot-coral">
          <Sparkles size={19} aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-black text-boot-coral">만남 후 미션</p>
          <h2 id="role-guess-title" className="mt-1 text-lg font-black">누가 어떤 역할이었을까요?</h2>
          <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">이름이나 사진 없이, 함께 보낸 시간으로만 역할을 떠올려 보세요.</p>
        </div>
      </div>

      {loadState === 'loading' ? (
        <div className="mt-5 flex min-h-24 items-center gap-3 text-sm font-bold text-boot-muted">
          <RefreshCw size={18} className="animate-spin text-boot-coral" aria-hidden="true" /> 역할 맞히기를 준비하고 있어요.
        </div>
      ) : null}

      {loadState === 'error' ? (
        <div className="mt-5 border-l-2 border-boot-coral bg-[#FFF7F3] px-4 py-4">
          <p className="text-sm font-black">역할 맞히기를 열지 못했어요.</p>
          <button type="button" onClick={() => void loadGuessState()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#D9A69B] px-3 text-sm font-black text-boot-coral">
            <RefreshCw size={16} aria-hidden="true" /> 다시 확인
          </button>
        </div>
      ) : null}

      {loadState === 'empty' ? (
        <div className="mt-5 border-l-2 border-boot-coral bg-[#FFF7F3] px-4 py-4">
          <p className="text-sm font-black">아직 역할 맞히기 상태가 준비되지 않았어요.</p>
          <button type="button" onClick={() => void loadGuessState()} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-md border border-[#D9A69B] px-3 text-sm font-black text-boot-coral">
            <RefreshCw size={16} aria-hidden="true" /> 다시 확인
          </button>
        </div>
      ) : null}

      {loadState === 'ready' && state ? (
        <div className="mt-5">
          {state.status === 'open' && !state.submitted ? <p className="mb-4 text-xs font-bold leading-5 text-boot-muted">각 익명 좌석에 역할 하나를 골라 주세요. 제출은 한 번만 가능해요.</p> : null}
          {state.status === 'submitted' || state.submitted ? <p className="mb-4 flex items-center gap-2 text-sm font-black text-boot-primary"><CheckCircle2 size={17} aria-hidden="true" /> 제출했어요. 모두의 제출 또는 공개 시각을 기다려 주세요.</p> : null}
          {state.status === 'revealed' ? <p className="mb-4 flex items-center gap-2 text-sm font-black text-boot-primary"><CheckCircle2 size={17} aria-hidden="true" /> 역할이 공개됐어요. 정답을 함께 확인해 보세요.</p> : null}

          <div className="grid gap-3">
            {state.targets.map((target, index) => (
              <fieldset key={target.seatLabel} className="border border-boot-hairline bg-white px-4 py-4">
                <legend className="sr-only">{target.seatLabel}의 역할 고르기</legend>
                <p className="text-sm font-black">참여자 {index + 1}</p>
                <p className="mt-1 text-xs font-bold text-boot-muted">익명 좌석 {target.seatLabel}</p>

                {state.status === 'revealed' && target.answerRole ? (
                  <div className="mt-4 border-l-2 border-boot-coral bg-[#FFF7F3] px-3 py-3">
                    <p className="text-xs font-black text-boot-coral">공개된 역할</p>
                    <p className="mt-1 text-base font-black">{QUANTUM_SECRET_ROLE_DEFINITIONS[target.answerRole].label}</p>
                    <p className="mt-1 text-xs font-bold text-boot-muted">{target.correct ? '내 추측이 맞았어요.' : '내 추측과 달랐어요.'}</p>
                  </div>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label={`참여자 ${index + 1}의 역할 선택`}>
                    {SECRET_ROLE_KEYS.map((roleKey) => {
                      const selected = selections[target.seatLabel] === roleKey
                      const disabled = state.status !== 'open' || state.submitted || submitting
                      return (
                        <button
                          key={roleKey}
                          type="button"
                          disabled={disabled}
                          aria-pressed={selected}
                          onClick={() => setSelections((current) => ({ ...current, [target.seatLabel]: roleKey }))}
                          className={`min-h-11 rounded-md border px-2 text-xs font-black ${selected ? 'border-boot-coral bg-[#FFF0ED] text-boot-coral' : 'border-boot-hairline bg-white text-boot-muted'} disabled:cursor-not-allowed disabled:opacity-60`}
                        >
                          {QUANTUM_SECRET_ROLE_DEFINITIONS[roleKey].label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </fieldset>
            ))}
          </div>

          {state.status === 'open' && !state.submitted ? (
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submitGuesses()}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-boot-coral px-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <RefreshCw size={17} className="animate-spin" aria-hidden="true" /> : <Send size={17} aria-hidden="true" />}
              {submitting ? '제출하고 있어요' : '역할 추측 제출'}
            </button>
          ) : null}
        </div>
      ) : null}

      {notice ? <p className="mt-4 text-xs font-black leading-5 text-boot-coral" role="status" aria-live="polite">{notice}</p> : null}
    </section>
  )
}

async function parseGuessResponse(response: Response): Promise<QuantumRoleGuessState | null> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (!response.ok) throw new Error('role_guess_request_failed')
  return payload ? parseQuantumRoleGuessState(payload.role_guess_state) : null
}
