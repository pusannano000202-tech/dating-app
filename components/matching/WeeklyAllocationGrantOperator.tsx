'use client'

import { FormEvent, useState } from 'react'

type Capability = 'weekly_allocation:review' | 'weekly_allocation:execute'
type GrantState = {
  operator_user_id: string
  school_scope_key: 'pnu_self_selected'
  capability: Capability
  enabled: boolean
  revision: number
}

export default function WeeklyAllocationGrantOperator() {
  const [operatorUserId, setOperatorUserId] = useState('')
  const [capability, setCapability] = useState<Capability>('weekly_allocation:review')
  const [grant, setGrant] = useState<GrantState | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  async function load(event?: FormEvent) {
    event?.preventDefault()
    if (!operatorUserId.trim() || busy) return
    setBusy(true)
    setNotice('')
    try {
      const query = new URLSearchParams({ operator_user_id: operatorUserId.trim(), capability })
      const response = await fetch(`/api/admin/super-admin/match/weekly-allocation-grants?${query}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isGrant(payload)) throw new Error('load_failed')
      setGrant(payload)
    } catch {
      setGrant(null)
      setNotice('권한 상태를 불러오지 못했습니다. 운영자 사용자 UUID와 최근 인증을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function setEnabled(enabled: boolean) {
    if (!grant || busy) return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/admin/super-admin/match/weekly-allocation-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operator_user_id: grant.operator_user_id,
          capability: grant.capability,
          enabled,
          expected_revision: grant.revision,
          idempotency_key: crypto.randomUUID(),
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !isGrant(payload)) throw new Error('save_failed')
      setGrant(payload)
      setNotice(enabled ? '부산대 주간 운영 권한을 부여했습니다.' : '부산대 주간 운영 권한을 회수했습니다.')
    } catch {
      setNotice('권한을 변경하지 못했습니다. 최신 revision과 최근 인증을 확인해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto mt-7 max-w-3xl rounded-3xl border border-boot-hairline bg-white p-5">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-boot-primary">Scoped operator grant</p>
      <h2 className="mt-2 text-xl font-black text-boot-ink">주간 배정 운영 권한</h2>
      <p className="mt-2 text-sm font-bold text-boot-muted">현재 학교 범위 · pnu_self_selected</p>
      <form onSubmit={load} className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px_auto]">
        <input value={operatorUserId} onChange={(event) => setOperatorUserId(event.target.value)} placeholder="운영자 사용자 UUID"
          className="min-h-12 rounded-xl border border-boot-hairline px-3 text-sm" />
        <select value={capability} onChange={(event) => { setCapability(event.target.value as Capability); setGrant(null) }}
          className="min-h-12 rounded-xl border border-boot-hairline px-3 text-sm font-bold">
          <option value="weekly_allocation:review">검토 권한</option>
          <option value="weekly_allocation:execute">실행 권한</option>
        </select>
        <button type="submit" disabled={busy || !operatorUserId.trim()} className="min-h-12 rounded-xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-40">조회</button>
      </form>
      {grant ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-boot-soft p-4">
          <p className="text-sm font-black text-boot-ink">{grant.enabled ? '권한 있음' : '권한 없음'} · revision {grant.revision}</p>
          <button type="button" onClick={() => void setEnabled(!grant.enabled)} disabled={busy}
            className="min-h-11 rounded-xl bg-white px-4 text-sm font-black text-boot-primary disabled:opacity-40">
            {grant.enabled ? '권한 회수' : '권한 부여'}
          </button>
        </div>
      ) : null}
      {notice ? <p role="status" className="mt-3 text-sm font-bold text-boot-muted">{notice}</p> : null}
    </section>
  )
}

function isGrant(value: unknown): value is GrantState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Partial<GrantState>
  return typeof row.operator_user_id === 'string'
    && row.school_scope_key === 'pnu_self_selected'
    && (row.capability === 'weekly_allocation:review' || row.capability === 'weekly_allocation:execute')
    && typeof row.enabled === 'boolean'
    && Number.isInteger(row.revision)
}
