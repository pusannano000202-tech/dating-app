'use client'

import { Check, Loader2, LockKeyhole, Smartphone } from 'lucide-react'
import { useState } from 'react'

type StartResponse = { challenge_id?: string; error?: string }

export default function PhoneVerificationPanel({ initiallyVerified = false, onVerified, compact = false }: {
  initiallyVerified?: boolean
  onVerified: () => void
  compact?: boolean
}) {
  const [verified, setVerified] = useState(initiallyVerified)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (verified) return <div className="flex min-h-14 items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800"><span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-600 text-white"><Check size={17} /></span><div><p className="text-sm font-black">인증된 휴대폰</p><p className="mt-0.5 text-xs font-bold text-emerald-700">번호는 공개 프로필에 표시하지 않아요.</p></div></div>

  async function requestCode() {
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/auth/phone/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
      const payload = await response.json().catch(() => ({})) as StartResponse
      if (!response.ok || !payload.challenge_id) { setError(phoneErrorMessage(payload.error)); return }
      setChallengeId(payload.challenge_id); setOtp('')
    } catch { setError('인증 문자를 보내지 못했어요. 잠시 뒤 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }

  async function verifyCode() {
    if (!challengeId) return
    setBusy(true); setError(null)
    try {
      const response = await fetch('/api/auth/phone/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code: otp, challenge_id: challengeId }) })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) { setError(phoneErrorMessage(payload.error)); return }
      setPhone(''); setOtp(''); setChallengeId(null); setVerified(true); onVerified()
    } catch { setError('인증을 마치지 못했어요. 잠시 뒤 다시 시도해 주세요.') }
    finally { setBusy(false) }
  }

  const inputClass = 'min-h-12 w-full rounded-xl border border-boot-hairline bg-white px-4 text-base font-bold text-boot-ink outline-none focus:border-boot-primary focus:ring-2 focus:ring-boot-primary/15 disabled:opacity-50'
  return <div className={compact ? 'space-y-3' : 'space-y-4 rounded-xl border border-boot-hairline bg-white p-4'}>
    {!compact && <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-boot-soft text-boot-primary"><Smartphone size={19} /></span><div><p className="text-sm font-black text-boot-ink">휴대폰 본인 인증</p><p className="mt-1 text-xs font-bold leading-5 text-boot-muted">로그인과 안전한 커뮤니티 이용에만 사용하며 다른 회원에게 공개하지 않아요.</p></div></div>}
    <label className="block"><span className="mb-2 block text-xs font-black text-boot-muted">휴대폰 번호</span><input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="010 1234 5678" value={phone} onChange={(event) => setPhone(event.target.value.replace(/[^0-9 -]/g, '').slice(0, 13))} disabled={busy || Boolean(challengeId)} className={inputClass} /></label>
    {challengeId ? <><label className="block"><span className="mb-2 block text-xs font-black text-boot-muted">문자로 받은 6자리 번호</span><input type="text" inputMode="numeric" autoComplete="one-time-code" aria-label="휴대폰 인증번호" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy} className={`${inputClass} tracking-[0.28em]`} /></label><div className="grid grid-cols-[1fr_2fr] gap-2"><button type="button" onClick={() => { setChallengeId(null); setOtp(''); setError(null) }} disabled={busy} className="min-h-12 rounded-xl border border-boot-hairline text-sm font-black text-boot-ink disabled:opacity-50">번호 수정</button><button type="button" onClick={() => { void verifyCode() }} disabled={busy || otp.length !== 6} className="min-h-12 rounded-xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : '인증 완료'}</button></div></> : <button type="button" onClick={() => { void requestCode() }} disabled={busy || phone.replace(/\D/g, '').length !== 11} className="min-h-12 w-full rounded-xl bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={17} className="mx-auto animate-spin" /> : '인증 문자 받기'}</button>}
    {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2.5 text-xs font-bold leading-5 text-rose-700">{error}</p>}
    <p className="flex items-center gap-1.5 text-[11px] font-bold text-boot-muted"><LockKeyhole size={13} /> 인증번호는 저장하거나 기록하지 않아요.</p>
  </div>
}

function phoneErrorMessage(code?: string) {
  if (code === 'invalid_phone') return '010으로 시작하는 휴대폰 번호를 확인해 주세요.'
  if (code === 'local_test_phone_only') return '현재는 로컬 테스트 환경이에요. 안내된 테스트 번호로 진행해 주세요.'
  if (code === 'phone_verification_rate_limited') return '요청이 많아요. 잠시 뒤 다시 시도해 주세요.'
  if (code === 'phone_verification_unavailable') return '휴대폰 인증이 잠시 어려워요. 잠시 뒤 다시 시도해 주세요.'
  return '번호 또는 인증번호를 확인한 뒤 다시 시도해 주세요.'
}
