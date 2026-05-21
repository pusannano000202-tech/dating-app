'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Link as LinkIcon,
  Loader2,
  LockKeyhole,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'

type GroupStatus = 'forming' | 'ready' | 'in_pool' | 'matched' | 'completed' | 'disbanded'
type GroupRole = 'leader' | 'member'
type FriendGroupStatus = 'available' | 'invited' | 'in_group'

interface GroupRecord {
  id: string
  leader_user_id: string
  name: string | null
  size: number
  gender: 'male' | 'female'
  status: GroupStatus
}

interface GroupMemberRecord {
  group_id: string
  user_id: string
  display_name: string | null
  role: GroupRole
  joined_at: string
  left_at: string | null
}

interface GroupInviteRecord {
  id: string
  group_id: string
  invited_phone: string | null
  invited_user_id: string | null
  invite_kind: 'user' | 'phone' | 'link'
  token: string
  status: string
  expires_at: string
  created_at: string
}

interface FriendSummary {
  user_id: string
  display_name: string
  phone: string | null
  status: 'active'
  group_status: FriendGroupStatus
}

interface GroupState {
  group: GroupRecord | null
  members: GroupMemberRecord[]
  invites: GroupInviteRecord[]
  friends: FriendSummary[]
  current_user_id?: string
}

const EMPTY_STATE: GroupState = {
  group: null,
  members: [],
  invites: [],
  friends: [],
}

export default function GroupCreatePage() {
  const [state, setState] = useState<GroupState>(EMPTY_STATE)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const group = state.group
  const members = state.members
  const currentUserId = state.current_user_id ?? null
  const pendingInvites = state.invites.filter((invite) => invite.status === 'pending')
  const capacity = group?.size ?? 3
  const openSlots = Math.max(0, capacity - members.length)
  const isLeader = Boolean(group && currentUserId && group.leader_user_id === currentUserId)
  const inQueue = group?.status === 'ready' || group?.status === 'in_pool'
  const canEnterQueue = Boolean(group && isLeader && members.length >= 2 && group.status === 'forming')
  const canCancelQueue = Boolean(group && isLeader && inQueue)

  const groupStats = useMemo(() => [
    { label: '현재 멤버', value: `${members.length}/${capacity}` },
    { label: '대기 초대', value: `${pendingInvites.length}` },
    { label: '남은 자리', value: `${openSlots}` },
  ], [capacity, members.length, openSlots, pendingInvites.length])

  useEffect(() => {
    ensureGroup()
  }, [])

  async function ensureGroup() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: 3 }),
      })

      if (res.status === 401) {
        setError('로그인이 필요해요.')
        return
      }

      if (!res.ok) {
        setError('그룹을 만들 수 없어요. 기본 프로필을 먼저 완료해줘.')
        return
      }

      const data = await res.json() as GroupState
      setState(data)
    } catch {
      setError('그룹 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshGroup() {
    const res = await fetch('/api/groups')
    if (!res.ok) return
    const data = await res.json() as GroupState
    setState(data)
  }

  async function inviteByPhone() {
    const clean = phone.trim()
    if (!clean || !group || saving) return
    setSaving(true)
    setError(null)

    try {
      await createInvite({ invited_phone: clean })
      setPhone('')
      await refreshGroup()
    } catch {
      setError('초대를 만들지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function inviteFriend(friend: FriendSummary) {
    if (!group || saving || friend.group_status !== 'available') return
    setSaving(true)
    setError(null)

    try {
      await createInvite({ invited_user_id: friend.user_id })
      await refreshGroup()
    } catch {
      setError('친구 초대에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function copyInviteLink() {
    if (!group || saving) return
    setSaving(true)
    setError(null)

    try {
      const invite = await createInvite({ kind: 'link' })
      const link = `${window.location.origin}/group/invite/${invite.token}`
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      await refreshGroup()
    } catch {
      setError('초대 링크를 만들지 못했어요.')
      setCopied(false)
    } finally {
      setSaving(false)
    }
  }

  async function createInvite(payload: Record<string, string>) {
    if (!group) throw new Error('group_required')

    const res = await fetch('/api/group-invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: group.id,
        ...payload,
      }),
    })

    if (!res.ok) {
      throw new Error('invite_failed')
    }

    const data = await res.json() as { invite: GroupInviteRecord }
    return data.invite
  }

  async function enterQueue() {
    if (!group || saving || !canEnterQueue) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/match-pool/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateQueueError(data.error))
        return
      }
      await refreshGroup()
    } catch {
      setError('큐 진입에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function cancelQueue() {
    if (!group || saving || !canCancelQueue) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/match-pool/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateQueueError(data.error))
        return
      }
      await refreshGroup()
    } catch {
      setError('큐 취소에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  function translateQueueError(code?: string) {
    switch (code) {
      case 'not_enough_members': return '그룹에 최소 2명 이상이 있어야 큐에 들어갈 수 있어요.'
      case 'already_in_queue':   return '이미 매칭 큐에 들어가 있어요.'
      case 'not_group_leader':   return '리더만 큐 진입/취소를 할 수 있어요.'
      case 'group_not_open':     return '이미 매칭이 진행 중이거나 마감된 그룹이에요.'
      case 'not_in_queue':       return '이 그룹은 큐에 들어가 있지 않아요.'
      default:                    return '큐 처리에 실패했어요. 잠시 후 다시 시도해줘.'
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="relative max-w-md mx-auto pt-7">
        <header className="mb-6">
          <p className="text-xs font-bold text-violet-300 tracking-[0.24em] uppercase">Group Match</p>
          <h1 className="mt-2 text-2xl font-black">친구와 같이 매칭받기</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            2명 이상 모이면 이번 주 매칭 큐에 들어갈 수 있어요.
          </p>
        </header>

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin" />
            그룹 정보를 준비하는 중
          </section>
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            )}

            <section className="glass-card rounded-3xl p-5 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-gray-500">우리 그룹</p>
                  <h2 className="mt-1 text-xl font-black">{members.length}/{capacity}명</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    {canEnterQueue ? '매칭 큐 진입 준비 완료' : '친구 1명이 더 필요해요'}
                  </p>
                </div>
                <div className="h-12 w-12 rounded-2xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center">
                  <Users size={22} className="text-violet-200" />
                </div>
              </div>

              <p className="mt-5 mb-2 text-xs font-bold text-gray-500">그룹 멤버</p>
              <div className="grid grid-cols-3 gap-2">
                {members.map((member) => {
                  const isSelf = currentUserId != null && member.user_id === currentUserId
                  const name = isSelf
                    ? '나'
                    : member.display_name ?? `친구 ${member.user_id.slice(0, 4)}`
                  return (
                    <div
                      key={member.user_id}
                      className="min-h-[86px] rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center"
                    >
                      <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                        {member.role === 'leader' ? <ShieldCheck size={16} /> : <Check size={16} />}
                      </div>
                      <p className="text-sm font-bold truncate">{name}</p>
                      <p className="mt-0.5 text-[10px] text-gray-600">
                        {member.role === 'leader' ? '리더' : '참여중'}
                      </p>
                    </div>
                  )
                })}
                {Array.from({ length: openSlots }).map((_, index) => (
                  <div
                    key={`open-${index}`}
                    className="min-h-[86px] rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-2 py-3 text-center flex flex-col items-center justify-center"
                  >
                    <UserPlus size={17} className="text-gray-600" />
                    <p className="mt-2 text-[11px] text-gray-600">친구 자리</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="glass rounded-3xl p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-black">초대하기</h2>
                  <p className="text-xs text-gray-600 mt-0.5">전화번호 또는 링크로 그룹 초대를 보내요.</p>
                </div>
                <UserPlus size={18} className="text-violet-300" />
              </div>

              <div className="flex gap-2">
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="010-0000-0000"
                  className="flex-1 min-w-0 glass rounded-2xl px-4 py-3 text-sm text-white placeholder-gray-600 border border-white/10 focus:outline-none focus:border-violet-500"
                />
                <button
                  type="button"
                  onClick={inviteByPhone}
                  disabled={saving || !group || !phone.trim()}
                  className="h-12 w-12 rounded-2xl btn-gradient flex items-center justify-center disabled:opacity-40"
                  aria-label="전화번호 초대 보내기"
                >
                  <Send size={17} />
                </button>
              </div>

              <button
                type="button"
                onClick={copyInviteLink}
                disabled={saving || !group}
                className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center justify-between text-sm disabled:opacity-40"
              >
                <span className="flex items-center gap-2 text-gray-300">
                  <LinkIcon size={16} className="text-violet-300" />
                  초대 링크 복사
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  {copied ? '복사됨' : '공유'}
                  <Copy size={14} />
                </span>
              </button>

              {pendingInvites.length > 0 && (
                <div className="mt-3 space-y-2">
                  {pendingInvites.map((invite) => (
                    <div key={invite.id} className="rounded-2xl bg-white/[0.03] px-3 py-2 flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-xs text-gray-400">
                        {invite.invite_kind === 'link'
                          ? '공개 초대 링크'
                          : invite.invited_user_id
                            ? `친구 ${invite.invited_user_id.slice(0, 8)}`
                            : invite.invited_phone ?? '대상 없음'}
                      </span>
                      <span className="text-[10px] font-bold text-amber-300">수락 대기</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mb-5">
              <div className="flex items-center justify-between px-1 mb-2">
                <h2 className="text-sm font-black">친구 목록</h2>
                <span className="text-xs text-gray-600">{state.friends.length}명</span>
              </div>

              {state.friends.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-5">
                  <p className="text-sm text-gray-500 leading-relaxed">
                    아직 등록된 친구가 없어요. 친구를 먼저 추가해야 그룹을 꾸릴 수 있어요.
                  </p>
                  <Link
                    href="/friends"
                    className="mt-3 inline-block px-4 py-2 rounded-xl text-xs font-bold border border-violet-400/30 bg-violet-400/10 text-violet-200"
                  >
                    친구 추가하러 가기 →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {state.friends.map((friend) => {
                    const isInvited = friend.group_status === 'invited'
                    const isInGroup = friend.group_status === 'in_group'
                    const isDisabled = saving || isInvited || isInGroup || openSlots === 0

                    return (
                      <div key={friend.user_id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-white/[0.08] flex items-center justify-center text-sm font-black">
                          {friend.display_name.slice(0, 1)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{friend.display_name}</p>
                          <p className="text-xs text-gray-600 truncate">{friend.phone ?? friend.user_id}</p>
                        </div>
                        <button
                          type="button"
                          disabled={isDisabled}
                          onClick={() => inviteFriend(friend)}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-45 ${
                            isInGroup
                              ? 'border-emerald-400/20 text-emerald-300 bg-emerald-400/10'
                              : isInvited
                                ? 'border-amber-400/20 text-amber-300 bg-amber-400/10'
                                : 'border-violet-400/20 text-violet-200 bg-violet-400/10 hover:bg-violet-400/15'
                          }`}
                        >
                          {isInGroup ? '참여중' : isInvited ? '초대중' : '초대'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            <section className="glass rounded-3xl p-4 mb-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center">
                  <CalendarClock size={18} className="text-rose-200" />
                </div>
                <div>
                  <h2 className="text-sm font-black">이번 주 매칭 큐</h2>
                  <p className="text-xs text-gray-600">그룹이 완성되면 보증금 결제 후 큐에 들어가요.</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {groupStats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/[0.035] px-3 py-3">
                    <p className="text-lg font-black">{stat.value}</p>
                    <p className="mt-1 text-[10px] leading-snug text-gray-600">{stat.label}</p>
                  </div>
                ))}
              </div>
            </section>

            {inQueue ? (
              <>
                <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 mb-3 text-center">
                  <p className="text-xs font-bold text-violet-200">매칭 큐 진입 완료</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    토요일 14:00 매칭 결과를 기다려주세요.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={saving || !canCancelQueue}
                  onClick={cancelQueue}
                  className="w-full py-3 rounded-2xl text-sm text-gray-300 border border-white/15 hover:border-white/25 transition-colors disabled:opacity-40"
                >
                  큐에서 빠지기
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={saving || !canEnterQueue}
                  onClick={enterQueue}
                  className="btn-gradient w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CreditCard size={17} />
                  이번 주 매칭 큐에 들어가기
                </button>

                {!canEnterQueue && (
                  <p className="mt-3 text-center text-xs text-gray-600">
                    {members.length < 2
                      ? '친구 1명이 그룹에 참여하면 큐 진입 단계로 넘어갈 수 있어요.'
                      : !isLeader
                        ? '리더만 큐 진입을 시작할 수 있어요.'
                        : '큐 진입 조건을 만족하면 버튼이 활성화돼요.'}
                  </p>
                )}
                <p className="mt-2 text-center text-[10px] text-gray-700">
                  보증금 결제는 곧 연결돼요. 지금은 미리 큐에만 들어가요.
                </p>
              </>
            )}
          </>
        )}

        <Link
          href="/profile/edit"
          className="mt-4 w-full py-3 rounded-2xl text-sm text-gray-500 text-center block hover:text-gray-300 transition-colors"
        >
          프로필 다시 확인하기
        </Link>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-700">
          <LockKeyhole size={13} />
          서로 매칭되기 전까지 사진과 이름은 공개하지 않아요.
        </div>
      </div>
    </main>
  )
}
