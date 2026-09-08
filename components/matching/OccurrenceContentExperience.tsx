'use client'

import { CheckCircle2, Loader2, MessageCircle, RotateCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { parseDay1PrivateGameRuntime } from '@/lib/matching/continuation-day1-day3-runtime'
import { getContinuationDayDefinition } from '@/lib/matching/five-meeting-content'
import ContinuationContentGuide from './ContinuationContentGuide'
import Day1PrivateGameRuntime from './Day1PrivateGameRuntime'
import Day2ContinuationRuntime from './Day2ContinuationRuntime'
import Day3BowlingRuntime from './Day3BowlingRuntime'
import Day4ContinuationRuntime from './Day4ContinuationRuntime'
import FiveMeetingPostFlow from './FiveMeetingPostFlow'

type Content = {
  server_now: string
  occurrence_id: string
  series_id: string
  program_day: number
  physical_meeting_no: number
  status: string
  starts_at: string
  ends_at: string
  location: Record<string, unknown>
  content_state: Record<string, unknown>
  content_revision: number
  runtime: unknown
  members: Array<{ alias: string; attendance_status: string }>
  commands: Array<{ action: string; payload?: Record<string, unknown>; resulting_revision: number; created_at: string }>
}

type Action = (action: string, payload?: Record<string, unknown>, options?: { quiet?: boolean }) => Promise<void>
type SharedControlProps = { content: Content; busy: boolean; act: Action }

export default function OccurrenceContentExperience({ occurrenceId }: { occurrenceId: string }) {
  const [content, setContent] = useState<Content | null>(null)
  const [chat, setChat] = useState<{ phase: string; messages: Array<{ id: string; sender_alias: string; message: string }> } | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    try {
      const [contentResponse, chatResponse] = await Promise.all([
        fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/content`, { cache: 'no-store' }),
        fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/chat`, { cache: 'no-store' }),
      ])
      const contentPayload = await contentResponse.json().catch(() => null)
      const chatPayload = await chatResponse.json().catch(() => null)
      if (!contentResponse.ok || !isContent(contentPayload)) throw new Error('load_failed')
      setContent(contentPayload)
      if (chatResponse.ok && isChat(chatPayload)) setChat(chatPayload)
    } catch {
      setNotice('만남 진행 상태를 불러오지 못했어요.')
    }
  }, [occurrenceId])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (busy) return
    const timer = window.setInterval(() => { void load() }, 30_000)
    return () => window.clearInterval(timer)
  }, [busy, load])
  const definition = content ? getContinuationDayDefinition(content.program_day) : null

  async function act(action: string, payload: Record<string, unknown> = {}, options: { quiet?: boolean } = {}) {
    if (!content || busy) return
    setBusy(true)
    if (!options.quiet) setNotice('')
    try {
      const response = await fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/content`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload, expected_content_revision: content.content_revision, idempotency_key: crypto.randomUUID() }),
      })
      const next = await response.json().catch(() => null)
      if (!response.ok || !isContent(next)) throw new Error('action_failed')
      setContent(next)
      if (!options.quiet) setNotice('진행 상태를 안전하게 저장했어요.')
    } catch {
      setNotice('입력값이 빠졌거나 상태가 바뀌었어요. 최신 상태를 확인해 주세요.')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    const trimmed = message.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch(`/api/match/occurrences/${encodeURIComponent(occurrenceId)}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: trimmed, idempotency_key: crypto.randomUUID() }),
      })
      if (!response.ok) throw new Error('send_failed')
      setMessage('')
      await load()
    } catch {
      setNotice('지금은 메시지를 보낼 수 없어요. 채팅 시간을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  if (!content) return <div className="rounded-3xl border border-boot-hairline bg-white p-6 text-center"><Loader2 className="mx-auto animate-spin text-boot-primary" /><p className="mt-3 text-sm font-bold text-boot-muted">{notice || '만남을 여는 중이에요.'}</p>{notice ? <button type="button" onClick={() => void load()} className="mt-3 text-xs font-black text-boot-primary"><RotateCw className="mr-1 inline" size={14} />다시 확인</button> : null}</div>

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-boot-hairline bg-white shadow-sm">
        <header className="bg-[#13211f] px-5 py-6 text-white"><p className="text-[11px] font-black tracking-[0.18em] text-[#F3B95F]">DAY {content.program_day} · 실제 {content.physical_meeting_no}번째</p><h1 className="mt-2 text-2xl font-black">{definition?.title ?? '함께하는 만남'}</h1><p className="mt-2 text-sm font-bold leading-6 text-white/75">{definition?.summary}</p></header>
        <div className="p-5">
          <ContinuationContentGuide
            programDay={content.program_day}
            mode="occurrence"
            rosterSize={continuationGuideRosterSize(content)}
            selectedGame={content.program_day === 1 ? parseDay1PrivateGameRuntime(content.runtime)?.selectedGame ?? undefined : undefined}
          />
          {content.program_day === 1 ? <Day1PrivateGameRuntime runtime={content.runtime} contentState={content.content_state} completed={content.status === 'completed'} busy={busy} act={act} /> : null}
          {content.program_day === 2 ? <Day2ContinuationRuntime runtime={content.runtime} busy={busy} completed={content.status === 'completed'} act={act} /> : null}
          {content.program_day === 3 ? <Day3BowlingRuntime members={content.members} contentState={content.content_state} runtime={content.runtime} completed={content.status === 'completed'} busy={busy} act={act} /> : null}
          {content.program_day === 4 ? <Day4ContinuationRuntime runtime={content.runtime} busy={busy} occurrenceCompleted={content.status === 'completed'} act={act} /> : null}
          {content.program_day === 5 ? <Day5Controls content={content} busy={busy} act={act} /> : null}
          {content.commands.length ? <div className="mt-5 border-t border-boot-hairline pt-4"><p className="text-xs font-black text-boot-muted">저장된 진행 기록</p>{content.commands.slice(-4).map((command) => <p key={`${command.action}-${command.resulting_revision}`} className="mt-2 flex items-center gap-2 text-xs font-bold text-boot-body"><CheckCircle2 size={14} className="text-[#147A70]" />{actionLabel(command.action)}</p>)}</div> : null}
          {notice ? <p role="status" className="mt-4 text-xs font-bold leading-5 text-boot-muted">{notice}</p> : null}
        </div>
      </section>
      {chat?.phase !== 'hidden' ? <section className="rounded-3xl border border-boot-hairline bg-white p-5"><div className="flex items-center gap-2"><MessageCircle className="text-boot-primary" /><h2 className="font-black">회차 가명 채팅</h2></div><p className="mt-2 text-xs font-bold text-boot-muted">채팅은 정해진 시간에만 쓰고, 종료 뒤에는 읽기 전용이 됩니다.</p><div className="mt-4 max-h-64 space-y-2 overflow-y-auto">{chat?.messages.map((item) => <p key={item.id} className="rounded-2xl bg-boot-soft px-3 py-2 text-sm"><b className="mr-2 text-boot-primary">{item.sender_alias}</b>{item.message}</p>)}</div>{chat?.phase === 'send' ? <div className="mt-4 flex gap-2"><input value={message} maxLength={1000} onChange={(event) => setMessage(event.target.value)} className="min-h-12 min-w-0 flex-1 rounded-2xl border border-boot-hairline px-4 text-sm" aria-label="가명 채팅 메시지" /><button type="button" onClick={() => void sendMessage()} disabled={busy || !message.trim()} className={primaryButton}>전송</button></div> : null}</section> : null}
      {content.status === 'completed'
        ? <FiveMeetingPostFlow occurrenceId={occurrenceId} />
        : <section className="rounded-3xl border border-boot-hairline bg-white p-5 shadow-sm"><p className="text-[11px] font-black tracking-[0.16em] text-boot-primary">계속 만나기 · 만남 뒤</p><p className="mt-2 text-sm font-bold leading-6 text-boot-muted">만남이 완료되고 실제 출석이 확정되면 다음 선택을 확인할 수 있어요.</p></section>}
    </div>
  )
}

function Day5Controls({ content, busy, act }: SharedControlProps) {
  const location = content.location
  const checkedIn = typeof content.content_state.checked_in_at === 'string'
  const routeConfirmed = content.content_state.route_confirmed === true
  return <div><div className="rounded-3xl bg-[#13211f] p-5 text-white"><p className="text-xs font-black text-[#F3B95F]">안전 코스</p><h2 className="mt-2 text-xl font-black">{safeText(location.name) || '운영자 확정 장소'}</h2><dl className="mt-4 space-y-3 text-sm font-bold leading-6 text-white/75"><div><dt className="text-white">동선</dt><dd>{safeText(location.route_summary) || '확정된 공개 동선을 확인해 주세요.'}</dd></div><div><dt className="text-white">날씨 대안</dt><dd>{safeText(location.weather_fallback) || '악천후 시 운영자가 안내한 실내 대안으로 이동합니다.'}</dd></div><div><dt className="text-white">귀가 안내</dt><dd>{safeText(location.return_guidance) || '각자 안전한 귀가 수단을 확인하고 무리한 동행을 요구하지 않아요.'}</dd></div></dl></div><p className={`${helperText} mt-4`}>이 버튼은 개인 출석이 아닌 모임 진행 확인입니다. 출석은 운영자 판정 기록을 기준으로 하며, 위치 공유·접촉·음주는 필수가 아닙니다.</p><div className="mt-4 grid gap-2 sm:grid-cols-2">{!checkedIn ? <button type="button" disabled={busy} onClick={() => void act('check_in')} className={primaryButton}>공개 장소 모임 진행 확인</button> : null}{checkedIn && !routeConfirmed ? <button type="button" disabled={busy} onClick={() => void act('confirm_route')} className={primaryButton}>확정 동선 확인</button> : null}<button type="button" disabled={busy} onClick={() => void act('take_break')} className={secondaryButton}>안전 휴식 기록</button>{routeConfirmed ? <button type="button" disabled={busy} onClick={() => void act('finish_occurrence')} className={primaryButton}>마지막 회차 마치기</button> : null}</div></div>
}

const primaryButton = 'min-h-12 rounded-2xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-45'
const secondaryButton = 'min-h-12 rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 text-sm font-black text-boot-primary disabled:opacity-45'
const helperText = 'text-xs font-bold leading-5 text-boot-muted'

function isContent(value: unknown): value is Content {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<Content>
  return typeof row.server_now === 'string' && typeof row.occurrence_id === 'string' && typeof row.program_day === 'number'
    && typeof row.content_revision === 'number' && Array.isArray(row.members) && Array.isArray(row.commands)
    && Boolean(row.location) && typeof row.location === 'object'
}
function isChat(value: unknown): value is { phase: string; messages: Array<{ id: string; sender_alias: string; message: string }> } { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const row = value as { phase?: unknown; messages?: unknown }; return typeof row.phase === 'string' && Array.isArray(row.messages) }
function safeText(value: unknown) { return typeof value === 'string' ? value : '' }
function continuationGuideRosterSize(content: Content) {
  if (content.program_day !== 2 || !content.runtime || typeof content.runtime !== 'object' || Array.isArray(content.runtime)) {
    return content.program_day === 2 ? undefined : content.members.length
  }
  const rosterSize = (content.runtime as Record<string, unknown>).roster_size
  return rosterSize === 5 || rosterSize === 6 ? rosterSize : undefined
}
function actionLabel(action: string) { return ({ select_game: '게임 고르기', vote_day1_game: '내 게임 투표', start_game: '달무티 시작', finish_game: '달무티 마침', start_round: '대화 라운드 시작', advance_prompt: '다음 질문', advance_group_prompt: '우리 조 다음 질문', finish_round: '라운드 마침', save_practice_scores: '연습 점수 저장', set_teams: '팀 정하기', save_game_scores: '본게임 점수 저장', save_bowling_last_frame_scores: '마지막 프레임 저장', save_bowling_one_ball_scores: '팀 한 볼 저장', draw_card: '같은 답 카드 진행', advance_shared_phone_card: '공용폰 카드 진행', check_in: '모임 진행 확인', confirm_route: '확정 동선 확인', take_break: '휴식 기록', finish_occurrence: '오늘 만남 마치기' } as Record<string, string>)[action] ?? action }
