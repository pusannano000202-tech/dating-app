'use client'
import { useEffect, useRef, useState } from 'react'
import type {
  CommunitySportsEvent,
  CommunitySportsEventInput,
} from '@/lib/voice/sports-events'
import { voiceFetch } from '@/lib/voice/client'
import { voiceRetryKey, type VoiceRetry } from '@/lib/voice/retry'
import s from './voice.module.css'
export const koreanDateInput = (iso: string) =>
  new Date(Date.parse(iso) + 9 * 3600000).toISOString().slice(0, 16)
const blank: CommunitySportsEventInput = {
  sport: 'baseball',
  league: 'KBO',
  eventKey: '',
  homeTeam: '',
  awayTeam: '',
  startsAt: '',
  status: 'scheduled',
  sourceUrl: 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
  sourceRevision: '',
  reviewNote: '',
}
const statusNames = {
  scheduled: '예정',
  delayed: '지연',
  cancelled: '취소',
  completed: '종료',
}
export default function VoiceSportsEventConsole({
  onSelect,
}: {
  onSelect: (event: CommunitySportsEvent) => void
}) {
  const [events, setEvents] = useState<CommunitySportsEvent[]>([]),
    [editing, setEditing] = useState<CommunitySportsEvent | null>(null),
    [draft, setDraft] = useState(blank)
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    retry = useRef<VoiceRetry | null>(null)
  async function load() {
    try {
      const data = await voiceFetch<{ events: CommunitySportsEvent[] }>(
        '/api/admin/community/sports-events',
      )
      setEvents(data.events)
    } catch (e) {
      setError(e instanceof Error ? e.message : '경기를 조회하지 못했어요.')
    }
  }
  useEffect(() => {
    void load()
  }, [])
  function edit(event: CommunitySportsEvent) {
    setEditing(event)
    setDraft({
      sport: 'baseball',
      league: 'KBO',
      eventKey: event.eventKey,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      startsAt: koreanDateInput(event.startsAt),
      status: event.status,
      sourceUrl: event.sourceUrl,
      sourceRevision: event.sourceRevision,
      reviewNote: '',
    })
    retry.current = null
  }
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        action: editing ? 'update' : 'create',
        ...(editing ? { eventId: editing.id } : {}),
        expectedRevision: editing?.revision ?? 0,
        event: {
          ...draft,
          startsAt: new Date(draft.startsAt + ':00+09:00').toISOString(),
        },
      }
      retry.current = voiceRetryKey(retry.current, payload)
      const data = await voiceFetch<{ event: CommunitySportsEvent }>(
        '/api/admin/community/sports-events',
        { ...payload, idempotencyKey: retry.current.key },
      )
      setEditing(data.event)
      setMessage(
        '운영자 수동 검수 기록을 저장했습니다. 기존 모집방의 일정도 다시 확인해 주세요.',
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className={s.card}>
      <summary className="cursor-pointer font-bold">
        야구 경기 검수·정정 및 모집방에 연결
      </summary>
      <p className={s.notice}>
        운영자가 KBO 공식 페이지를 직접 확인한 기록입니다. 외부 API 검증이
        아닙니다. 우천 취소·지연·재편성을 정정하고 모집방에도 변경 안내를 남겨
        주세요.
      </p>
      <a
        href="https://www.koreabaseball.com/Schedule/Schedule.aspx"
        target="_blank"
        rel="noreferrer"
        className={s.back}
      >
        KBO 공식 일정 열기 ↗
      </a>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className={s.notice} role="status">
          {message}
        </p>
      )}
      <form onSubmit={save} className={s.card}>
        <h3>{editing ? '경기 기록 정정·재확인' : '새 경기 검수 기록'}</h3>
        <div className={s.row}>
          {(
            [
              { key: 'eventKey', label: '경기 식별값', max: 120 },
              { key: 'homeTeam', label: '홈 팀', max: 80 },
              { key: 'awayTeam', label: '원정 팀', max: 80 },
              { key: 'sourceUrl', label: 'KBO 공식 출처 URL', max: 500 },
              { key: 'sourceRevision', label: '출처 확인 내역', max: 120 },
            ] as const
          ).map((field) => (
            <label className={s.field} key={field.key}>
              {field.label}
              <input
                type={field.key === 'sourceUrl' ? 'url' : 'text'}
                value={draft[field.key]}
                onChange={(e) =>
                  setDraft({ ...draft, [field.key]: e.target.value })
                }
                required
                maxLength={field.max}
                disabled={!!editing && field.key === 'eventKey'}
              />
            </label>
          ))}
          <label className={s.field}>
            시작 (한국 시간)
            <input
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              required
            />
          </label>
          <label className={s.field}>
            현재 상태
            <select
              value={draft.status}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  status: e.target.value as CommunitySportsEventInput['status'],
                })
              }
            >
              {Object.entries(statusNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className={s.field}>
          이번 검수·변경 사유
          <textarea
            value={draft.reviewNote}
            onChange={(e) => setDraft({ ...draft, reviewNote: e.target.value })}
            required
            minLength={3}
            maxLength={500}
          />
        </label>
        <div className={s.actions}>
          <button className={s.primary} disabled={busy}>
            {busy ? '저장 중' : '검수 기록 저장'}
          </button>
          {editing && (
            <button
              type="button"
              className={s.secondary}
              onClick={() => {
                setEditing(null)
                setDraft(blank)
                retry.current = null
              }}
            >
              새 경기 입력
            </button>
          )}
        </div>
      </form>
      {events.map((event) => (
        <article key={event.id} className={s.card}>
          <strong>
            {event.awayTeam} 대 {event.homeTeam}
          </strong>
          <p>
            {new Date(event.startsAt).toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul',
            })}{' '}
            · {statusNames[event.status]}
          </p>
          <p className={s.small}>
            운영자 수동 검수 기록 · 버전 {event.revision} ·{' '}
            {new Date(event.checkedAt).toLocaleString('ko-KR', {
              timeZone: 'Asia/Seoul',
            })}
          </p>
          <div className={s.actions}>
            <button
              type="button"
              className={s.secondary}
              onClick={() => edit(event)}
            >
              정정·다시 확인
            </button>
            <button
              type="button"
              className={s.primary}
              disabled={event.status !== 'scheduled'}
              onClick={() => {
                onSelect(event)
                setMessage(
                  '아래 모집방 입력을 채웠습니다. 종료 시각과 정원을 확인해 주세요.',
                )
              }}
            >
              이 경기로 모집 입력
            </button>
          </div>
          <details>
            <summary>변경 이력 {event.history.length}건</summary>
            {event.history.map((item) => (
              <p className={s.small} key={item.revision}>
                버전 {item.revision} · {item.changeNote} ·{' '}
                {new Date(item.recordedAt).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })}
              </p>
            ))}
          </details>
        </article>
      ))}
    </details>
  )
}
