'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, CalendarDays, ShieldCheck, ArrowRight } from 'lucide-react'
import {
  VOICE_TOPICS,
  type VoiceRoom,
  type VoiceTopic,
} from '@/lib/voice/contracts'
import { voiceFetch, voiceCommand } from '@/lib/voice/client'
import { voiceRetryKey, type VoiceRetry } from '@/lib/voice/retry'
import s from './voice.module.css'
import VoiceSportsEventConsole, {
  koreanDateInput,
} from './VoiceSportsEventConsole'
const templateTitles: Record<VoiceTopic, string> = {
  worries: '혼자 고민하던 이야기, 같이 나눌 사람',
  social: '수업 끝, 오늘 있었던 일 이야기할 사람',
  baseball: '야구 보면서 목소리로 같이 응원할 사람',
  department: '우리 과 사람들과 가볍게 수다 떨 사람',
}
type Report = {
  id: string
  room_id: string
  reason: string
  status: string
  created_at: string
  resolution: string | null
}
export default function VoiceOperatorConsole() {
  const createRetry = useRef<VoiceRetry | null>(null)
  const [rooms, setRooms] = useState<VoiceRoom[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [topic, setTopic] = useState<VoiceTopic>('worries'),
    [title, setTitle] = useState(templateTitles.worries),
    [description, setDescription] = useState(
      '처음에는 듣기만 해도 좋아요. 서로의 이야기를 존중하며 편안하게 모여요.',
    ),
    [capacity, setCapacity] = useState(12),
    [startsAt, setStartsAt] = useState(''),
    [endsAt, setEndsAt] = useState(''),
    [scope, setScope] = useState<'school' | 'department'>('school'),
    [departmentKey, setDepartment] = useState(''),
    [sourceUrl, setSourceUrl] = useState(
      'https://www.koreabaseball.com/Schedule/Schedule.aspx',
    ),
    [sourceRevision, setSourceRevision] = useState(''),
    [sourceEventKey, setSourceEventKey] = useState(''),
    [editingRoom, setEditingRoom] = useState<VoiceRoom | null>(null),
    [changeStart, setChangeStart] = useState(''),
    [changeEnd, setChangeEnd] = useState(''),
    [scheduleNotice, setScheduleNotice] = useState(''),
    [changeSourceRevision, setChangeSourceRevision] = useState(''),
    [moderation, setModeration] = useState<{
      roomId: string
      sessionId: string
      revision: number
      participants: Array<{
        identity: string
        displayName: string
        mode: string
        connected: boolean
      }>
    } | null>(null),
    [error, setError] = useState(''),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [selectedReport, setSelectedReport] = useState(''),
    [resolution, setResolution] = useState('')
  async function load() {
    try {
      const r = await voiceFetch<{ rooms: VoiceRoom[] }>(
        '/api/admin/voice/rooms',
      )
      setRooms(r.rooms)
      const d = await voiceFetch<{ reports: Report[] }>(
        '/api/admin/voice/reports',
      )
      setReports(d.reports)
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '운영 정보를 불러오지 못했어요.',
      )
    }
  }
  useEffect(() => {
    void load()
  }, [])
  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const roomInput = {
        title,
        description,
        topic,
        capacity,
        startsAt: new Date(startsAt + ':00+09:00').toISOString(),
        endsAt: new Date(endsAt + ':00+09:00').toISOString(),
        scope,
        departmentKey: scope === 'department' ? departmentKey : null,
        sourceUrl: topic === 'baseball' ? sourceUrl : null,
        sourceRevision: topic === 'baseball' ? sourceRevision : null,
        sourceEventKey: topic === 'baseball' ? sourceEventKey : null,
      }
      createRetry.current = voiceRetryKey(createRetry.current, roomInput)
      await voiceFetch('/api/admin/voice/rooms', {
        room: roomInput,
        idempotencyKey: createRetry.current.key,
      })
      setStatus('모집방을 등록했습니다. 시작 시각에 운영자가 방을 열어 주세요.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '모집방을 등록하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }
  async function change(
    room: VoiceRoom,
    action: 'open' | 'delay' | 'cancel' | 'close' | 'reschedule',
  ) {
    setBusy(true)
    setError('')
    try {
      const result = await voiceFetch<{ mediaCleanupPending: boolean }>(
        '/api/voice/rooms/' + room.id,
        voiceCommand(
          action,
          room.revision,
          action === 'reschedule'
            ? {
                startsAt: new Date(changeStart + ':00+09:00').toISOString(),
                endsAt: new Date(changeEnd + ':00+09:00').toISOString(),
                scheduleNotice,
                ...(room.topic === 'baseball'
                  ? { sourceRevision: changeSourceRevision }
                  : {}),
              }
            : action === 'delay'
              ? { scheduleNotice }
              : {},
        ),
      )
      await load()
      setEditingRoom(null)
      setStatus(
        result.mediaCleanupPending
          ? '권한과 방 상태는 변경됐습니다. 통화 서버의 실제 연결 종료는 재시도 중입니다.'
          : '방 상태를 변경했습니다.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태를 바꾸지 못했어요.')
    } finally {
      setBusy(false)
    }
  }
  async function resolve(nextStatus: 'reviewing' | 'resolved' | 'dismissed') {
    if (!selectedReport || resolution.trim().length < 3) return
    setBusy(true)
    try {
      await voiceFetch('/api/admin/voice/reports', {
        reportId: selectedReport,
        status: nextStatus,
        resolution,
        idempotencyKey: crypto.randomUUID(),
      })
      setStatus('신고 처리 내용을 저장했습니다.')
      setSelectedReport('')
      setResolution('')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }
  async function inspectRoom(roomId: string) {
    try {
      const data = await voiceFetch<{
        moderation: Omit<NonNullable<typeof moderation>, 'roomId'> | null
      }>('/api/voice/rooms/' + roomId)
      setModeration(data.moderation ? { ...data.moderation, roomId } : null)
      if (!data.moderation) setStatus('현재 관리할 활성 통화가 없습니다.')
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '참여 현황을 확인하지 못했습니다.',
      )
    }
  }
  async function kick(identity: string) {
    if (!moderation || busy) return
    setBusy(true)
    try {
      const result = await voiceFetch<{ mediaCleanupPending: boolean }>(
        '/api/voice/sessions/' + moderation.sessionId,
        voiceCommand('kick', moderation.revision, { targetIdentity: identity }),
      )
      setStatus(
        result.mediaCleanupPending
          ? '입장 권한은 해제됐습니다. 통화 서버의 연결 종료는 재시도 중입니다.'
          : '입장 권한을 해제하고 연결 종료를 확인했습니다.',
      )
      await inspectRoom(moderation.roomId)
    } catch (e) {
      setError(e instanceof Error ? e.message : '퇴장 처리하지 못했습니다.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className={s.page}>
      <div className={s.container}>
        <p className={s.eyebrow}>
          <ShieldCheck size={14} className="inline" /> Quantum 운영자 전용 ·
          업장 권한과 별개
        </p>
        <h1 className={s.title}>함께 이야기할 자리를 열어요</h1>
        <p className={s.subtitle}>
          공식 모집방의 주제·시간·정원을 정하고, 대화 안전과 일정 변경을
          관리합니다.
        </p>
        {error && (
          <p role="alert" className={s.error}>
            {error}
          </p>
        )}
        {status && (
          <p role="status" className={s.notice}>
            {status}
          </p>
        )}
        <div className={s.sectionHead}>
          <h2>모집방 준비</h2>
          <Link href="/community/voice" className={s.back}>
            사용자 화면 <ArrowRight size={15} />
          </Link>
        </div>
        <VoiceSportsEventConsole
          onSelect={(event) => {
            setTopic('baseball')
            setTitle(`${event.awayTeam} 대 ${event.homeTeam}, 같이 응원할 사람`)
            setSourceEventKey(event.eventKey)
            setSourceUrl(event.sourceUrl)
            setSourceRevision(event.sourceRevision)
            setStartsAt(koreanDateInput(event.startsAt))
            setEndsAt(
              koreanDateInput(
                new Date(
                  Date.parse(event.startsAt) + 4 * 3600000,
                ).toISOString(),
              ),
            )
            setStatus(
              '검수한 경기를 불러왔습니다. 아래 모집방 입력을 확인하고 등록해 주세요.',
            )
          }}
        />
        <form onSubmit={(e) => void create(e)} className={s.card}>
          <div className={s.tabs} role="group" aria-label="모집 주제 템플릿">
            {VOICE_TOPICS.map((t) => (
              <button
                type="button"
                key={t.id}
                className={s.tab + ' ' + (topic === t.id ? s.selected : '')}
                onClick={() => {
                  setTopic(t.id)
                  setTitle(templateTitles[t.id])
                  if (t.id === 'department') setScope('department')
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <label className={s.field}>
            모집 제목
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={3}
              maxLength={80}
              required
            />
          </label>
          <label className={s.field}>
            무엇을 함께 할까요?
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={600}
              required
            />
          </label>
          <div className={s.row}>
            <label className={s.field}>
              시작 (한국 시간)
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </label>
            <label className={s.field}>
              종료 (최대 8시간)
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </label>
            <label className={s.field}>
              정원 (2~24명)
              <input
                type="number"
                min={2}
                max={24}
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                required
              />
            </label>
          </div>
          <div className={s.row}>
            <label className={s.field}>
              모집 범위
              <select
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as 'school' | 'department')
                }
              >
                <option value="school">같은 학교 전체</option>
                <option value="department">학과 라운지</option>
              </select>
            </label>
            {scope === 'department' && (
              <label className={s.field}>
                학과명
                <input
                  value={departmentKey}
                  onChange={(e) => setDepartment(e.target.value)}
                  maxLength={120}
                  placeholder="예: 기계공학과"
                  required
                />
              </label>
            )}
          </div>
          {topic === 'baseball' && (
            <>
              <label className={s.field}>
                공식 경기 식별값
                <input
                  value={sourceEventKey}
                  onChange={(e) => setSourceEventKey(e.target.value)}
                  placeholder="날짜-원정팀-홈팀-경기번호"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label className={s.field}>
                KBO 공식 일정 주소
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  required
                />
              </label>
              <label className={s.field}>
                확인한 경기·시각·변경 이력
                <input
                  value={sourceRevision}
                  onChange={(e) => setSourceRevision(e.target.value)}
                  placeholder="공식 일정에서 확인한 경기와 확인 시각"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <p className={s.notice}>
                실제 경기 일정은 공식 페이지에서 직접 확인해 입력합니다. 우천
                취소·지연 시 아래 모집방 상태도 변경해 주세요. 영상·중계를
                방에서 송출하지 않습니다.
              </p>
            </>
          )}
          <button className={s.primary} disabled={busy}>
            <Plus size={17} />
            {busy ? '등록 중' : '공식 모집방 등록'}
          </button>
        </form>
        <div className={s.sectionHead}>
          <h2>운영 중인 모집</h2>
        </div>
        <div className={s.grid}>
          {rooms.map((r) => (
            <article key={r.id} className={s.card}>
              <span className={s.badge}>{r.status}</span>
              <h3>{r.title}</h3>
              <p>
                <CalendarDays size={14} className="inline" />{' '}
                {new Date(r.startsAt).toLocaleString('ko-KR')} · 정원{' '}
                {r.capacity}명
              </p>
              <p>
                연결 {r.connected.totalPeople}명 · 연결 준비{' '}
                {r.waiting.totalPeople}명
              </p>
              <div className={s.actions}>
                {['scheduled', 'delayed'].includes(r.status) && (
                  <button
                    className={s.primary}
                    disabled={busy}
                    onClick={() => void change(r, 'open')}
                  >
                    대화방 열기
                  </button>
                )}
                {['scheduled', 'open', 'delayed'].includes(r.status) && (
                  <button
                    className={s.secondary}
                    disabled={busy}
                    onClick={() => {
                      setEditingRoom(r)
                      setScheduleNotice('')
                      setChangeSourceRevision(r.sourceRevision ?? '')
                    }}
                  >
                    지연·일정 변경
                  </button>
                )}
                <button
                  className={s.secondary}
                  disabled={busy}
                  onClick={() => void inspectRoom(r.id)}
                >
                  참여 현황·퇴장 관리
                </button>
                {!['ended', 'cancelled'].includes(r.status) && (
                  <>
                    <button
                      className={s.secondary}
                      disabled={busy}
                      onClick={() => void change(r, 'cancel')}
                    >
                      모집 취소
                    </button>
                    <button
                      className={s.secondary}
                      disabled={busy}
                      onClick={() => void change(r, 'close')}
                    >
                      대화 종료
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!rooms.length && (
            <p className={s.notice}>
              등록된 모집방이 없거나 아직 조회되지 않았습니다.
            </p>
          )}
        </div>
        <div className={s.sectionHead}>
          <h2>신고 처리</h2>
        </div>
        {editingRoom && (
          <section className={s.card} aria-label="모집 일정 변경">
            <h3>{editingRoom.title} · 일정 변경</h3>
            <div className={s.row}>
              <label className={s.field}>
                새 시작 (한국 시간)
                <input
                  type="datetime-local"
                  value={changeStart}
                  onChange={(e) => setChangeStart(e.target.value)}
                />
              </label>
              <label className={s.field}>
                새 종료
                <input
                  type="datetime-local"
                  value={changeEnd}
                  onChange={(e) => setChangeEnd(e.target.value)}
                />
              </label>
            </div>
            <label className={s.field}>
              참가자에게 전할 변경 이유
              <textarea
                value={scheduleNotice}
                onChange={(e) => setScheduleNotice(e.target.value)}
                minLength={3}
                maxLength={300}
              />
            </label>
            {editingRoom.topic === 'baseball' && (
              <label className={s.field}>
                공식 일정 재확인 기록
                <input
                  value={changeSourceRevision}
                  onChange={(e) => setChangeSourceRevision(e.target.value)}
                  maxLength={120}
                />
              </label>
            )}
            <p className={s.small}>
              기존 통화는 종료되며, 변경된 일정에 자동으로 참여시키지 않습니다.
            </p>
            <div className={s.actions}>
              <button
                className={s.secondary}
                disabled={busy || scheduleNotice.trim().length < 3}
                onClick={() => void change(editingRoom, 'delay')}
              >
                시각 미정으로 지연 안내
              </button>
              <button
                className={s.primary}
                disabled={
                  busy ||
                  !changeStart ||
                  !changeEnd ||
                  scheduleNotice.trim().length < 3 ||
                  (editingRoom.topic === 'baseball' &&
                    changeSourceRevision.trim().length < 3)
                }
                onClick={() => void change(editingRoom, 'reschedule')}
              >
                새 일정 저장
              </button>
              <button
                className={s.secondary}
                onClick={() => setEditingRoom(null)}
              >
                닫기
              </button>
            </div>
          </section>
        )}
        {moderation && (
          <section className={s.card} aria-label="현재 보이스 참가자 관리">
            <h3>현재 통화 참여자</h3>
            {moderation.participants.map((p) => (
              <div className={s.cardTop} key={p.identity}>
                <span>
                  {p.displayName} · {p.connected ? '연결됨' : '연결 준비'} ·{' '}
                  {p.mode === 'listen' ? '듣기' : '말하기'}
                </span>
                <button
                  className={s.danger}
                  disabled={busy}
                  onClick={() => void kick(p.identity)}
                >
                  퇴장
                </button>
              </div>
            ))}
            <p className={s.small}>
              마이크를 강제로 켜거나 통화 내용을 녹음할 수 없습니다.
            </p>
          </section>
        )}
        <section className={s.card}>
          <label className={s.field}>
            검토할 신고
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
            >
              <option value="">신고 선택</option>
              {reports
                .filter((r) => ['open', 'reviewing'].includes(r.status))
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.status} ·{' '}
                    {new Date(r.created_at).toLocaleDateString('ko-KR')} ·{' '}
                    {r.reason.slice(0, 45)}
                  </option>
                ))}
            </select>
          </label>
          {selectedReport && (
            <p>{reports.find((r) => r.id === selectedReport)?.reason}</p>
          )}
          <label className={s.field}>
            처리 근거
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              minLength={3}
              maxLength={1000}
            />
          </label>
          <div className={s.actions}>
            <button
              className={s.secondary}
              disabled={busy || !selectedReport || resolution.trim().length < 3}
              onClick={() => void resolve('reviewing')}
            >
              검토 중
            </button>
            <button
              className={s.primary}
              disabled={busy || !selectedReport || resolution.trim().length < 3}
              onClick={() => void resolve('resolved')}
            >
              처리 기록 저장·종결
            </button>
            <button
              className={s.secondary}
              disabled={busy || !selectedReport || resolution.trim().length < 3}
              onClick={() => void resolve('dismissed')}
            >
              사유 기록 후 기각
            </button>
          </div>
          <p className={s.small}>
            신고 접수만으로 이용자를 자동 제재하지 않습니다.
          </p>
        </section>
      </div>
    </main>
  )
}
