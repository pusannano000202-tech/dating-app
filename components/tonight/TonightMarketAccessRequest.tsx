'use client'

import Link from 'next/link'
import { CheckCircle2, GraduationCap, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { PEACH_PANEL, TonightPageShell } from './TonightUi'

function idempotencyKey(): string {
  const suffix = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`
  return `market_access_request_${suffix}`.slice(0, 120)
}

export default function TonightMarketAccessRequest() {
  const [state, setState] = useState<'ready' | 'busy' | 'submitted'>('ready')
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (state !== 'ready') return
    setState('busy')
    setError(null)
    const response = await fetch('/api/tonight/market-membership-request', {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotency_key: idempotencyKey() }),
    })
    if (response.ok) {
      setState('submitted')
      return
    }
    const payload = await response.json().catch(() => ({})) as { error?: string }
    setError(payload.error === 'pnu_profile_required'
      ? '프로필 학교를 부산대로 완성한 뒤 요청해 주세요.'
      : '인증 요청을 접수하지 못했어요. 로그인과 프로필을 확인해 주세요.')
    setState('ready')
  }

  return (
    <TonightPageShell eyebrow="PNU TONIGHT" title="부산대 파일럿 참여 확인" description="학교 프로필만으로 자동 승인하지 않고, 최고관리자가 확인한 계정만 오늘밤 신청에 연결합니다.">
      <section className={`${PEACH_PANEL} p-6 text-center sm:p-8`}>
        {state === 'submitted' ? <><CheckCircle2 className="mx-auto h-11 w-11 text-emerald-600" aria-hidden /><h2 className="mt-4 text-2xl font-black">검토 요청을 보냈어요</h2><p className="mt-2 text-sm font-semibold leading-6 text-[#665c58]">승인되기 전에는 오늘밤 신청이 열리지 않아요. 승인 알림을 받은 뒤 다시 들어와 주세요.</p><Link href="/tonight/invite/resume" className="mt-5 inline-flex min-h-12 items-center rounded-2xl bg-[#292321] px-5 text-sm font-black text-white">초대로 돌아가기</Link></> : <><GraduationCap className="mx-auto h-11 w-11 text-[#b94b3f]" aria-hidden /><h2 className="mt-4 text-2xl font-black">부산대 인증 요청</h2><div className="mx-auto mt-4 max-w-lg rounded-2xl bg-[#fff3ee] p-4 text-left text-sm font-semibold leading-6 text-[#665c58]"><ShieldCheck className="mr-2 inline h-4 w-4 text-[#b94b3f]" aria-hidden />예전 학교 이메일 인증값은 사용하지 않아요. 프로필과 운영 확인을 거쳐 명시적으로 승인합니다.</div><button type="button" onClick={() => void submit()} disabled={state === 'busy'} className="mt-5 min-h-12 w-full max-w-lg rounded-2xl bg-[#b94b3f] px-5 text-sm font-black text-white disabled:opacity-40">{state === 'busy' ? '요청 중…' : '검토 요청 보내기'}</button>{error && <p className="mt-4 text-sm font-bold text-rose-800" role="alert">{error}</p>}</>}
      </section>
    </TonightPageShell>
  )
}
