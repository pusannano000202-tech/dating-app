'use client'

import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useId, useReducer, useRef, useState } from 'react'

import {
  dailyIdentityCardReducer,
  initialDailyIdentityCardState,
  nextSeoulMidnightDelay,
  parseDailyIdentityResponse,
  seoulLocalDate,
} from '@/lib/daily-identity'
import { createClient } from '@/lib/supabase'
import { DailyIdentityAccountScope } from '@/lib/daily-identity/account-scope'
import { DailyIdentityPresentation } from './DailyIdentityPresentation'

export function DailyIdentityCard({ className = '' }: { className?: string }) {
  const [card, dispatch] = useReducer(dailyIdentityCardReducer, initialDailyIdentityCardState)
  const headingId = `${useId()}-daily-identity-title`
  const scope = useRef(new DailyIdentityAccountScope())
  const [accountReady, setAccountReady] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const privacyReset = useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
    dispatch({ type: 'privacy-reset' })
  }, [])

  const reveal = useCallback(async () => {
    const lease = scope.current.capture()
    if (!lease) return
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    const isCurrent = () => !controller.signal.aborted
      && requestRef.current === controller && scope.current.isCurrent(lease)
    dispatch({ type: 'reveal' })
    try {
      const response = await fetch('/api/daily-identity', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'X-Expected-Account': lease.account },
        signal: controller.signal,
      })
      if (!isCurrent()) return
      if (response.status === 401 || response.status === 403) {
        scope.current.bind(null)
        setAccountReady(false)
        privacyReset()
        return
      }
      if (!response.ok) throw new Error('daily_identity_unavailable')
      const parsed = parseDailyIdentityResponse(await response.json())
      if (!parsed) throw new Error('daily_identity_invalid')
      if (isCurrent()) {
        requestRef.current = null
        dispatch({ type: 'resolved', identity: parsed })
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && isCurrent()) {
        requestRef.current = null
        dispatch({ type: 'failed' })
      }
    }
  }, [privacyReset])

  useEffect(() => {
    let active = true
    let authEventSeen = false
    const accountScope = scope.current
    let supabase: ReturnType<typeof createClient>
    const bindAccount = (account: string | null) => {
      if (!active) return
      if (accountScope.bind(account)) privacyReset()
      setAccountReady(account !== null)
    }
    try { supabase = createClient() } catch { bindAccount(null); return }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true
      bindAccount(session?.user.id ?? null)
    })
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!authEventSeen) bindAccount(error ? null : data.user?.id ?? null)
    }).catch(() => { if (!authEventSeen) bindAccount(null) })
    return () => {
      active = false
      accountScope.bind(null)
      requestRef.current?.abort()
      subscription.unsubscribe()
    }
  }, [privacyReset])

  useEffect(() => {
    const resetAtMidnight = window.setTimeout(privacyReset, nextSeoulMidnightDelay() + 50)
    const resetIfDateChanged = () => {
      if (card.status === 'ready' && card.identity.localDate !== seoulLocalDate()) privacyReset()
    }
    const handleVisibility = () => { if (document.visibilityState === 'visible') resetIfDateChanged() }
    window.addEventListener('focus', resetIfDateChanged)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.clearTimeout(resetAtMidnight)
      window.removeEventListener('focus', resetIfDateChanged)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [card, privacyReset])

  useEffect(() => () => requestRef.current?.abort(), [])

  if (card.status === 'hidden') {
    return (
      <section aria-labelledby={headingId} className={`rounded-[28px] border border-[#7C4DFF]/20 bg-[linear-gradient(135deg,#F6F0FF_0%,#FFF8F0_58%,#FFFFFF_100%)] p-5 shadow-[0_14px_38px_rgba(42,34,29,0.08)] ${className}`}>
        <p className="flex items-center gap-1.5 text-xs font-black text-[#512DA8]"><Sparkles size={15} aria-hidden />한국 시간 오늘 한 번</p>
        <h2 id={headingId} className="mt-2 text-xl font-black tracking-[-0.03em] text-boot-heading">오늘은 어떤 캐릭터일까요?</h2>
        <p className="mt-2 text-sm font-bold leading-6 text-boot-muted">확인한 이름은 오늘 동안 매칭과 새 모임에서 유지돼요.</p>
        <button type="button" disabled={!accountReady} onClick={() => void reveal()} className="mt-4 min-h-12 w-full rounded-2xl bg-[#6D4AFF] px-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(109,74,255,0.22)] disabled:opacity-50">{accountReady ? '오늘 닉네임 확인해 보기' : '로그인 상태를 확인해 주세요'}</button>
      </section>
    )
  }
  if (card.status === 'loading') {
    return <section aria-busy="true" aria-label="오늘의 별명 불러오는 중" className={`min-h-44 animate-pulse rounded-[28px] border border-boot-hairline bg-white p-5 ${className}`} />
  }
  if (card.status === 'error') {
    return (
      <section aria-labelledby={headingId} className={`rounded-[28px] border border-boot-hairline bg-white p-5 ${className}`}>
        <h2 id={headingId} className="text-sm font-black text-boot-body">오늘의 별명을 아직 보여드릴 수 없어요.</h2>
        <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">잠시 뒤 다시 열어 주세요. 임의의 대체 이름은 만들지 않아요.</p>
        <button type="button" onClick={() => void reveal()} className="mt-4 min-h-11 rounded-xl border border-boot-hairline px-4 text-sm font-black text-boot-primary">다시 시도</button>
      </section>
    )
  }

  return <DailyIdentityPresentation identity={card.identity} headingId={headingId} className={className} />
}
