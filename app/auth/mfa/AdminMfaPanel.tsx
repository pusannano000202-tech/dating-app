'use client'

import { FormEvent, useRef, useState } from 'react'
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react'

import BootingLogo from '@/components/BootingLogo'
import { createClient } from '@/lib/supabase'

export interface AdminMfaFactor {
  id: string
  friendlyName: string
}

interface EnrollmentState {
  factorId: string
  qrCode: string
  secret: string
}

export default function AdminMfaPanel({
  mode,
  factors,
  returnTo,
}: {
  mode: 'enroll' | 'challenge'
  factors: AdminMfaFactor[]
  returnTo: string
}) {
  const [enrollment, setEnrollment] = useState<EnrollmentState | null>(null)
  const [selectedFactorId, setSelectedFactorId] = useState(factors[0]?.id ?? '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestInFlight = useRef(false)

  function beginRequest(): boolean {
    if (requestInFlight.current) return false
    requestInFlight.current = true
    setBusy(true)
    setError(null)
    return true
  }

  function endRequest() {
    requestInFlight.current = false
    setBusy(false)
  }

  async function startEnrollment() {
    if (!beginRequest()) return
    try {
      const supabase = createClient()
      const listed = await supabase.auth.mfa.listFactors()
      if (listed.error) throw listed.error
      if (listed.data.totp.length > 0) {
        window.location.reload()
        return
      }
      for (const factor of listed.data.all.filter(
        (item) => item.factor_type === 'totp' && item.status === 'unverified',
      )) {
        const removed = await supabase.auth.mfa.unenroll({ factorId: factor.id })
        if (removed.error) throw removed.error
      }
      const result = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'Quantum 관리자 인증 앱',
      })
      if (result.error) throw result.error
      setEnrollment({
        factorId: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      })
    } catch {
      setError('인증 앱 등록을 시작하지 못했습니다. 관리자 MFA 설정과 연결 상태를 확인해 주세요.')
    } finally {
      endRequest()
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!/^\d{6}$/.test(code)) {
      setError('인증 앱의 6자리 코드를 입력해 주세요.')
      return
    }

    const factorId = enrollment?.factorId ?? selectedFactorId
    if (!factorId) {
      setError('확인할 인증 앱을 찾지 못했습니다.')
      return
    }

    if (!beginRequest()) return
    try {
      const supabase = createClient()
      const verified = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
      if (verified.error) throw verified.error
      const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assurance.error || assurance.data.currentLevel !== 'aal2') {
        throw new Error('aal2_not_confirmed')
      }
      window.location.assign(returnTo)
    } catch {
      setError('코드가 맞지 않거나 만료됐습니다. 인증 앱의 최신 코드를 다시 입력해 주세요.')
      setCode('')
    } finally {
      endRequest()
    }
  }

  async function signOut() {
    if (!beginRequest()) return
    try {
      const supabase = createClient()
      const result = await supabase.auth.signOut()
      if (result.error) throw result.error
      window.location.assign('/login')
    } catch {
      setError('로그아웃하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.')
    } finally {
      endRequest()
    }
  }

  const needsEnrollment = mode === 'enroll'

  return (
    <main className="min-h-screen bg-[#fff8f4] px-5 py-10 text-boot-ink">
      <section className="mx-auto w-full max-w-md rounded-[28px] border border-[#ead9d2] bg-white p-6 shadow-[0_24px_70px_rgba(73,45,35,0.12)]">
        <BootingLogo size="md" subtitle="관리자 보안" />
        <div className="mt-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <ShieldCheck size={28} aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-black">관리자 2단계 인증</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-boot-muted">
          관리자 화면과 개인정보 작업은 인증 앱 코드까지 확인된 세션에서만 열립니다.
        </p>

        {needsEnrollment && !enrollment ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void startEnrollment()}
            className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            <KeyRound size={17} aria-hidden />
            {busy ? '등록 준비 중...' : '인증 앱 등록 시작'}
          </button>
        ) : (
          <form onSubmit={verify} className="mt-6 space-y-4">
            {mode === 'challenge' && factors.length > 1 && (
              <label className="block text-sm font-bold">
                인증 앱
                <select
                  value={selectedFactorId}
                  onChange={(event) => setSelectedFactorId(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] bg-white px-3"
                >
                  {factors.map((factor) => (
                    <option key={factor.id} value={factor.id}>{factor.friendlyName}</option>
                  ))}
                </select>
              </label>
            )}

            {enrollment && (
              <div className="rounded-2xl border border-[#ead9d2] bg-[#fff8f4] p-4 text-center">
                {/* Supabase supplies a data URL containing the account-specific TOTP QR. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={enrollment.qrCode} alt="인증 앱 등록 QR 코드" className="mx-auto h-52 w-52 rounded-xl bg-white p-2" />
                <p className="mt-3 text-xs font-bold text-boot-muted">QR을 읽을 수 없으면 아래 키를 인증 앱에 직접 입력하세요.</p>
                <code className="mt-2 block break-all rounded-lg bg-white p-2 text-xs font-black">{enrollment.secret}</code>
              </div>
            )}

            <label className="block text-sm font-bold">
              6자리 인증 코드
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="mt-2 min-h-12 w-full rounded-xl border border-[#ddcbc3] px-4 text-center text-xl font-black tracking-[0.3em]"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="min-h-12 w-full rounded-xl bg-[#292321] px-4 text-sm font-black text-white disabled:opacity-50"
            >
              {busy ? '확인 중...' : needsEnrollment ? '등록하고 관리자 화면 열기' : '확인하고 관리자 화면 열기'}
            </button>
          </form>
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}

        <div className="mt-6 rounded-2xl bg-amber-50 p-4 text-xs font-semibold leading-5 text-amber-950">
          인증 앱을 사용할 수 없다면 자체 초기화로 우회할 수 없습니다. 로그아웃한 뒤 동료 최고관리자 또는 본인 확인이 가능한 시스템 운영 담당자에게 수동 복구를 요청하세요.
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void signOut()}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#ddcbc3] text-sm font-black text-[#665c58] disabled:opacity-50"
        >
          <LogOut size={16} aria-hidden />
          로그아웃
        </button>
      </section>
    </main>
  )
}
