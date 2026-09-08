'use client'

import { ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import {
  buildDay3LastFramePayload,
  buildDay3OneBallPayload,
  parseDay3TiebreakRuntime,
  type ContinuationDay3Team,
} from '@/lib/matching/continuation-day1-day3-runtime'

type Member = { alias: string; attendance_status: string }
type ScoreDraft = Record<string, string>
type BowlingTeam = { alias: string; team: ContinuationDay3Team }
type BowlingResult = { team: string; total: number; rank: number; tied: boolean }
type BowlingOneBallScore = { team: ContinuationDay3Team; score: number }
type Action = (action: string, payload?: Record<string, unknown>) => Promise<void>

export default function Day3BowlingRuntime({
  members,
  contentState,
  runtime,
  completed,
  busy,
  act,
}: {
  members: Member[]
  contentState: Record<string, unknown>
  runtime: unknown
  completed: boolean
  busy: boolean
  act: Action
}) {
  const aliases = useMemo(() => members.map((member) => member.alias), [members])
  const [practiceScores, setPracticeScores] = useState<ScoreDraft>({})
  const [gameScores, setGameScores] = useState<ScoreDraft>({})
  const [lastFrameScores, setLastFrameScores] = useState<ScoreDraft>({})
  const [oneBallScores, setOneBallScores] = useState<Partial<Record<ContinuationDay3Team, string>>>({})
  const [notice, setNotice] = useState('')
  const parsed = useMemo(() => parseDay3TiebreakRuntime(runtime), [runtime])
  const storedPracticeScores = useMemo(
    () => parseStoredBowlingScores(contentState.practice_scores, aliases, 60),
    [aliases, contentState.practice_scores],
  )
  const storedGameScores = useMemo(
    () => parseStoredBowlingScores(contentState.game_scores, aliases, 300),
    [aliases, contentState.game_scores],
  )
  const storedLastFrameScores = useMemo(
    () => parseStoredBowlingScores(contentState.game_scores, aliases, 30, 'last_frame_score'),
    [aliases, contentState.game_scores],
  )

  useEffect(() => {
    setPracticeScores((current) => storedPracticeScores ?? withAliases(aliases, current))
    setGameScores((current) => storedGameScores ?? withAliases(aliases, current))
    setLastFrameScores((current) => storedLastFrameScores ?? withAliases(aliases, current))
  }, [aliases, storedGameScores, storedLastFrameScores, storedPracticeScores])
  useEffect(() => {
    if (!parsed || parsed.phase !== 'needs_one_ball') setOneBallScores({})
    else setOneBallScores((current) => Object.fromEntries(parsed.tiedTeams.map((team) => [team, current[team] ?? ''])))
  }, [parsed])

  if (!parsed) {
    return <p role="status" className="rounded-2xl bg-boot-soft p-4 text-xs font-bold leading-5 text-boot-muted">
      볼링 동점 상태를 확인하지 못해 점수 저장 버튼을 열지 않았어요. 잠시 뒤 다시 확인해 주세요.
    </p>
  }

  const teamPlan = parseBowlingTeams(contentState.bowling_team_plan)
  const result = parseBowlingResult(contentState.bowling_result)
  const oneBallResult = parseBowlingOneBallScores(contentState.bowling_one_ball_scores, result)
  const comparison = contentState.bowling_comparison === 'adjusted_average' ? '보정 평균' : '보정 합계'
  const freePlay = members.length <= 4

  function submitScoreDraft(action: 'save_practice_scores' | 'save_game_scores', scores: ScoreDraft) {
    const maximum = action === 'save_practice_scores' ? 60 : 300
    const normalized = aliases.map((alias) => ({ alias, score: Number(scores[alias]) }))
    if (aliases.some((alias) => !scores[alias]?.trim())
        || normalized.some((item) => !Number.isInteger(item.score) || item.score < 0 || item.score > maximum)) {
      setNotice(`모든 참가자의 점수를 0~${maximum} 사이 정수로 입력해 주세요.`)
      return
    }
    if (action === 'save_game_scores') {
      const suppliedLastFrames = aliases.filter((alias) => Boolean(lastFrameScores[alias]?.trim()))
      if (suppliedLastFrames.length !== 0 && suppliedLastFrames.length !== aliases.length) {
        setNotice('마지막 프레임은 모든 참가자 값을 함께 적거나 비워 주세요.')
        return
      }
      const lastFrames = suppliedLastFrames.length === aliases.length
        ? buildDay3LastFramePayload(aliases, lastFrameScores)
        : null
      if (suppliedLastFrames.length > 0 && !lastFrames) {
        setNotice('마지막 프레임 점수는 모두 0~30 사이 정수로 입력해 주세요.')
        return
      }
      void act(action, {
        scores: normalized.map((score, index) => ({
          ...score,
          ...(lastFrames ? { last_frame_score: lastFrames.scores[index].score } : {}),
        })),
      })
      return
    }
    void act(action, { scores: normalized })
  }

  function submitTeams() {
    if (teamPlan.length !== aliases.length) {
      setNotice('서버 팀 계산 결과를 다시 불러와 주세요.')
      return
    }
    void act('set_teams', { teams: teamPlan })
  }

  function submitLastFrames() {
    const payload = buildDay3LastFramePayload(aliases, lastFrameScores)
    if (!payload) {
      setNotice('모든 참가자의 마지막 프레임 점수를 0~30 사이 정수로 입력해 주세요.')
      return
    }
    void act('save_bowling_last_frame_scores', payload)
  }

  function submitOneBall() {
    if (!parsed) return
    const payload = buildDay3OneBallPayload(parsed.tiedTeams, oneBallScores)
    if (!payload) {
      setNotice('동점인 모든 팀의 한 볼 점수를 0~10 사이 정수로 입력해 주세요.')
      return
    }
    void act('save_bowling_one_ball_scores', payload)
  }

  return (
    <div>
      <div className="flex items-start gap-2 rounded-2xl bg-boot-soft p-4">
        <ShieldCheck className="mt-0.5 shrink-0 text-boot-primary" size={18} />
        <p className={helperText}>{freePlay ? '3~4명은 팀 순위 없이 모두 한 게임에 참여하고 가명별 원점수만 저장합니다.' : '가명별 점수만 저장합니다. 본게임 팀 비교에는 승인 규칙에 따라 여성 점수 1.5배가 서버에서 계산됩니다.'}</p>
      </div>

      {!freePlay ? <>
        <ScoreInputs title="연습 점수" maximum={60} members={members} values={practiceScores} onChange={setPracticeScores} disabled={busy || Boolean(contentState.practice_scores)} />
        <button type="button" disabled={busy || Boolean(contentState.practice_scores)} onClick={() => submitScoreDraft('save_practice_scores', practiceScores)} className={`${primaryButton} mt-3`}>연습 점수 저장</button>
        {contentState.practice_scores ? <>
          <h3 className="mt-6 text-sm font-black">서버가 확정한 팀</h3>
          <p className={`${helperText} mt-1`}>{members.length === 6 ? '남녀 연습 점수 순위를 교차해 3개 팀으로 배정했습니다.' : '혼성 2명·3명 팀의 보정 평균 차가 가장 작도록 배정했습니다.'}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{teamPlan.map((member) => <div key={member.alias} className="flex items-center justify-between rounded-2xl border border-boot-hairline px-4 py-3 text-sm font-black"><span>{member.alias}</span><span className="rounded-full bg-boot-soft px-3 py-1 text-boot-primary">{member.team}팀</span></div>)}</div>
          <button type="button" disabled={busy || Boolean(contentState.bowling_teams) || teamPlan.length !== members.length} onClick={submitTeams} className={`${primaryButton} mt-3`}>이 팀으로 확정</button>
        </> : null}
      </> : null}

      {(freePlay || contentState.bowling_teams) && !contentState.game_scores ? <>
        <ScoreInputs title="본게임 점수" maximum={300} members={members} values={gameScores} onChange={setGameScores} disabled={busy} />
        {!freePlay ? <ScoreInputs title="마지막 프레임 점수 (선택)" maximum={30} members={members} values={lastFrameScores} onChange={setLastFrameScores} disabled={busy} /> : null}
        <p className={`${helperText} mt-2`}>마지막 프레임은 팀 보정 점수와 원점수까지 같을 때만 사용합니다. 지금 비워도 실제 동점이면 다음 단계에서 입력할 수 있어요.</p>
        <button type="button" disabled={busy} onClick={() => submitScoreDraft('save_game_scores', gameScores)} className={`${primaryButton} mt-3`}>본게임 점수 저장</button>
      </> : null}

      {parsed.phase === 'needs_last_frame' ? <section className="mt-5 rounded-2xl border border-boot-hairline p-4" aria-labelledby="day3-last-frame-title">
        <h3 id="day3-last-frame-title" className="text-sm font-black">원점수까지 같아 마지막 프레임을 확인해요</h3>
        <ScoreInputs title="마지막 프레임" maximum={30} members={members} values={lastFrameScores} onChange={setLastFrameScores} disabled={busy} />
        <button type="button" disabled={busy} onClick={submitLastFrames} className={`${primaryButton} mt-3`}>마지막 프레임 저장</button>
      </section> : null}

      {parsed.phase === 'needs_one_ball' ? <section className="mt-5 rounded-2xl border border-boot-hairline p-4" aria-labelledby="day3-one-ball-title">
        <h3 id="day3-one-ball-title" className="text-sm font-black">마지막 프레임도 같아 팀 한 볼을 확인해요</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{parsed.tiedTeams.map((team) => <label key={team} className="flex items-center justify-between gap-3 text-sm font-black"><span>{team}팀 한 볼</span><input type="number" min={0} max={10} step={1} value={oneBallScores[team] ?? ''} disabled={busy} onChange={(event) => setOneBallScores((current) => ({ ...current, [team]: event.target.value }))} aria-label={`${team}팀 한 볼 점수`} className="w-24 rounded-xl border border-boot-hairline px-3 py-2 text-right" /></label>)}</div>
        <button type="button" disabled={busy} onClick={submitOneBall} className={`${primaryButton} mt-3`}>팀 한 볼 저장</button>
      </section> : null}

      {result.length ? <div className="mt-5 rounded-2xl bg-boot-soft p-4">
        <h3 className="text-sm font-black">팀 결과 · {comparison}</h3>
        <p className={`${helperText} mt-1`}>동점이면 보정 점수 다음에 원점수 합계 → 마지막 프레임 합계 → 팀 한 볼 순으로 순위를 정해요.</p>
        <div className="mt-3 space-y-2">{result.map((item) => <p key={item.team} className="flex justify-between text-sm font-bold"><span>{item.rank}위 · {item.team}팀{item.tied ? ' (공동 순위)' : ''}</span><span>{item.total}점</span></p>)}</div>
        {oneBallResult.length ? <div className="mt-3 border-t border-boot-hairline pt-3">
          <p className="text-xs font-black text-boot-ink">이번 결과에는 팀 한 볼 점수가 반영됐어요.</p>
          <ul className="mt-2 flex flex-wrap gap-2" aria-label="팀 한 볼 동점 해소 점수">
            {oneBallResult.map((item) => <li key={item.team} className="rounded-full bg-white px-3 py-1 text-xs font-black text-boot-primary">{item.team}팀 한 볼 {item.score}점</li>)}
          </ul>
        </div> : null}
      </div> : null}
      {!completed && contentState.game_scores && parsed.phase !== 'needs_last_frame' && parsed.phase !== 'needs_one_ball' ? <button type="button" disabled={busy} onClick={() => void act('finish_occurrence')} className={`${primaryButton} mt-5`}>볼링 회차 마치기</button> : null}
      {notice ? <p role="status" className={`${helperText} mt-4`}>{notice}</p> : null}
    </div>
  )
}

function ScoreInputs({ title, maximum, members, values, onChange, disabled }: { title: string; maximum: number; members: Member[]; values: ScoreDraft; onChange: (value: ScoreDraft) => void; disabled: boolean }) {
  return <div><h3 className="mt-5 text-sm font-black">{title}</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{members.map((member) => <label key={member.alias} className="flex items-center justify-between gap-3 rounded-2xl border border-boot-hairline px-4 py-3 text-sm font-black"><span>{member.alias}</span><input type="number" min={0} max={maximum} step={1} value={values[member.alias] ?? ''} disabled={disabled} onChange={(event) => onChange({ ...values, [member.alias]: event.target.value })} aria-label={`${member.alias} ${title}`} className="w-24 rounded-xl border border-boot-hairline px-3 py-2 text-right" /></label>)}</div></div>
}

function withAliases(aliases: readonly string[], current: ScoreDraft) {
  return Object.fromEntries(aliases.map((alias) => [alias, current[alias] ?? '']))
}

function parseStoredBowlingScores(
  value: unknown,
  aliases: readonly string[],
  maximum: number,
  field: 'score' | 'last_frame_score' = 'score',
): ScoreDraft | null {
  if (!Array.isArray(value) || value.length !== aliases.length) return null
  const scores: ScoreDraft = {}
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null
    const row = item as { alias?: unknown; score?: unknown; last_frame_score?: unknown }
    if (typeof row.alias !== 'string' || !aliases.includes(row.alias) || row.alias in scores) return null
    const score = row[field]
    if (typeof score !== 'number' || !Number.isInteger(score) || score < 0 || score > maximum) return null
    scores[row.alias] = String(score)
  }
  return scores
}

function parseBowlingTeams(value: unknown): BowlingTeam[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { alias?: unknown; team?: unknown }
    return typeof row.alias === 'string' && (row.team === 'A' || row.team === 'B' || row.team === 'C') ? [{ alias: row.alias, team: row.team }] : []
  }) : []
}

function parseBowlingResult(value: unknown): BowlingResult[] {
  return Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { team?: unknown; total?: unknown; rank?: unknown; tied?: unknown }
    return typeof row.team === 'string' && typeof row.total === 'number' && typeof row.rank === 'number' && typeof row.tied === 'boolean'
      ? [{ team: row.team, total: row.total, rank: row.rank, tied: row.tied }]
      : []
  }) : []
}

function parseBowlingOneBallScores(value: unknown, result: readonly BowlingResult[]): BowlingOneBallScore[] {
  if (!Array.isArray(value) || value.length < 2) return []
  const resultTeams = new Map(result.map((item) => [item.team, item.rank]))
  const seen = new Set<ContinuationDay3Team>()
  const scores: BowlingOneBallScore[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as { team?: unknown; score?: unknown }
    const keys = Object.keys(row)
    if (keys.length !== 2 || !keys.includes('team') || !keys.includes('score')) return []
    if ((row.team !== 'A' && row.team !== 'B' && row.team !== 'C')
        || !resultTeams.has(row.team) || seen.has(row.team)) return []
    if (typeof row.score !== 'number' || !Number.isInteger(row.score) || row.score < 0 || row.score > 10) return []
    seen.add(row.team)
    scores.push({ team: row.team, score: row.score })
  }
  return scores.sort((left, right) => (resultTeams.get(left.team) ?? 0) - (resultTeams.get(right.team) ?? 0))
}

const primaryButton = 'min-h-12 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45'
const helperText = 'text-xs font-bold leading-5 text-boot-muted'
