'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 'phone' | 'otp'

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.startsWith('0')) return '+82' + digits.slice(1)
  if (digits.startsWith('82')) return '+' + digits
  return '+82' + digits
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirect') ?? '/profile/worldcup'

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])

  async function sendOtp() {
    setError(null)
    if (!phone.trim()) { setError('번호를 입력해줘.'); return }
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: err } = await supabase.auth.signInWithOtp({ phone: toE164(phone) })
      if (err) throw err
      setStep('otp')
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

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5">

      {/* 배경 glow */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/20 blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[300px] h-[300px] rounded-full bg-fuchsia-600/15 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">

        {/* 로고 */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl gradient-brand mb-4 shadow-lg shadow-violet-900/50">
            <span className="text-2xl">🎯</span>
          </div>
          <h1 className="text-2xl font-black">부산대 과팅</h1>
          <p className="text-sm text-gray-500 mt-1">대학생 그룹미팅 매칭</p>
        </div>

        {/* 카드 */}
        <div className="glass-strong rounded-3xl p-6">
          {step === 'phone' ? (
            <>
              <p className="text-lg font-bold mb-1">휴대폰 번호 입력</p>
              <p className="text-sm text-gray-500 mb-5">번호는 외부에 공개되지 않아요</p>

              <div className="flex gap-2 mb-4">
                <div className="glass rounded-xl px-3 py-3.5 text-sm font-medium text-gray-400 flex items-center whitespace-nowrap">
                  🇰🇷 +82
                </div>
                <input
                  type="tel"
                  placeholder="010-0000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                  className="flex-1 glass rounded-xl px-4 py-3.5 text-white placeholder-gray-600 text-sm focus:outline-none focus:border-violet-500 border border-transparent"
                />
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              <button onClick={sendOtp} disabled={loading}
                className="btn-gradient w-full py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-violet-900/30">
                {loading ? '발송 중...' : '인증번호 받기'}
              </button>
            </>
          ) : (
            <>
              <p className="text-lg font-bold mb-1">인증번호 입력</p>
              <p className="text-sm text-gray-500 mb-5">
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
                    onChange={(e) => handleOtpInput(idx, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                    className="flex-1 aspect-square text-center text-xl font-black glass rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                ))}
              </div>

              {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

              <button onClick={verifyOtp} disabled={loading}
                className="btn-gradient w-full py-3.5 rounded-xl font-bold text-sm shadow-lg shadow-violet-900/30 mb-3">
                {loading ? '확인 중...' : '확인'}
              </button>

              <button onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(null) }}
                className="w-full py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                번호 다시 입력하기
              </button>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-700 mt-6">
          가입 시 이용약관 및 개인정보처리방침에 동의하게 됩니다
        </p>
      </div>
    </div>
  )
}
