'use client'

import { useState } from 'react'
import { Check, GraduationCap, Loader2, Send, UsersRound } from 'lucide-react'

type DepartmentFriendSuggestion = {
  user_id: string
  display_name: string | null
}

type DepartmentAutoFriendPanelProps = {
  disabled?: boolean
  preview?: boolean
  onRequestSent?: () => void | Promise<void>
}

const PREVIEW_SUGGESTIONS: DepartmentFriendSuggestion[] = [
  { user_id: 'dev-department-friend-1', display_name: '같은 학과 동기' },
  { user_id: 'dev-department-friend-2', display_name: '같은 학과 선배' },
]

export function DepartmentAutoFriendPanel({
  disabled = false,
  preview = false,
  onRequestSent,
}: DepartmentAutoFriendPanelProps) {
  const [loading, setLoading] = useState(false)
  const [requestingUserId, setRequestingUserId] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<DepartmentFriendSuggestion[]>([])
  const [requestedIds, setRequestedIds] = useState<string[]>([])
  const [discoveryEnabled, setDiscoveryEnabled] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function loadSuggestions() {
    if (disabled || loading) return
    setLoading(true)
    setMessage(null)

    if (preview) {
      setSuggestions(PREVIEW_SUGGESTIONS)
      setDiscoveryEnabled(true)
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/friends/department-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 24, enabled: true }),
      })
      const data = await response.json().catch(() => ({})) as {
        suggestions?: DepartmentFriendSuggestion[]
        error?: string
      }

      if (!response.ok) {
        setMessage(translateSuggestionError(data.error))
        return
      }

      const nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : []
      setSuggestions(nextSuggestions)
      setDiscoveryEnabled(true)
      setMessage(nextSuggestions.length === 0 ? '아직 같은 학과 추천 친구가 없어요.' : null)
    } catch {
      setMessage('같은 학과 친구 추천을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  async function disableDiscovery() {
    if (disabled || loading) return
    setLoading(true)
    setMessage(null)

    if (preview) {
      setDiscoveryEnabled(false)
      setSuggestions([])
      setMessage('같은 학과 추천 노출을 껐어요.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/friends/department-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })
      if (!response.ok) {
        setMessage('추천 노출 설정을 바꾸지 못했어요.')
        return
      }
      setDiscoveryEnabled(false)
      setSuggestions([])
      setMessage('같은 학과 추천 노출을 껐어요.')
    } catch {
      setMessage('추천 노출 설정을 바꾸지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function sendFriendRequest(suggestion: DepartmentFriendSuggestion) {
    if (disabled || requestingUserId || requestedIds.includes(suggestion.user_id)) return
    setRequestingUserId(suggestion.user_id)
    setMessage(null)

    if (preview) {
      setRequestedIds((current) => [...current, suggestion.user_id])
      setRequestingUserId(null)
      return
    }

    try {
      const response = await fetch('/api/friend-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiver_user_id: suggestion.user_id,
          message: '같은 학과 친구 추천에서 요청을 보냈어요.',
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }

      if (!response.ok) {
        setMessage(data.error === 'create_failed'
          ? '이미 친구이거나 처리 중인 요청이 있어요.'
          : '친구 요청을 보내지 못했어요.')
        return
      }

      setRequestedIds((current) => [...current, suggestion.user_id])
      await onRequestSent?.()
    } catch {
      setMessage('친구 요청을 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setRequestingUserId(null)
    }
  }

  return (
    <section className="mb-5 rounded-3xl border border-boot-primary/20 bg-white/90 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          <GraduationCap size={21} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-boot-primary">
            Department
          </p>
          <h2 className="mt-1 text-base font-black leading-tight text-boot-ink">
            같은 학과 친구 추천
          </h2>
          <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">
            학교 인증을 마치고 추천 노출에 동의한 같은 학과 학생끼리만 보여요. 친구는 상대가 수락한 뒤에 추가됩니다.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={loadSuggestions}
        disabled={disabled || loading}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 py-3 text-sm font-black text-boot-primary transition hover:bg-boot-primary/10 disabled:opacity-45"
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : <UsersRound size={17} />}
        {discoveryEnabled ? '같은 학과 추천 새로고침' : '추천 사용하고 보기'}
      </button>

      {discoveryEnabled && (
        <button
          type="button"
          onClick={disableDiscovery}
          disabled={disabled || loading || Boolean(requestingUserId)}
          className="mt-2 w-full py-2 text-xs font-black text-boot-muted underline decoration-boot-hairline underline-offset-4 disabled:opacity-45"
        >
          추천 노출 끄기
        </button>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3 space-y-2" aria-label="같은 학과 친구 추천 목록">
          {suggestions.map((suggestion) => {
            const requested = requestedIds.includes(suggestion.user_id)
            const requesting = requestingUserId === suggestion.user_id
            return (
              <div
                key={suggestion.user_id}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-boot-hairline bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-boot-ink">
                    {suggestion.display_name?.trim() || '같은 학과 학생'}
                  </p>
                  <p className="mt-0.5 text-[11px] font-bold text-boot-muted">상대 수락 후 친구 추가</p>
                </div>
                <button
                  type="button"
                  onClick={() => sendFriendRequest(suggestion)}
                  disabled={disabled || requested || Boolean(requestingUserId)}
                  className="flex h-10 min-w-20 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-boot-primary px-3 text-xs font-black text-white disabled:bg-boot-muted/40"
                >
                  {requesting ? <Loader2 size={14} className="animate-spin" /> : requested ? <Check size={14} /> : <Send size={14} />}
                  {requested ? '요청함' : '요청'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {message && <p className="mt-3 text-xs font-bold leading-5 text-boot-muted">{message}</p>}
    </section>
  )
}

function translateSuggestionError(code?: string) {
  if (code === 'profile_school_required') return '기본정보에서 학교를 먼저 입력해 주세요.'
  if (code === 'profile_department_required') return '기본정보에서 학과를 먼저 입력해 주세요.'
  if (code === 'department_discovery_consent_required') return '추천 사용 동의가 필요해요.'
  if (code === 'school_verification_required') return '학교 이메일 인증을 먼저 완료해 주세요.'
  if (code === 'department_suggestions_unavailable') return '추천 기능을 준비 중이에요.'
  return '같은 학과 친구 추천을 불러오지 못했어요.'
}
