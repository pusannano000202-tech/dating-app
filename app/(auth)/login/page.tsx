'use client'

import { useState, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

type Step = 'phone' | 'otp'

// 한국 번호 → E.164 변환 (010-1234-5678 → +821012345678)
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
      const { error: err } = await supabase.auth.verifyOtp({
        phone: toE164(phone),
        token,
        type: 'sms',
      })
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
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus()
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white px-6">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-black mb-1">부산대 과팅</h1>
          <p className="text-sm text-gray-400">대학생 그룹미팅 매칭 앱</p>
        </div>

        {step === 'phone' ? (
          <>
            <p className="text-lg font-bold mb-1">휴대폰 번호로 시작해</p>
            <p className="text-sm text-gray-400 mb-6">번호는 외부에 공개되지 않아.</p>

            <input
              type="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
              className="w-full bg-white/10 text-white placeholder-gray-600 rounded-2xl px-4 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            />

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <button
              onClick={sendOtp}
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg transition-colors disabled:opacity-50"
            >
              {loading ? '발송 중...' : '인증번호 받기'}
            </button>
          </>
        ) : (
          <>
            <p className="text-lg font-bold mb-1">인증번호 입력</p>
            <p className="text-sm text-gray-400 mb-6">
              {phone} 로 발송된 6자리 번호를 입력해줘.
            </p>

            <div className="flex gap-2 mb-6">
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
                  className="flex-1 aspect-square text-center text-2xl font-black bg-white/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              ))}
            </div>

            {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

            <button
              onClick={verifyOtp}
              disabled={loading}
              className="w-full py-4 rounded-2xl bg-purple-600 hover:bg-purple-500 font-bold text-lg transition-colors disabled:opacity-50 mb-3"
            >
              {loading ? '확인 중...' : '확인'}
            </button>

            <button
              onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(null) }}
              className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors"
            >
              번호 다시 입력하기
            </button>
          </>
        )}
      </div>
    </div>
  )
}
