'use client'

import { Suspense, useState, useRef, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import DestinyLogo from '@/components/DestinyLogo'

type Step = 'phone' | 'otp'

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return '+82' + digits.slice(1)
  if (digits.startsWith('82')) return '+' + digits
  return '+82' + digits
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
}

/* 별 파티클 — 로고 주변 */
const STARS = [
  { top: '-18px', left: '8px',   size: 5, delay: '0s',    dur: '2.4s' },
  { top: '-10px', left: '52px',  size: 4, delay: '0.6s',  dur: '2.0s' },
  { top: '10px',  left: '-16px', size: 3, delay: '1.1s',  dur: '2.8s' },
  { top: '48px',  left: '-20px', size: 4, delay: '0.3s',  dur: '2.2s' },
  { top: '60px',  left: '56px',  size: 3, delay: '0.9s',  dur: '2.6s' },
  { top: '20px',  left: '66px',  size: 5, delay: '1.5s',  dur: '2.0s' },
]

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/profile/basic'

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendCooldown, setResendCooldown] = useState(0)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  useEffect(() => {
    if (step === 'otp') setTimeout(() => otpRefs.current[0]?.focus(), 50)
  }, [step])

  useEffect(() => {
    if (step === 'otp' && otp.every((d) => d !== '') && !loading) verifyOtp()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step])

  async function sendOtp() {
    setError(null)
    if (!phone.trim()) { setError('번호를 입력해줘.'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.signInWithOtp({ phone: toE164(phone) })
      if (err) throw err
      setStep('otp')
      setResendCooldown(60)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류가 발생했어요. 다시 시도해줘.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    setError(null)
    const token = otp.join('')
    if (token.length < 6) { setError('인증번호 6자리를 입력해줘.'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.verifyOtp({ phone: toE164(phone), token, type: 'sms' })
      if (err) throw err
      router.push(redirectTo)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '인증번호가 틀렸어. 다시 확인해줘.')
    } finally {
      setLoading(false)
    }
  }

  function handleOtpInput(idx: number, value: string) {
    if (!/^\d*$/.test(value)) return
    const next = [...otp]
    next[idx] = value.slice(-1)
    setOtp(next)
    if (value && idx < 5) otpRefs.current[idx + 1]?.focus()
  }

  function handleOtpKeyDown(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus()
  }

  function handleOtpPaste(e: React.ClipboardEvent) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!digits) return
    e.preventDefault()
    const next = [...otp]
    for (let i = 0; i < 6; i++) next[i] = digits[i] ?? ''
    setOtp(next)
    otpRefs.current[Math.min(digits.length, 5)]?.focus()
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5 overflow-hidden">

      {/* 배경 — 우주적 운명 분위기 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-25%] left-[-20%]  w-[600px] h-[600px] rounded-full bg-violet-700/30  blur-[150px]" />
        <div className="absolute top-[-10%] right-[-20%] w-[450px] h-[450px] rounded-full bg-rose-700/22    blur-[120px]" />
        <div className="absolute bottom-[-20%] left-1/2  -translate-x-1/2 w-[500px] h-[400px] rounded-full bg-purple-800/20 blur-[130px]" />
        {/* 미묘한 황금빛 — 운명의 빛 */}
        <div className="absolute top-[30%] right-[5%]   w-[200px] h-[200px] rounded-full bg-amber-600/8   blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">

        {/* ── 로고 히어로 ── */}
        <div className="text-center mb-10">
          {/* 아이콘 + 별 파티클 */}
          <div className="relative inline-block mb-5">
            {STARS.map((s, i) => (
              <span
                key={i}
                className="absolute text-amber-300 animate-star pointer-events-none select-none"
                style={{
                  top: s.top, left: s.left,
                  fontSize: s.size,
                  animationDelay: s.delay,
                  animationDuration: s.dur,
                }}
              >
                ✦
              </span>
            ))}
            <div className="w-20 h-20 rounded-[22px] bg-gradient-to-br from-violet-950 via-rose-950 to-amber-950 flex items-center justify-center shadow-2xl animate-pulse-glow border border-white/10">
              <DestinyLogo size={48} />
            </div>
          </div>

          <h1 className="font-destiny text-4xl font-bold tracking-widest gradient-brand-text">
            Destiny
          </h1>
          <p className="text-sm text-gray-400 mt-2 leading-relaxed text-center">
            당신의 인연이 여기서 시작됩니다
          </p>
        </div>

        {/* ── 로그인 카드 ── */}
        <div className="glass-card rounded-3xl p-6">
          {step === 'phone' ? (
            <>
              <p className="text-base font-bold mb-0.5">휴대폰 번호로 시작하기</p>
              <p className="text-xs text-gray-500 mb-5">번호는 외부에 절대 공개되지 않아요</p>

              <div className="flex gap-2 mb-4">
                <div className="glass rounded-xl px-3 py-3.5 text-sm font-medium text-gray-400 flex items-center whitespace-nowrap">
                  🇰🇷 +82
                </div>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                  autoComplete="tel"
                  className="flex-1 glass rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500/50 border border-transparent transition-all"
                />
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              <button
                onClick={sendOtp}
                disabled={loading}
                className="btn-gradient-animated w-full py-3.5 rounded-xl font-bold text-sm text-white"
              >
                {loading ? '발송 중...' : '인연 찾기'}
              </button>
            </>
          ) : (
            <>
              <p className="text-base font-bold mb-0.5">인증번호 입력</p>
              <p className="text-xs text-gray-500 mb-5">
                {phone}으로 발송된 6자리 번호
              </p>

              <div className="flex gap-2 mb-5">
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { otpRefs.current[idx] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    aria-label={`인증번호 ${idx + 1}번째 자리`}
                    autoComplete="one-time-code"
                    onChange={(e) => handleOtpInput(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    onPaste={handleOtpPaste}
                    className="flex-1 aspect-square text-center text-xl font-black glass rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-500/50 transition-all"
                  />
                ))}
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              <button
                onClick={verifyOtp}
                disabled={loading}
                className="btn-gradient-animated w-full py-3.5 rounded-xl font-bold text-sm text-white mb-3"
              >
                {loading ? '확인 중...' : '확인'}
              </button>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(null); setResendCooldown(0) }}
                  className="py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                >
                  번호 다시 입력
                </button>
                <button
                  onClick={sendOtp}
                  disabled={loading || resendCooldown > 0}
                  className="py-2 text-xs text-rose-400 hover:text-rose-300 transition-colors disabled:text-gray-600 disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `재발송 (${resendCooldown}초)` : '재발송'}
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-700 mt-6 leading-relaxed">
          가입 시 이용약관 및 개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 rounded-full border-2 border-rose-500/30 border-t-rose-500 animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
