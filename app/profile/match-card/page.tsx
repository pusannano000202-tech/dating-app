'use client'

import { ChevronLeft, RefreshCw, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import QuantumProfilePreferenceWizard from '@/components/profile/QuantumProfilePreferenceWizard'
import { PageShell } from '@/components/ui/PageShell'
import {
  createEmptyQuantumProfilePreference,
  parseQuantumProfilePreference,
  validateQuantumProfilePreference,
  type QuantumProfilePreferenceDraft,
} from '@/lib/matching/quantum-profile-preferences'

type LoadState = 'loading' | 'ready' | 'error'

export default function ProfileMatchCardPage() {
  const router = useRouter()
  const saveInFlight = useRef(false)
  const [draft, setDraft] = useState<QuantumProfilePreferenceDraft>(() => createEmptyQuantumProfilePreference())
  const [backHref, setBackHref] = useState('/match')
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadPreference = useCallback(async () => {
    setLoadState('loading')
    setLoadError(null)
    try {
      const response = await fetch('/api/profile/quantum-preferences', { cache: 'no-store' })
      const payload = await response.json().catch(() => ({})) as { preference?: unknown; error?: string }
      if (!response.ok) {
        setLoadError(response.status === 401
          ? '로그인한 뒤 내 취향 카드를 불러올 수 있어요.'
          : translatePreferenceError(payload.error, 'load'))
        setLoadState('error')
        return false
      }

      if (payload.preference === null) {
        setDraft(createEmptyQuantumProfilePreference())
      } else {
        const preference = parseQuantumProfilePreference(payload.preference)
        if (!preference) {
          setLoadError('저장된 취향 카드를 확인하지 못했어요. 빈 값으로 바꾸지 않았어요.')
          setLoadState('error')
          return false
        }
        setDraft(preference)
      }
      setLoadState('ready')
      return true
    } catch {
      setLoadError('내 취향 카드를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
      setLoadState('error')
      return false
    }
  }, [])

  useEffect(() => {
    setBackHref(getRedirectTarget())
    void loadPreference()
  }, [loadPreference])

  function updateDraft(nextDraft: QuantumProfilePreferenceDraft) {
    setDraft(nextDraft)
    setSaveError(null)
  }

  async function savePreference() {
    if (saveInFlight.current) return
    const validation = validateQuantumProfilePreference(draft)
    if (!validation.ok) {
      setSaveError('필수 항목을 확인해 주세요. 연락처나 SNS 아이디는 적을 수 없어요.')
      return
    }

    saveInFlight.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const response = await fetch('/api/profile/quantum-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preference: { ...draft, updatedAt: null } }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setSaveError(response.status === 401
          ? '로그인한 뒤 내 취향을 저장할 수 있어요.'
          : translatePreferenceError(payload.error, 'save'))
        return
      }

      const refreshed = await loadPreference()
      if (!refreshed) {
        setSaveError('저장은 되었지만 서버 값을 다시 확인하지 못했어요. 다시 불러오기로 확인해 주세요.')
        return
      }
      router.replace(getRedirectTarget())
    } catch {
      setSaveError('내 취향을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.')
    } finally {
      saveInFlight.current = false
      setSaving(false)
    }
  }

  return (
    <PageShell>
      <header className="mb-5 flex items-start gap-3">
        <Link href={backHref} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#E8CEC7] bg-white text-[#6F5C57] shadow-sm" aria-label="뒤로 가기">
          <ChevronLeft size={20} aria-hidden="true" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-[#C24F43]">MY PREFERENCE</p>
          <h1 className="mt-1 text-2xl font-black text-[#241B19]">내 취향 카드</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-[#74635F]">평소 취향은 한 번 저장하고 다음 만남부터 다시 써요.</p>
        </div>
      </header>

      <div className="mb-5 flex items-start gap-3 border-l-2 border-[#D95A4C] bg-[#FFF6F2] px-4 py-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#B84237]" aria-hidden="true" />
        <p className="text-xs font-bold leading-5 text-[#6D5751]">사진·실명·학과·연락처·외모점수는 만남 전 카드에 포함하지 않아요.</p>
      </div>

      {loadState === 'loading' ? <p className="py-8 text-sm font-bold text-[#74635F]">내 취향 카드를 불러오고 있어요.</p> : null}
      {loadState === 'error' ? (
        <section className="border-y border-[#E8CEC7] bg-[#FFF9F7] py-6">
          <p role="alert" className="text-sm font-bold leading-6 text-[#9F3D33]">{loadError ?? '내 취향 카드를 불러오지 못했어요.'}</p>
          <button type="button" onClick={() => void loadPreference()} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#D6BDB6] bg-white px-4 text-sm font-black text-[#6B4C45]">
            <RefreshCw size={17} aria-hidden="true" /> 다시 불러오기
          </button>
        </section>
      ) : null}
      {loadState === 'ready' ? (
        <QuantumProfilePreferenceWizard draft={draft} saving={saving} saveError={saveError} onChange={updateDraft} onSave={() => void savePreference()} />
      ) : null}
    </PageShell>
  )
}

function getRedirectTarget() {
  if (typeof window === 'undefined') return '/match'
  const redirect = new URLSearchParams(window.location.search).get('redirect')
  if (!redirect
    || !redirect.startsWith('/')
    || redirect.startsWith('//')
    || /\\|%2f|%5c/i.test(redirect)) return '/match'

  try {
    const origin = 'https://quantum.local'
    const target = new URL(redirect, origin)
    if (target.origin !== origin
      || (target.pathname !== '/match' && !target.pathname.startsWith('/match/'))) return '/match'
    return `${target.pathname}${target.search}`
  } catch {
    return '/match'
  }
}

function translatePreferenceError(code: string | undefined, action: 'load' | 'save') {
  if (code === 'schema_unavailable') return '취향 저장 기능을 준비 중이에요. 이 상태에서는 저장하지 않았어요.'
  if (code === 'invalid_profile_preference') return '음악 항목에서 연락처·SNS·링크를 빼고 필수 선택을 다시 확인해 주세요.'
  if (action === 'load') return '내 취향 카드를 불러오지 못했어요. 빈 값으로 바꾸지 않았어요.'
  return '내 취향을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}
