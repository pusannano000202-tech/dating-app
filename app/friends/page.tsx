'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowRight,
  ChevronLeft,
  Clock3,
  Loader2,
  Search,
  Send,
  RotateCcw,
  UserMinus,
  UserRoundPlus,
  UserX,
  UsersRound,
  Share2,
} from 'lucide-react'
import ConversationList from '@/components/friends/ConversationList'
import FriendSceneBadge from '@/components/friends/FriendSceneBadge'
import DevPreviewNotice from '@/components/dev/DevPreviewNotice'
import { isDevPreviewClientSession } from '@/lib/dev-match-setup'
import { parseFriendSceneList, type FriendSceneSummary } from '@/lib/friends/scene'
import {
  DEV_PREVIEW_CURRENT_USER_ID,
  DEV_PREVIEW_GROUP_MEMBERS,
} from '@/lib/matching/dev-preview-group'

interface FriendRequestRow {
  id: string
  sender_user_id: string
  receiver_user_id: string | null
  receiver_phone: string | null
  token: string
  status: string
  message: string | null
  expires_at: string
  responded_at: string | null
  created_at: string
  sender_display_name?: string | null
  receiver_display_name?: string | null
}

interface FriendSummary {
  user_id: string
  display_name: string | null
  status: string
  photo_url?: string | null
}

interface HiddenFriendSummary {
  user_id: string
  display_name: string | null
  can_restore: boolean
  blocked_at: string | null
}

interface FriendsState {
  sent: FriendRequestRow[]
  received: FriendRequestRow[]
  friends: FriendSummary[]
  hidden_friends: HiddenFriendSummary[]
  current_user_id?: string
}

const EMPTY: FriendsState = { sent: [], received: [], friends: [], hidden_friends: [] }
const DEV_FRIENDS_STATE: FriendsState = {
  sent: [],
  received: [],
  current_user_id: DEV_PREVIEW_CURRENT_USER_ID,
  hidden_friends: [],
  friends: DEV_PREVIEW_GROUP_MEMBERS
    .filter((member) => member.user_id !== DEV_PREVIEW_CURRENT_USER_ID)
    .map((member) => ({
      user_id: member.user_id,
      display_name: member.display_name,
      status: 'accepted',
    })),
}

export default function FriendsPage() {
  const isDevPreview = isDevPreviewClientSession()
  const [previewNoticeReady, setPreviewNoticeReady] = useState(false)
  const [state, setState] = useState<FriendsState>(EMPTY)
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [spaceTab, setSpaceTab] = useState<'friends' | 'messages'>('friends')
  const [friendScenes, setFriendScenes] = useState<Map<string, FriendSceneSummary>>(new Map())
  const [friendSceneState, setFriendSceneState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const inviteAttempt = useRef<string | null>(null)

  async function shareFriendInvite() {
    if (saving) return
    setSaving(true); setError(null); setSuccess(null)
    inviteAttempt.current ??= crypto.randomUUID()
    try {
      const response = await fetch('/api/friend-invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotency_key: inviteAttempt.current }) })
      const payload = await response.json().catch(() => null) as { invite_url?: string; error?: string } | null
      if (!response.ok || typeof payload?.invite_url !== 'string') { setError(payload?.error === 'rate_limited' ? '초대를 너무 자주 만들었어요. 잠시 뒤 다시 시도해 주세요.' : payload?.error === 'friend_name_required' ? '프로필 기본 정보에서 친구가 알아볼 이름을 먼저 입력해 주세요.' : '친구 초대 링크를 만들지 못했어요.'); return }
      const shareUrl = new URL(payload.invite_url, window.location.origin).toString()
      inviteAttempt.current = null
      if (navigator.share) await navigator.share({ title: 'Quantum 친구 초대', url: shareUrl })
      else { await navigator.clipboard.writeText(shareUrl); setSuccess('친구 초대 링크를 복사했어요.') }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setError('친구 초대 링크를 공유하지 못했어요.')
    } finally { setSaving(false) }
  }

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      setState(DEV_FRIENDS_STATE)
      setLoading(false)
      return
    }

    try {
      const res = await fetch('/api/friend-requests')
      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }
      if (!res.ok) {
        setError('친구 정보를 불러오지 못했어요.')
        return
      }
      const data = await res.json() as FriendsState
      setState(data)
    } catch {
      setError('친구 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }, [isDevPreview])

  const refreshFriendScenes = useCallback(async () => {
    if (isDevPreview) {
      setFriendScenes(new Map())
      setFriendSceneState('ready')
      return
    }
    setFriendSceneState('loading')
    try {
      const response = await fetch('/api/friends/scenes', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      const parsed = response.ok ? parseFriendSceneList(payload) : null
      if (!parsed) throw new Error('friend_scene_unavailable')
      setFriendScenes(new Map(parsed.map((row) => [row.friendUserId, row])))
      setFriendSceneState('ready')
    } catch {
      setFriendScenes(new Map())
      setFriendSceneState('unavailable')
    }
  }, [isDevPreview])

  useEffect(() => {
    void refresh()
    void refreshFriendScenes()
  }, [refresh, refreshFriendScenes])

  useEffect(() => {
    setSpaceTab(new URLSearchParams(window.location.search).get('tab') === 'messages' ? 'messages' : 'friends')
  }, [])

  useEffect(() => {
    setPreviewNoticeReady(true)
  }, [])

  async function sendRequest() {
    const trimmed = nickname.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setError(null)
    setSuccess(null)

    if (isDevPreview) {
      setSuccess('디자인 확인용으로 친구 요청을 보낸 상태로 표시했어요.')
      setNickname('')
      setSaving(false)
      window.setTimeout(() => setSuccess(null), 2500)
      return
    }

    try {
      const res = await fetch('/api/friend-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiver_nickname: trimmed }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }

      const data = await res.json() as { duplicate?: boolean }
      setSuccess(data.duplicate ? '이미 보낸 요청이 있어요.' : '친구 요청을 보냈어요.')
      setNickname('')
      window.setTimeout(() => setSuccess(null), 2500)
      await refresh()
    } catch {
      setError('요청을 보내지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function acceptRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/accept`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('수락에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function declineRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/decline`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('거절에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelRequest(id: string) {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/friend-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      await refresh()
    } catch {
      setError('취소에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function removeFriend(friend: FriendSummary) {
    if (saving) return
    if (!window.confirm(`${friend.display_name ?? '이 친구'}님과의 연결을 숨길까요? 서로의 프로필이 닫히고 다음 매칭에서도 만나지 않아요.`)) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/friends/${encodeURIComponent(friend.user_id)}/connection`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      setSuccess('친구 연결을 숨겼어요. 숨긴 친구 관리에서 다시 연결할 수 있어요.')
      await refresh()
    } catch {
      setError('친구 연결을 숨기지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function restoreFriend(friend: HiddenFriendSummary) {
    if (saving || !friend.can_restore) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/friends/${encodeURIComponent(friend.user_id)}/connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        setError(translateError(data.error))
        return
      }
      setSuccess('친구를 다시 연결했어요.')
      await refresh()
    } catch {
      setError('친구를 다시 연결하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  const pendingReceived = useMemo(
    () => state.received.filter((request) => request.status === 'pending'),
    [state.received]
  )
  const pendingSent = useMemo(
    () => state.sent.filter((request) => request.status === 'pending'),
    [state.sent]
  )

  function chooseSpaceTab(tab: 'friends' | 'messages') {
    setSpaceTab(tab)
    const url = new URL(window.location.href)
    if (tab === 'messages') url.searchParams.set('tab', 'messages')
    else url.searchParams.delete('tab')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }

  return (
    <main className="min-h-screen booting-band px-5 pb-28 pt-7 text-boot-ink">
      <div className="mx-auto w-full max-w-[calc(100vw-2.5rem)] sm:max-w-md">
        <header className="mb-6 flex items-center gap-3">
          <Link
            href="/profile/edit"
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-boot-hairline bg-white/90 text-boot-body shadow-sm"
            aria-label="마이로 돌아가기"
          >
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black text-boot-primary">Friends</p>
            <h1 className="text-2xl font-black">친구 관리</h1>
            <p className="mt-0.5 text-xs leading-5 text-boot-muted">
              친구를 찾고, 수락한 친구와 둘만의 약속을 잡아요.
            </p>
          </div>
        </header>

        {previewNoticeReady && isDevPreview && <DevPreviewNotice />}

        {error && (
          <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <nav aria-label="친구 공간" className="mb-5 grid grid-cols-2 rounded-2xl border border-[#E8D9C9] bg-[#FFF9F2] p-1">
          <button type="button" aria-pressed={spaceTab === 'friends'} onClick={() => chooseSpaceTab('friends')} className={`${spaceTab === 'friends' ? 'bg-[#B94B3F] text-white shadow-sm' : 'text-[#9A4E30]'} min-h-11 rounded-xl text-sm font-black`}>친구</button>
          <button type="button" aria-pressed={spaceTab === 'messages'} onClick={() => chooseSpaceTab('messages')} className={`${spaceTab === 'messages' ? 'bg-[#B94B3F] text-white shadow-sm' : 'text-[#9A4E30]'} min-h-11 rounded-xl text-sm font-black`}>대화</button>
        </nav>

        {spaceTab === 'friends' ? <>
        {loading ? <section className="glass-card mb-5 flex items-center gap-3 rounded-3xl border border-boot-hairline bg-white/85 p-5 text-sm text-boot-muted"><Loader2 size={18} className="animate-spin" />친구 정보를 불러오는 중</section> : <FriendDirectory state={state} friendScenes={friendScenes} friendSceneState={friendSceneState} saving={saving} onRemove={removeFriend} />}
        <details className="mb-5 rounded-2xl border border-[#E8D9C9] bg-[#FFF9F2] p-3">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-1 text-sm font-black text-[#9A4E30]">친구 추가·요청 관리<span className="text-[11px]">{loading ? '요청 확인 중' : state === EMPTY && error ? '대기 요청 미확인' : `대기 ${pendingReceived.length + pendingSent.length}개`}</span></summary>
          <div className="border-t border-[#E8D9C9] pt-4">
        <section className="glass-card mb-5 rounded-3xl border border-boot-primary/20 bg-white/95 p-5 shadow-sm">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
              <UsersRound size={22} />
            </div>
            <div>
              <h2 className="text-lg font-black leading-tight">친구와 바로 약속 잡기</h2>
              <p className="mt-1 text-sm leading-6 text-boot-muted">
                친구 요청을 수락하면 서로의 프로필을 보고 밥, 카페, 산책 약속을 제안할 수 있어요.
              </p>
            </div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <MiniStep number="1" label="친구 찾기" />
            <MiniStep number="2" label="요청 수락" />
            <MiniStep number="3" label="약속 제안" />
          </div>

          <Link
            href="#friend-list"
            className="btn-gradient flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black"
          >
            내 친구에서 약속 잡기
            <ArrowRight size={17} />
          </Link>
          <p className="mt-3 text-center text-[11px] leading-5 text-boot-muted">
            친구를 누르면 밥 먹기, 카페, 산책 제안을 바로 보낼 수 있어요.
          </p>
        </section>

        <button type="button" onClick={() => void shareFriendInvite()} disabled={saving || isDevPreview} className="mb-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-boot-primary/25 bg-white font-black text-boot-primary disabled:opacity-50"><Share2 size={18} />친구 초대 링크 공유</button>

        <section id="friend-search" className="mb-5 scroll-mt-4 rounded-3xl border border-boot-hairline bg-white/90 p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black">닉네임으로 친구 찾기</h2>
              <p className="mt-0.5 text-xs leading-5 text-boot-muted">
                친구가 프로필에서 만든 닉네임을 정확히 입력해서 요청을 보내요.
              </p>
            </div>
            <Search size={18} className="text-boot-primary" />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="예: 충현"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              disabled={saving}
              maxLength={20}
              className="min-w-0 flex-1 rounded-2xl border border-boot-hairline bg-white px-4 py-3 text-sm text-boot-ink placeholder-boot-muted focus:border-boot-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={sendRequest}
              disabled={saving || !nickname.trim()}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-primary/20 bg-boot-soft text-boot-primary disabled:opacity-40"
              aria-label="친구 요청 보내기"
            >
              {saving ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
            </button>
          </div>
        </section>

        {!loading ? (
          <>
            {pendingReceived.length > 0 && (
              <section className="mb-5">
                <SectionTitle title="받은 요청" count={pendingReceived.length} />
                <div className="space-y-2">
                  {pendingReceived.map((request) => {
                    const senderName = request.sender_display_name ?? `친구 ${request.sender_user_id.slice(0, 8)}`
                    return (
                      <div key={request.id} className="glass-card flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 shadow-sm">
                        <InitialBadge value={senderName} tone="primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{senderName}</p>
                          {request.message ? (
                            <p className="mt-0.5 truncate text-xs text-boot-muted">{request.message}</p>
                          ) : (
                            <p className="mt-0.5 text-xs text-boot-muted">친구 요청을 보냈어요.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => acceptRequest(request.id)}
                          disabled={saving}
                          className="rounded-xl border border-boot-primary/25 bg-boot-soft px-3 py-2 text-xs font-bold text-boot-primary disabled:opacity-40"
                        >
                          수락
                        </button>
                        <button
                          type="button"
                          onClick={() => declineRequest(request.id)}
                          disabled={saving}
                          className="flex h-9 w-9 items-center justify-center rounded-xl border border-boot-hairline text-boot-muted disabled:opacity-40"
                          aria-label="거절"
                        >
                          <UserX size={15} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {state.hidden_friends.length > 0 ? (
              <section className="mb-5">
                <SectionTitle title="숨긴 친구 관리" count={state.hidden_friends.length} />
                <p className="mb-3 px-1 text-xs leading-5 text-boot-muted">여기서는 프로필이 열리지 않아요. 내가 숨긴 관계만 다시 연결할 수 있어요.</p>
                <div className="space-y-2">
                  {state.hidden_friends.map((friend) => (
                    <div key={friend.user_id} className="flex items-center gap-3 rounded-lg border border-boot-hairline bg-white/80 px-4 py-3">
                      <InitialBadge value={friend.display_name ?? '숨김'} tone="soft" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-black">{friend.display_name ?? '숨긴 친구'}</p>
                        <p className="mt-0.5 text-[11px] text-boot-muted">프로필 비공개 · 다음 매칭 제외</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void restoreFriend(friend)}
                        disabled={saving || !friend.can_restore}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-boot-primary/25 bg-boot-soft px-3 text-xs font-black text-boot-primary disabled:opacity-40"
                      >
                        <RotateCcw size={14} aria-hidden="true" /> 다시 연결
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {pendingSent.length > 0 && (
              <section className="mb-5">
                <SectionTitle title="보낸 요청" count={pendingSent.length} />
                <div className="space-y-2">
                  {pendingSent.map((request) => {
                    const receiverName = request.receiver_display_name
                      ?? (request.receiver_user_id ? `친구 ${request.receiver_user_id.slice(0, 8)}` : '닉네임 요청')
                    return (
                      <div key={request.id} className="glass-card flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 shadow-sm">
                        <InitialBadge value={receiverName} tone="amber" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-black">{receiverName}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700">
                            <Clock3 size={12} />
                            수락 대기
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => cancelRequest(request.id)}
                          disabled={saving}
                          className="rounded-xl border border-boot-hairline px-3 py-2 text-xs font-bold text-boot-muted disabled:opacity-40"
                        >
                          취소
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </>
        ) : null}
          </div>
        </details>
        </> : !isDevPreview ? <ConversationList /> : <p className="rounded-2xl border border-dashed border-boot-hairline bg-white p-5 text-center text-sm font-bold text-boot-muted">디자인 미리보기에서는 실제 대화를 불러오지 않아요.</p>}
      </div>
    </main>
  )
}

function FriendDirectory({ state, friendScenes, friendSceneState, saving, onRemove }: {
  state: FriendsState
  friendScenes: Map<string, FriendSceneSummary>
  friendSceneState: 'loading' | 'ready' | 'unavailable'
  saving: boolean
  onRemove: (friend: FriendSummary) => Promise<void>
}) {
  return <section id="friend-list" className="mb-5 scroll-mt-4">
    <SectionTitle title="친구 목록" count={state.friends.length} />
    {friendSceneState === 'unavailable' ? <p role="status" className="mb-3 rounded-xl border border-[#E8D9C9] bg-[#FFF9F2] px-3 py-2 text-xs font-bold leading-5 text-[#9A4E30]">친구 출처는 불러오지 못했어요. 친구 목록은 그대로 이용할 수 있어요.</p> : null}
    {state.friends.length === 0 ? <EmptyFriends /> : <div className="space-y-2">
      {state.friends.map((friend) => {
        const scene = friendScenes.get(friend.user_id)
        return <div key={friend.user_id} className="glass-card flex items-center gap-2 rounded-lg border border-boot-hairline bg-white/90 p-2 shadow-sm">
          <Link href={`/friends/${encodeURIComponent(friend.user_id)}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-boot-soft/60">
            <FriendAvatar friend={friend} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black">{friend.display_name ?? `친구 ${friend.user_id.slice(0, 8)}`}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <FriendSceneBadge kind={friendSceneState === 'ready' ? (scene?.kind ?? 'unclassified') : null} evidence={friendSceneState === 'ready' ? (scene?.evidence ?? 'unknown') : null} />
                <span className="text-[11px] text-boot-muted">프로필 · 1:1 대화</span>
              </div>
            </div>
            <ChevronLeft size={17} className="rotate-180 text-boot-muted" />
          </Link>
          <button type="button" onClick={() => void onRemove(friend)} disabled={saving} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-rose-200 text-rose-600 disabled:opacity-40" aria-label={`${friend.display_name ?? '친구'} 연결 숨기기`} title="친구 연결 숨기기"><UserMinus size={17} aria-hidden="true" /></button>
        </div>
      })}
    </div>}
  </section>
}

function FriendAvatar({ friend }: { friend: FriendSummary }) {
  if (!friend.photo_url) return <InitialBadge value={friend.display_name ?? friend.user_id} tone="soft" />
  return <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl border border-boot-hairline bg-white"><Image src={friend.photo_url} alt="" fill sizes="40px" className="object-cover" unoptimized /></span>
}

function MiniStep({ number, label }: { number: string; label: string }) {
  return (
    <div className="rounded-2xl border border-boot-hairline bg-boot-soft/70 px-2 py-3 text-center">
      <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-black text-boot-primary shadow-sm">
        {number}
      </span>
      <span className="mt-2 block text-[10px] font-black text-boot-body">{label}</span>
    </div>
  )
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="mb-2 flex items-center justify-between px-1">
      <h2 className="text-sm font-black">{title}</h2>
      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-bold text-boot-muted">
        {count}개
      </span>
    </div>
  )
}

function InitialBadge({ value, tone }: { value: string; tone: 'primary' | 'soft' | 'amber' }) {
  const classes = {
    primary: 'border-boot-primary/20 bg-boot-soft text-boot-primary',
    soft: 'border-boot-hairline bg-white text-boot-body',
    amber: 'border-amber-300/25 bg-amber-500/10 text-amber-700',
  }

  return (
    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${classes[tone]}`}>
      {value.slice(0, 1).toUpperCase()}
    </div>
  )
}

function EmptyFriends() {
  return (
    <div className="rounded-3xl border border-dashed border-boot-primary/25 bg-white/80 px-4 py-5 text-center">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
        <UserRoundPlus size={20} />
      </div>
      <p className="mt-3 text-sm font-black">아직 등록된 친구가 없어요</p>
      <p className="mt-1 text-xs leading-5 text-boot-muted">
        닉네임으로 친구를 찾아 요청을 보내세요. 상대가 수락하면 프로필에서 바로 약속을 제안할 수 있어요.
      </p>
      <Link
        href="#friend-search"
        className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-boot-primary/25 bg-boot-soft px-4 py-2 text-xs font-bold text-boot-primary"
      >
        닉네임으로 친구 찾기
        <ArrowRight size={14} />
      </Link>
    </div>
  )
}

function translateError(code?: string) {
  switch (code) {
    case 'cannot_send_to_self': return '자기 자신에게는 보낼 수 없어요.'
    case 'receiver_required':   return '닉네임을 입력해주세요.'
    case 'nickname_not_found':  return '그 닉네임의 사용자를 찾지 못했어요.'
    case 'nickname_not_unique': return '같은 닉네임이 여러 명 있어요. 친구에게 닉네임을 바꿔달라고 안내해 주세요.'
    case 'nickname_lookup_unavailable': return '닉네임 검색 DB 적용이 아직 필요해요.'
    case 'not_receiver':        return '본인에게 온 요청만 처리할 수 있어요.'
    case 'not_sender':          return '본인이 보낸 요청만 취소할 수 있어요.'
    case 'request_not_pending': return '이미 처리된 요청이에요.'
    case 'request_expired':     return '만료된 요청이에요.'
    case 'request_not_found':   return '요청을 찾을 수 없어요.'
    case 'friend_pair_retryable': return '상태를 변경 중이에요. 잠시 후 다시 눌러주세요.'
    default:                    return '처리에 실패했어요. 잠시 후 다시 시도해주세요.'
  }
}
