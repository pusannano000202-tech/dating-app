'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, Loader2, Mail, ShieldCheck } from 'lucide-react'
import { isPnuEmail, normalizeSchoolEmail } from '@/lib/auth/school-email'
import { createClient } from '@/lib/supabase'

type Phase = 'loading' | 'ready' | 'sent' | 'verified'

interface RequestResponse {
  ok?: boolean
  dev_code?: string
  error?: string
}

export default function SchoolEmailPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('redirect') ?? '/profile/basic'
  const [phase, setPhase] = useState<Phase>('loading')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('users')
        .select('school_email, school_email_verified_at')
        .eq('id', user.id)
        .maybeSingle()

      if (data?.school_email) setEmail(String(data.school_email))
      setPhase(data?.school_email_verified_at ? 'verified' : 'ready')
    })
  }, [router])

  async function requestCode() {
    const normalizedEmail = normalizeSchoolEmail(email)
    setError(null)
    setDevCode(null)

    if (!isPnuEmail(normalizedEmail)) {
      setError('부산대 메일(@pusan.ac.kr)만 인증할 수 있어요.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/school-email/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      })
      const body = await res.json() as RequestResponse
      if (!res.ok) throw new Error(body.error ?? 'request_failed')
      setEmail(normalizedEmail)
      setDevCode(body.dev_code ?? null)
      setPhase('sent')
    } catch {
      setError('인증번호를 만들지 못했어요. 잠시 뒤 다시 시도해줘.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyCode() {
    const normalizedEmail = normalizeSchoolEmail(email)
    const normalizedCode = code.replace(/\D/g, '').slice(0, 6)
    setError(null)

    if (!isPnuEmail(normalizedEmail)) {
      setError('부산대 메일(@pusan.ac.kr)만 인증할 수 있어요.')
      return
    }

    if (normalizedCode.length !== 6) {
      setError('인증번호 6자리를 입력해줘.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/school-email/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, code: normalizedCode }),
      })
      if (!res.ok) throw new Error('verify_failed')
      setPhase('verified')
      setTimeout(() => router.push(next), 500)
    } catch {
      setError('인증번호가 맞지 않거나 만료됐어요.')
    } finally {
      setLoading(false)
    }
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-400" />
      </div>
    )
  }

  return (
    <main className="min-h-screen px-5 pb-10 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 w-16 h-16 rounded-2xl glass-card flex items-center justify-center">
            {phase === 'verified'
              ? <ShieldCheck className="w-8 h-8 text-green-400" />
              : <Mail className="w-8 h-8 text-violet-300" />}
          </div>
          <h1 className="text-2xl font-black gradient-fate-text">부산대 메일 인증</h1>
          <p className="text-sm text-gray-500 mt-2">
            과팅 참여는 부산대 구성원 인증 후 가능해요.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-5 space-y-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-400 mb-2">부산대 이메일</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && requestCode()}
              placeholder="student@pusan.ac.kr"
              disabled={phase === 'verified'}
              className="w-full glass rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
            />
          </label>

          {phase === 'sent' && (
            <label className="block">
              <span className="block text-xs font-semibold text-gray-400 mb-2">인증번호</span>
              <input
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(event) => event.key === 'Enter' && verifyCode()}
                placeholder="000000"
                className="w-full glass rounded-xl px-4 py-3.5 text-lg tracking-[0.35em] text-center font-black text-white placeholder-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-500/60"
              />
            </label>
          )}

          {devCode && (
            <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3">
              <p className="text-xs text-violet-200">로컬 개발용 인증번호</p>
              <p className="text-xl font-black tracking-[0.25em] text-white mt-1">{devCode}</p>
            </div>
          )}

          {phase === 'verified' && (
            <div className="flex items-center gap-2 rounded-xl border border-green-400/25 bg-green-500/10 px-4 py-3 text-sm text-green-200">
              <Check className="w-4 h-4" />
              학교 인증이 완료됐어요.
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          {phase === 'sent' ? (
            <button
              onClick={verifyCode}
              disabled={loading}
              className="btn-gradient-animated w-full py-3.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
            >
              {loading ? '확인 중...' : '인증 완료'}
            </button>
          ) : (
            <button
              onClick={phase === 'verified' ? () => router.push(next) : requestCode}
              disabled={loading}
              className="btn-gradient-animated w-full py-3.5 rounded-xl font-bold text-sm text-white disabled:opacity-60"
            >
              {loading ? '발송 중...' : phase === 'verified' ? '계속하기' : '인증번호 받기'}
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
