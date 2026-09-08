'use client'

import { CalendarClock, Loader2, Pencil, Send } from 'lucide-react'
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

type WeeklyWindow = {
  id: string
  activity_id: string
  activity_kind: 'board_game' | 'walk' | 'meal' | 'bowling' | 'other'
  week_key: string
  title: string
  summary: string
  starts_at: string
  ends_at: string
  application_closes_at: string
  location_name: string
  capacity: number
  status: 'draft' | 'recruiting' | 'closed' | 'cancelled'
  activity_snapshot: Record<string, unknown>
  revision: number
}

type WindowForm = {
  activityId: string
  activityKind: WeeklyWindow['activity_kind']
  weekKey: string
  title: string
  summary: string
  startsAt: string
  endsAt: string
  applicationClosesAt: string
  locationName: string
  capacity: string
}

const EMPTY_FORM: WindowForm = {
  activityId: 'weekly-board-game',
  activityKind: 'board_game',
  weekKey: '',
  title: '',
  summary: '',
  startsAt: '',
  endsAt: '',
  applicationClosesAt: '',
  locationName: '',
  capacity: '6',
}

export default function WeeklyActivityWindowOperator() {
  const [windows, setWindows] = useState<WeeklyWindow[]>([])
  const [form, setForm] = useState<WindowForm>(EMPTY_FORM)
  const [editing, setEditing] = useState<WeeklyWindow | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/super-admin/match/weekly-windows', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isWindowList(payload)) throw new Error('load_failed')
      setWindows(payload.windows)
    } catch {
      setNotice('주간 모집 창을 불러오지 못했습니다. 최근 관리자 인증 상태를 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const canSubmit = useMemo(() => Boolean(
    form.activityId.trim() && form.weekKey && form.title.trim() && form.summary.trim()
    && form.startsAt && form.endsAt && form.applicationClosesAt && form.locationName.trim()
    && Number.isInteger(Number(form.capacity)) && Number(form.capacity) >= 5,
  ), [form])

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit || busy) return
    setBusy(true)
    setNotice('')
    try {
      const common = {
        title: form.title.trim(),
        summary: form.summary.trim(),
        starts_at: toIso(form.startsAt),
        ends_at: toIso(form.endsAt),
        application_closes_at: toIso(form.applicationClosesAt),
        location_name: form.locationName.trim(),
        capacity: Number(form.capacity),
        activity_snapshot: {
          activity_id: form.activityId.trim(),
          activity_kind: form.activityKind,
          title: form.title.trim(),
          summary: form.summary.trim(),
        },
        idempotency_key: crypto.randomUUID(),
      }
      const body = editing
        ? { action: 'update', window_id: editing.id, expected_revision: editing.revision, ...common }
        : {
            action: 'create', activity_id: form.activityId.trim(), activity_kind: form.activityKind,
            week_key: form.weekKey, ...common,
          }
      const response = await fetch('/api/admin/super-admin/match/weekly-windows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!response.ok) throw new Error('save_failed')
      setEditing(null)
      setForm(EMPTY_FORM)
      setNotice(editing ? '초안을 최신 revision 기준으로 수정했습니다.' : '모집 초안을 만들었습니다.')
      await load()
    } catch {
      setNotice('저장하지 못했습니다. 시간 순서와 최신 revision을 확인한 뒤 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function publish(window: WeeklyWindow) {
    if (busy || window.status === 'recruiting') return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/super-admin/match/weekly-windows', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'publish', window_id: window.id, expected_revision: window.revision,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      if (!response.ok) throw new Error('publish_failed')
      setNotice('모집 공개가 완료됐습니다. 사용자 주간 모집 목록에 노출됩니다.')
      await load()
    } catch {
      setNotice('공개하지 못했습니다. 마감·시작 시간과 최신 revision을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  function startEdit(item: WeeklyWindow) {
    setEditing(item)
    setForm({
      activityId: item.activity_id,
      activityKind: item.activity_kind,
      weekKey: item.week_key,
      title: item.title,
      summary: item.summary,
      startsAt: toLocalInput(item.starts_at),
      endsAt: toLocalInput(item.ends_at),
      applicationClosesAt: toLocalInput(item.application_closes_at),
      locationName: item.location_name,
      capacity: String(item.capacity),
    })
    globalThis.window?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <main className="min-h-screen bg-[#f7f4ec] px-4 py-8 text-[#17211f]">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-[#13211f] px-6 py-7 text-white">
          <p className="text-[11px] font-black tracking-[0.18em] text-[#F3B95F]">WEEKLY WINDOW CONTROL</p>
          <h1 className="mt-2 text-2xl font-black">주간 활동 모집 운영</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-white/70">초안은 공개 전까지 수정할 수 있고, 모든 변경은 idempotency와 revision CAS로 보호됩니다.</p>
        </header>

        <form onSubmit={save} className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><CalendarClock className="text-[#147A70]" /><h2 className="font-black">{editing ? '모집 초안 수정' : '새 모집 초안'}</h2></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="활동 ID"><input value={form.activityId} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, activityId: event.target.value })} required pattern="[a-z0-9][a-z0-9-]*" className={inputClass} /></Field>
            <Field label="활동 종류"><select value={form.activityKind} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, activityKind: event.target.value as WeeklyWindow['activity_kind'] })} className={inputClass}>{['board_game', 'walk', 'meal', 'bowling', 'other'].map((kind) => <option key={kind} value={kind}>{activityKindLabel(kind)}</option>)}</select></Field>
            <Field label="주 시작일 (월요일)"><input type="date" value={form.weekKey} disabled={Boolean(editing)} onChange={(event) => setForm({ ...form, weekKey: event.target.value })} required className={inputClass} /></Field>
            <Field label="정원 (5~60명)"><input type="number" min={5} max={60} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} required className={inputClass} /></Field>
            <Field label="제목"><input value={form.title} maxLength={80} onChange={(event) => setForm({ ...form, title: event.target.value })} required className={inputClass} /></Field>
            <Field label="장소"><input value={form.locationName} maxLength={160} onChange={(event) => setForm({ ...form, locationName: event.target.value })} required className={inputClass} /></Field>
            <Field label="신청 마감"><input type="datetime-local" value={form.applicationClosesAt} onChange={(event) => setForm({ ...form, applicationClosesAt: event.target.value })} required className={inputClass} /></Field>
            <Field label="시작"><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} required className={inputClass} /></Field>
            <Field label="종료"><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} required className={inputClass} /></Field>
            <Field label="설명" wide><textarea value={form.summary} maxLength={280} rows={3} onChange={(event) => setForm({ ...form, summary: event.target.value })} required className={inputClass} /></Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={!canSubmit || busy} className="min-h-12 rounded-2xl bg-[#147A70] px-5 text-sm font-black text-white disabled:opacity-45">{busy ? <Loader2 className="mr-2 inline animate-spin" size={16} /> : null}{editing ? 'revision 확인 후 수정' : '초안 만들기'}</button>
            {editing ? <button type="button" onClick={() => { setEditing(null); setForm(EMPTY_FORM) }} className="min-h-12 rounded-2xl border border-black/10 px-5 text-sm font-black">수정 취소</button> : null}
          </div>
        </form>

        {notice ? <p role="status" className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-[#52615d]">{notice}</p> : null}
        <section className="grid gap-4 lg:grid-cols-2">
          {windows.map((window) => (
            <article key={window.id} className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black text-[#147A70]">{window.week_key} · {activityKindLabel(window.activity_kind)}</p><h2 className="mt-1 text-lg font-black">{window.title}</h2></div><span className="rounded-full bg-[#f3eee2] px-3 py-1 text-xs font-black">{statusLabel(window.status)}</span></div>
              <p className="mt-3 text-sm font-bold leading-6 text-[#52615d]">{window.summary}</p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs"><dt className="font-black">장소</dt><dd>{window.location_name}</dd><dt className="font-black">일시</dt><dd>{formatDate(window.starts_at)} – {formatTime(window.ends_at)}</dd><dt className="font-black">마감</dt><dd>{formatDate(window.application_closes_at)}</dd><dt className="font-black">정원</dt><dd>{window.capacity}명 · revision {window.revision}</dd></dl>
              {window.status === 'draft' || window.status === 'closed' ? <div className="mt-5 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => startEdit(window)} className="min-h-11 rounded-2xl border border-black/10 text-sm font-black"><Pencil className="mr-1 inline" size={15} />수정</button><button type="button" disabled={busy} onClick={() => void publish(window)} className="min-h-11 rounded-2xl bg-[#147A70] text-sm font-black text-white"><Send className="mr-1 inline" size={15} />모집 공개</button></div> : null}
            </article>
          ))}
          {!busy && windows.length === 0 ? <p className="rounded-3xl border border-dashed border-black/15 bg-white p-8 text-center text-sm font-bold text-[#52615d]">운영할 주간 모집 창이 없습니다.</p> : null}
        </section>
      </div>
    </main>
  )
}

const inputClass = 'min-h-12 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-[#147A70] disabled:bg-black/5'

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={wide ? 'md:col-span-2' : ''}><span className="mb-2 block text-xs font-black text-[#52615d]">{label}</span>{children}</label>
}

function isWindowList(value: unknown): value is { windows: WeeklyWindow[] } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const windows = (value as { windows?: unknown }).windows
  return Array.isArray(windows) && windows.every((row) => row && typeof row === 'object' && typeof (row as WeeklyWindow).id === 'string' && typeof (row as WeeklyWindow).revision === 'number')
}

function toIso(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('invalid_time')
  return date.toISOString()
}

function toLocalInput(value: string) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function activityKindLabel(kind: string) { return ({ board_game: '보드게임', walk: '산책', meal: '식사', bowling: '볼링', other: '기타' } as Record<string, string>)[kind] ?? kind }
function statusLabel(status: WeeklyWindow['status']) { return ({ draft: '초안', recruiting: '모집 중', closed: '마감', cancelled: '취소' } as const)[status] }
function formatDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
function formatTime(value: string) { return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
