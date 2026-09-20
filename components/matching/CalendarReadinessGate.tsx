'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Loader2, RefreshCw } from 'lucide-react'
import { CALENDAR_PREPARATION_PATH, parseCalendarReadiness, type CalendarReadiness } from './calendar-readiness'
import s from './match-journey.module.css'

const unavailable: CalendarReadiness = { status: 'unavailable', profileHref: CALENDAR_PREPARATION_PATH }

export function useCalendarReadiness(enabled: boolean, ownerId: string | null) {
  const owner = useRef(ownerId)
  owner.current = ownerId
  const sequence = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const [snapshot, setSnapshot] = useState<{ owner: string | null; value: CalendarReadiness } | null>(null)
  const check = useCallback(async (): Promise<boolean> => {
    if (!enabled) return true
    if (!ownerId || ownerId === 'unavailable') return false
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    const request = ++sequence.current
    const timeout = window.setTimeout(() => abort.abort(), 12_000)
    setSnapshot({ owner: ownerId, value: { status: 'loading', profileHref: CALENDAR_PREPARATION_PATH } })
    try {
      const response = await fetch('/api/profile/onboarding', {
        cache: 'no-store', signal: abort.signal, headers: { 'X-Quantum-Owner': ownerId },
      })
      const payload: unknown = await response.json().catch(() => null)
      if (owner.current !== ownerId || request !== sequence.current) return false
      const value: CalendarReadiness = response.status === 409
        ? { ...unavailable, status: 'account_changed' }
        : response.ok ? parseCalendarReadiness(payload) ?? unavailable : unavailable
      setSnapshot({ owner: ownerId, value })
      return value.status === 'ready'
    } catch {
      if (owner.current === ownerId && request === sequence.current) setSnapshot({ owner: ownerId, value: unavailable })
      return false
    } finally {
      window.clearTimeout(timeout)
      if (request === sequence.current) controller.current = null
    }
  }, [enabled, ownerId])

  useEffect(() => {
    void check()
    const refresh = () => { if (document.visibilityState === 'visible') void check() }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      sequence.current += 1
      controller.current?.abort()
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [check])

  const value: CalendarReadiness = !enabled ? { ...unavailable, status: 'ready' }
    : !ownerId || ownerId === 'unavailable' ? unavailable
      : snapshot?.owner === ownerId ? snapshot.value : { ...unavailable, status: 'loading' }
  return { value, check }
}

export default function CalendarReadinessGate({ value, onRetry }: { value: CalendarReadiness; onRetry: () => Promise<boolean> }) {
  if (value.status === 'ready') return null
  return <div className={s.notice} role="status">
    {value.status === 'loading' ? <p><Loader2 size={18} className="inline animate-spin" /> 참가 준비 상태를 확인하고 있어요.</p>
      : value.status === 'missing' ? <>
        <p>신청 전에 프로필과 내부 매칭 준비를 마쳐 주세요. 결과 점수는 공개하지 않아요.</p>
        <p>이 탭을 그대로 두고 준비를 마친 뒤 돌아오면, 선택한 날짜와 행사에서 이어갈 수 있어요.</p>
        <a href={value.profileHref} target="_blank" rel="noopener noreferrer" className={s.quietButton}>새 탭에서 프로필 준비 <ArrowUpRight size={15} /></a>
      </> : <p>{value.status === 'account_changed' ? '로그인 계정이 바뀌었어요. 이 화면을 새로고침한 뒤 다시 확인해 주세요.' : '준비 상태를 확인하지 못했어요. 확인되기 전에는 신청이나 결제를 시작하지 않아요.'}</p>}
    {value.status !== 'loading' ? <button type="button" className={s.quietButton} onClick={() => void onRetry()}><RefreshCw size={15} />준비 상태 다시 확인</button> : null}
  </div>
}
