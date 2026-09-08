'use client'

import Link from 'next/link'
import { Building2, CheckCircle2, LoaderCircle, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { PEACH_PANEL, TonightPageShell } from './TonightUi'

export const PARTNER_INVITE_SESSION_KEY = 'quantum:partner-invite:resume'
const SAFE_RESUME_PATH = '/onboarding/partner/resume'

type Invite = {
  invite_id: string
  venue_id: string
  venue_name: string
  partner_role: 'owner' | 'staff'
  status: string
  expires_at: string
  target_matches: boolean
}

type State = 'loading' | 'unauthenticated' | 'ready' | 'claimed' | 'error'

function idempotencyKey(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `partner_invite_claim_${suffix}`.slice(0, 120)
}

export default function PartnerInviteExperience({ token }: { token: string }) {
  const [state, setState] = useState<State>('loading')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    sessionStorage.setItem(PARTNER_INVITE_SESSION_KEY, token)
    setState('loading')
    setError(null)
    const response = await fetch(`/api/partner/onboarding/${encodeURIComponent(token)}`, {
      cache: 'no-store', credentials: 'same-origin',
    })
    const payload = await response.json().catch(() => ({})) as { invite?: Invite; error?: string }
    if (response.status === 401) {
      setState('unauthenticated')
      return
    }
    if (!response.ok || !payload.invite || payload.invite.target_matches !== true) {
      setError(payload.error === 'invite_expired' ? '초대 유효기간이 끝났어요.' : '이 계정에서 사용할 수 없는 초대예요.')
      setState('error')
      return
    }
    if (payload.invite.status !== 'pending') {
      setError(payload.invite.status === 'claimed' ? '승인 대기 중인 초대예요.' : '이미 처리된 초대예요.')
      setState('error')
      return
    }
    setInvite(payload.invite)
    setState('ready')
  }, [token])

  useEffect(() => {
    void load().catch(() => {
      setError('초대를 확인하지 못했어요.')
      setState('error')
    })
  }, [load])

  async function claim() {
    if (!invite || !confirmed || busy) return
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/partner/onboarding/${encodeURIComponent(token)}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotency_key: idempotencyKey() }),
    })
    if (response.ok) {
      sessionStorage.removeItem(PARTNER_INVITE_SESSION_KEY)
      setState('claimed')
    } else {
      const payload = await response.json().catch(() => ({})) as { error?: string }
      setError(payload.error === 'invite_expired' ? '초대 유효기간이 끝났어요.' : '초대를 수락하지 못했어요. 새로고침 후 다시 확인해 주세요.')
    }
    setBusy(false)
  }

  return (
    <TonightPageShell eyebrow="PARTNER ONBOARDING" title="퀀텀 업장 파트너 초대" description="로그인한 본인 계정과 초대된 업장을 확인한 뒤 직접 수락합니다.">
      {state === 'loading' && <section className={`${PEACH_PANEL} p-10 text-center`} role="status"><LoaderCircle className="mx-auto h-8 w-8 animate-spin text-[#b94b3f]" aria-hidden /><p className="mt-4 font-black">초대 권한을 확인하는 중이에요</p></section>}
      {state === 'unauthenticated' && <section className={`${PEACH_PANEL} p-8 text-center`}><ShieldCheck className="mx-auto h-10 w-10 text-[#b94b3f]" aria-hidden /><h2 className="mt-4 text-xl font-black">먼저 본인 계정으로 로그인해 주세요</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">로그인·회원가입 후 비밀 없는 복귀 화면을 거쳐 같은 탭의 초대로 돌아옵니다.</p><Link href={`/login?redirect=${encodeURIComponent(SAFE_RESUME_PATH)}`} className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-[#b94b3f] px-5 text-sm font-black text-white">로그인/회원가입 후 계속</Link></section>}
      {state === 'ready' && invite && <section className={`${PEACH_PANEL} p-6 sm:p-8`}><Building2 className="h-9 w-9 text-[#b94b3f]" aria-hidden /><p className="mt-5 text-xs font-black tracking-[0.12em] text-[#b94b3f]">내 업장 이름</p><h2 className="mt-1 text-2xl font-black">{invite.venue_name}</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">{invite.partner_role === 'owner' ? '사장님' : '직원'} 권한 · 수락 뒤 최고관리자 승인이 필요해요.</p><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-[#fff3ee] p-4 text-sm font-bold leading-6"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5 accent-[#b94b3f]" /><span>내가 관리할 업장이 <strong>{invite.venue_name}</strong>인 것을 확인했습니다.</span></label><button type="button" disabled={!confirmed || busy} onClick={() => void claim()} className="mt-4 min-h-12 w-full rounded-2xl bg-[#b94b3f] px-5 text-sm font-black text-white disabled:opacity-40">{busy ? '처리 중…' : '초대 수락'}</button>{error && <p className="mt-4 text-sm font-bold text-rose-800" role="alert">{error}</p>}</section>}
      {state === 'claimed' && <section className={`${PEACH_PANEL} p-8 text-center`}><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden /><h2 className="mt-4 text-2xl font-black">초대를 수락했어요</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">최고관리자가 승인하면 다음 로그인부터 내 업장 전용 화면만 열려요.</p><Link href="/" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-[#292321] px-5 text-sm font-black text-white">홈으로</Link><p className="mt-3 text-xs font-bold text-[#8b7e78]">승인 뒤에는 /partner/tonight 로 이동합니다.</p></section>}
      {state === 'error' && <section className={`${PEACH_PANEL} p-8 text-center`}><h2 className="text-xl font-black">초대를 사용할 수 없어요</h2><p className="mt-2 text-sm font-semibold text-[#665c58]">{error}</p></section>}
    </TonightPageShell>
  )
}
