'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Link as LinkIcon,
  LockKeyhole,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import type { FriendSummary } from '@/lib/types'

type GroupSlot = {
  id: string
  name: string
  role: 'leader' | 'member'
}

type PendingRequest = {
  id: string
  phone: string
  status: 'pending'
}

const INITIAL_FRIENDS: FriendSummary[] = [
  { user_id: 'friend-1', display_name: '민지', phone: '010-24**-51**', status: 'active', group_status: 'available' },
  { user_id: 'friend-2', display_name: '서연', phone: '010-71**-08**', status: 'active', group_status: 'available' },
  { user_id: 'friend-3', display_name: '지훈', phone: '010-92**-33**', status: 'active', group_status: 'invited' },
]

const WEEKLY_QUEUE_STATS = [
  { label: '이번 주 대기 그룹', value: '12팀' },
  { label: '같은 인원수 후보', value: '5팀' },
  { label: '시간대 겹침 후보', value: '3팀' },
]

export default function GroupCreatePage() {
  const [phone, setPhone] = useState('')
  const [requests, setRequests] = useState<PendingRequest[]>([])
  const [friends, setFriends] = useState<FriendSummary[]>(INITIAL_FRIENDS)
  const [groupMembers, setGroupMembers] = useState<GroupSlot[]>([
    { id: 'me', name: '나', role: 'leader' },
  ])
  const [copied, setCopied] = useState(false)

  const groupSize = groupMembers.length
  const canEnterQueue = groupSize >= 2
  const openSlots = Math.max(0, 3 - groupSize)

  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return 'https://destiny.example/group/invite/demo'
    return `${window.location.origin}/group/invite/demo`
  }, [])

  function addFriendRequest() {
    const clean = phone.trim()
    if (!clean) return
    setRequests((prev) => [
      { id: `request-${Date.now()}`, phone: clean, status: 'pending' },
      ...prev,
    ])
    setPhone('')
  }

  function inviteFriend(friend: FriendSummary) {
    if (groupMembers.length >= 3) return
    if (groupMembers.some((member) => member.id === friend.user_id)) return
    setGroupMembers((prev) => [
      ...prev,
      { id: friend.user_id, name: friend.display_name, role: 'member' },
    ])
    setFriends((prev) => prev.map((item) => (
      item.user_id === friend.user_id ? { ...item, group_status: 'in_group' } : item
    )))
  }

  function removeFriend(friendId: string) {
    if (friendId === 'me') return
    setGroupMembers((prev) => prev.filter((member) => member.id !== friendId))
    setFriends((prev) => prev.map((item) => (
      item.user_id === friendId ? { ...item, group_status: 'available' } : item
    )))
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-18%] left-[-25%] w-[420px] h-[420px] rounded-full bg-violet-700/20 blur-[120px]" />
        <div className="absolute bottom-[-18%] right-[-18%] w-[360px] h-[360px] rounded-full bg-rose-700/14 blur-[110px]" />
      </div>

      <div className="relative max-w-md mx-auto pt-7">
        <header className="mb-6">
          <p className="text-xs font-bold text-violet-300 tracking-[0.28em] uppercase">Group Match</p>
          <h1 className="mt-2 text-2xl font-black">친구랑 같이 매칭받기</h1>
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            먼저 친구를 추가하고, 같이 나갈 멤버를 골라 우리 그룹을 완성해줘.
          </p>
        </header>

        <section className="glass-card rounded-3xl p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">우리 그룹</p>
              <h2 className="mt-1 text-xl font-black">{groupSize}/3명</h2>
              <p className="mt-1 text-xs text-gray-500">
                {canEnterQueue ? '2:2 매칭 준비 가능' : '친구 1명이 더 필요해'}
              </p>
            </div>
            <div className="h-12 w-12 rounded-2xl bg-violet-500/15 border border-violet-400/20 flex items-center justify-center">
              <Users size={22} className="text-violet-200" />
            </div>
          </div>

          <p className="mt-5 mb-2 text-xs font-bold text-gray-500">그룹 멤버</p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {groupMembers.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => removeFriend(member.id)}
                className="min-h-[86px] rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3 text-center"
              >
                <div className="mx-auto mb-2 h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                  {member.role === 'leader' ? <ShieldCheck size={16} /> : <Check size={16} />}
                </div>
                <p className="text-sm font-bold truncate">{member.name}</p>
                <p className="mt-0.5 text-[10px] text-gray-600">
                  {member.role === 'leader' ? '리더' : '참여중'}
                </p>
              </button>
            ))}
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
              <h2 className="text-sm font-black">친구 추가</h2>
              <p className="text-xs text-gray-600 mt-0.5">전화번호나 초대 링크로 먼저 친구가 돼.</p>
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
              onClick={addFriendRequest}
              className="h-12 w-12 rounded-2xl btn-gradient flex items-center justify-center"
              aria-label="친구 요청 보내기"
            >
              <Send size={17} />
            </button>
          </div>

          <button
            type="button"
            onClick={copyInviteLink}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 flex items-center justify-between text-sm"
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

          {requests.length > 0 && (
            <div className="mt-3 space-y-2">
              {requests.map((request) => (
                <div key={request.id} className="rounded-2xl bg-white/[0.03] px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">{request.phone}</span>
                  <span className="text-[10px] font-bold text-amber-300">친구 요청 대기</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mb-5">
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-sm font-black">친구 목록</h2>
            <span className="text-xs text-gray-600">{friends.length}명</span>
          </div>
          <div className="space-y-2">
            {friends.map((friend) => {
              const isInvited = friend.group_status === 'invited'
              const isInGroup = friend.group_status === 'in_group'
              const isDisabled = isInvited || isInGroup || groupMembers.length >= 3

              return (
                <div key={friend.user_id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-white/[0.08] flex items-center justify-center text-sm font-black">
                    {friend.display_name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{friend.display_name}</p>
                    <p className="text-xs text-gray-600">{friend.phone}</p>
                  </div>
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => inviteFriend(friend)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      isInGroup
                        ? 'border-emerald-400/20 text-emerald-300 bg-emerald-400/10'
                        : isInvited
                          ? 'border-amber-400/20 text-amber-300 bg-amber-400/10'
                          : 'border-violet-400/20 text-violet-200 bg-violet-400/10 hover:bg-violet-400/15'
                    }`}
                  >
                    {isInGroup ? '참여중' : isInvited ? '초대중' : '그룹 초대'}
                  </button>
                </div>
              )
            })}
          </div>
        </section>

        <section className="glass rounded-3xl p-4 mb-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-rose-500/10 border border-rose-400/20 flex items-center justify-center">
              <CalendarClock size={18} className="text-rose-200" />
            </div>
            <div>
              <h2 className="text-sm font-black">이번 주 매칭 큐</h2>
              <p className="text-xs text-gray-600">토요일 14:00에 조건 맞는 그룹끼리 배치돼.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {WEEKLY_QUEUE_STATS.map((stat) => (
              <div key={stat.label} className="rounded-2xl bg-white/[0.035] px-3 py-3">
                <p className="text-lg font-black">{stat.value}</p>
                <p className="mt-1 text-[10px] leading-snug text-gray-600">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <button
          type="button"
          disabled={!canEnterQueue}
          className="btn-gradient w-full py-4 rounded-2xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <CreditCard size={17} />
          보증금 결제하고 이번 주 매칭 큐에 들어가기
        </button>

        {!canEnterQueue && (
          <p className="mt-3 text-center text-xs text-gray-600">
            친구 1명이 그룹에 들어오면 보증금 결제 단계로 넘어갈 수 있어.
          </p>
        )}

        <Link
          href="/profile/edit"
          className="mt-4 w-full py-3 rounded-2xl text-sm text-gray-500 text-center block hover:text-gray-300 transition-colors"
        >
          프로필 다시 확인하기
        </Link>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-gray-700">
          <LockKeyhole size={13} />
          상대 그룹의 사진과 이름은 만남 전까지 공개되지 않아.
        </div>
      </div>
    </main>
  )
}
