'use client'

import { FormEvent, Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { LogIn, MailCheck, Send, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { getSupabaseConfigIssue } from '@/lib/utils'
import BootingLogo from '@/components/BootingLogo'

type LoginStep = 'email' | 'code'

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isEmailOtpRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  return message.includes('email rate limit exceeded') || message.includes('rate limit')
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? searchParams.get('next') ?? '/profile/basic'
  const authError = searchParams.get('auth_error')
  const supabaseConfigIssue = getSupabaseConfigIssue()

  const [step, setStep] = useState<LoginStep>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(authError)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  const normalizedEmail = normalizeEmail(email)
  const codeValue = code.join('')

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = setTimeout(() => setResendCooldown((current) => current - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendCooldown])

  useEffect(() => {
    if (step !== 'code') return
    const timer = setTimeout(() => codeRefs.current[0]?.focus(), 60)
    return () => clearTimeout(timer)
  }, [step])

  useEffect(() => {
    if (step === 'code' && codeValue.length === 6 && !loading) {
      void verifyEmailCode()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeValue, step])

  async function sendEmailCode(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    setError(null)

    if (supabaseConfigIssue) {
      setError(`로그인 설정이 아직 연결되지 않았습니다. ${supabaseConfigIssue}`)
      return
    }

    if (!isLikelyEmail(normalizedEmail)) {
      setError('이메일 주소를 입력해줘.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
      })

      if (err) throw err
      moveToCodeStep(normalizedEmail)
    } catch (e: unknown) {
      if (isEmailOtpRateLimitError(e)) {
        moveToCodeStep(normalizedEmail)
        setResendCooldown(60)
        return
      }

      setError(e instanceof Error ? e.message : '인증번호를 보내지 못했어요. 다시 시도해줘.')
    } finally {
      setLoading(false)
    }
  }

  function moveToCodeStep(nextEmail: string) {
    setEmail(nextEmail)
    setCode(['', '', '', '', '', ''])
    setError(null)
    setStep('code')
    setResendCooldown(60)
  }

  async function verifyEmailCode() {
    setError(null)

    if (supabaseConfigIssue) {
      setError(`로그인 설정이 아직 연결되지 않았습니다. ${supabaseConfigIssue}`)
      return
    }

    if (!isLikelyEmail(normalizedEmail)) {
      setError('이메일 주소를 다시 확인해줘.')
      setStep('email')
      return
    }

    if (codeValue.length !== 6) {
      setError('인증번호 6자리를 입력해줘.')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.verifyOtp({
        email: normalizedEmail,
        token: codeValue,
        type: 'email',
      })

      if (err) throw err
      router.replace(redirectTo)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '인증번호가 맞지 않거나 만료됐어요. 다시 확인해줘.')
      setCode(['', '', '', '', '', ''])
      setTimeout(() => codeRefs.current[0]?.focus(), 60)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    setError(null)

    if (supabaseConfigIssue) {
      setError(`로그인 설정이 아직 연결되지 않았습니다. ${supabaseConfigIssue}`)
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
        },
      })

      if (err) throw err
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Google 로그인으로 이동하지 못했어요. 다시 시도해줘.')
      setLoading(false)
    }
  }

  function handleCodeInput(index: number, value: string) {
    if (!/^\d*$/.test(value)) return

    const next = [...code]
    next[index] = value.slice(-1)
    setCode(next)

    if (value && index < 5) codeRefs.current[index + 1]?.focus()
  }

  function handleCodeKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus()
    }
  }

  function handleCodePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!digits) return

    event.preventDefault()
    const next = ['', '', '', '', '', '']
    for (let i = 0; i < 6; i++) next[i] = digits[i] ?? ''
    setCode(next)
    codeRefs.current[Math.min(digits.length, 5)]?.focus()
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#17120f] px-5 py-8 text-boot-ink">
      <video
        className="absolute inset-0 h-full w-full object-cover opacity-60 motion-reduce:hidden"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
      >
        <source src="/media/booting-login-bg.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,117,89,0.28),transparent_34%),linear-gradient(180deg,rgba(20,14,12,0.36)_0%,rgba(255,247,241,0.92)_44%,rgba(255,247,241,0.98)_100%)]" />

      <section className="relative z-10 w-full max-w-sm">
        <div className="mb-6 rounded-[32px] border border-white/45 bg-white/65 px-5 py-5 text-center shadow-[0_24px_70px_rgba(23,18,15,0.22)] backdrop-blur-2xl">
          <div className="mb-4 flex justify-center">
            <BootingLogo size="lg" />
          </div>
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-boot-primary/20 bg-white/75 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-boot-primary">
            <Sparkles size={12} />
            PNU GROUP MATCHING
          </div>
          <h1 className="text-[2rem] font-black leading-tight tracking-normal">
            오늘 같이 과팅할
            <br />
            친구를 모아보세요
          </h1>
          <p className="mx-auto mt-3 max-w-[17rem] text-sm leading-6 text-boot-muted">
            로그인 후에만 그룹 만들기, 매칭 찾기, 알림 화면을 열 수 있어요.
          </p>
        </div>

        <div className="rounded-[30px] border border-white/55 bg-white/88 p-6 shadow-[0_26px_70px_rgba(23,18,15,0.18)] backdrop-blur-2xl">
          {step === 'email' ? (
            <div>
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-boot-hairline bg-white px-4 py-3.5 text-sm font-black text-boot-ink shadow-sm transition-all hover:border-boot-primary/30 hover:bg-boot-soft disabled:opacity-70"
              >
                <LogIn size={15} strokeWidth={2.6} />
                Google 계정으로 계속하기
              </button>

              <div className="my-5 flex items-center gap-3 text-[11px] font-black text-boot-muted">
                <span className="h-px flex-1 bg-boot-hairline" />
                또는
                <span className="h-px flex-1 bg-boot-hairline" />
              </div>

              <form onSubmit={sendEmailCode}>
                <p className="mb-0.5 text-base font-black">이메일로 시작하기</p>
                <p className="mb-5 text-xs leading-5 text-boot-muted">
                  가입과 로그인을 같은 인증번호로 처리해요.
                </p>

                <label className="mb-4 block">
                  <span className="mb-2 block text-xs font-black text-boot-body">이메일</span>
                  <input
                    type="email"
                    placeholder="student@example.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError(null)
                    }}
                    autoComplete="email"
                    className="glass w-full rounded-xl border border-boot-hairline px-4 py-3.5 text-sm text-boot-ink placeholder-boot-muted transition-all focus:outline-none focus:ring-1 focus:ring-boot-primary/50"
                  />
                </label>

                {error && <p className="mb-3 text-xs font-bold text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-gradient-animated flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-black text-white disabled:opacity-70"
                >
                  <Send size={15} strokeWidth={2.6} />
                  {loading ? '인증번호 보내는 중...' : '인증번호 받기'}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <div className="mb-5 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-boot-soft text-boot-primary">
                  <MailCheck size={26} strokeWidth={2.5} />
                </div>
                <p className="text-base font-black">인증번호 입력</p>
                <p className="mt-2 break-words text-sm leading-6 text-boot-muted">
                  {normalizedEmail} 메일함에 있는 최신 6자리 숫자를 입력해줘.
                </p>
              </div>

              <div className="mb-5 flex gap-2">
                {code.map((digit, index) => (
                  <input
                    key={index}
                    ref={(element) => { codeRefs.current[index] = element }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    aria-label={`인증번호 ${index + 1}번째 자리`}
                    autoComplete="one-time-code"
                    onChange={(event) => handleCodeInput(index, event.target.value)}
                    onKeyDown={(event) => handleCodeKeyDown(index, event)}
                    onPaste={handleCodePaste}
                    className="glass aspect-square min-w-0 flex-1 rounded-xl border border-boot-hairline text-center text-xl font-black text-boot-ink transition-all focus:outline-none focus:ring-2 focus:ring-boot-primary/50"
                  />
                ))}
              </div>

              {error && <p className="mb-3 text-xs font-bold text-red-500">{error}</p>}

              <button
                type="button"
                onClick={() => void verifyEmailCode()}
                disabled={loading}
                className="btn-gradient-animated w-full rounded-xl py-3.5 text-sm font-black text-white disabled:opacity-70"
              >
                {loading ? '확인 중...' : '확인하고 로그인'}
              </button>

              <div className="mt-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setStep('email')
                    setCode(['', '', '', '', '', ''])
                    setError(null)
                    setResendCooldown(0)
                  }}
                  className="px-1 py-2 text-xs font-bold text-boot-muted transition-colors hover:text-boot-primary"
                >
                  다른 이메일 입력
                </button>
                <button
                  type="button"
                  onClick={() => void sendEmailCode()}
                  disabled={loading || resendCooldown > 0}
                  className="px-1 py-2 text-xs font-bold text-boot-primary transition-colors hover:text-boot-coral disabled:cursor-not-allowed disabled:text-boot-muted"
                >
                  {resendCooldown > 0 ? `다시 받기 (${resendCooldown}초)` : '다시 받기'}
                </button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-boot-muted">
          이메일은 로그인과 학교 인증 진행을 위해서만 사용돼요.
        </p>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rose-500/30 border-t-rose-500" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  )
}
