'use client'

import Link from 'next/link'
import { Check, Copy, Loader2, RefreshCw, UserRoundPlus, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { isMatchingGroupsPayload } from '@/lib/matching/frontend-load-state'
import type { FriendSummary, GroupState } from '@/components/matching/group-create/types'

type SetupState = 'loading' | 'ready' | 'auth_required' | 'error'

export default function QuantumFriendPartySetup({
  onReady,
}: {
  onReady: (groupId: string) => void
}) {
  const [state, setState] = useState<GroupState | null>(null)
  const [setupState, setSetupState] = useState<SetupState>('loading')
  const [targetSize, setTargetSize] = useState<2 | 3>(2)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [lastInviteUrl, setLastInviteUrl] = useState('')

  const loadGroup = useCallback(async () => {
    try {
      const response = await fetch('/api/groups', { cache: 'no-store' })
      if (response.status === 401) {
        setSetupState('auth_required')
        return
      }
      const payload = await response.json().catch(() => ({})) as unknown
      if (!response.ok || !isMatchingGroupsPayload(payload)) {
        setSetupState('error')
        return
      }
      setState(payload as GroupState)
      setSetupState('ready')
    } catch {
      setSetupState('error')
    }
  }, [])

  useEffect(() => {
    void loadGroup()
  }, [loadGroup])

  useEffect(() => {
    if (!state?.group || state.members.length >= 2) return
    const timer = window.setInterval(() => void loadGroup(), 3500)
    return () => window.clearInterval(timer)
  }, [loadGroup, state?.group, state?.members.length])

  const readyGroupId = state?.group && state.members.length >= 2
    && ['forming', 'ready'].includes(state.group.status)
    ? state.group.id
    : null

  useEffect(() => {
    if (readyGroupId) onReady(readyGroupId)
  }, [onReady, readyGroupId])

  const availableFriends = useMemo(
    () => state?.friends.filter((friend) => friend.group_status !== 'in_group') ?? [],
    [state?.friends],
  )

  async function createGroup() {
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ size: targetSize, name: 'Quantum 친구 참여팀' }),
      })
      const payload = await response.json().catch(() => ({})) as unknown
      if (!response.ok || !isMatchingGroupsPayload(payload)) {
        setNotice('친구 참여팀을 만들지 못했어요. 프로필 성별과 기존 그룹 상태를 확인해 주세요.')
        return
      }
      setState(payload as GroupState)
      setSetupState('ready')
      setNotice('팀을 만들었어요. 같이 갈 친구를 초대해 주세요.')
    } catch {
      setNotice('친구 참여팀을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function inviteFriend(friend: FriendSummary) {
    if (!state?.group || busy || friend.group_status !== 'available') return
    setBusy(true)
    setNotice('')
    try {
      const response = await fetch('/api/group-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: state.group.id,
          invited_user_id: friend.user_id,
        }),
      })
      const payload = await response.json().catch(() => ({})) as {
        invite?: { token?: string }
        error?: string
      }
      if (!response.ok || !payload.invite?.token) {
        setNotice('친구 초대를 보내지 못했어요. 이미 다른 그룹에 참여 중인지 확인해 주세요.')
        return
      }
      const inviteUrl = `${window.location.origin}/group/invite/${payload.invite.token}`
      setLastInviteUrl(inviteUrl)
      await navigator.clipboard.writeText(inviteUrl).catch(() => undefined)
      setNotice(`${friend.display_name}님 초대 링크를 만들고 복사했어요. 바로 보내서 수락받아 주세요.`)
      await loadGroup()
    } catch {
      setNotice('친구 초대를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }

  async function copyInviteAgain() {
    if (!lastInviteUrl) return
    await navigator.clipboard.writeText(lastInviteUrl).catch(() => undefined)
    setNotice('초대 링크를 다시 복사했어요.')
  }

  if (setupState === 'loading') {
    return <Status icon={<Loader2 size={18} className="animate-spin" />} text="친구 참여 상태를 확인하고 있어요." />
  }
  if (setupState === 'auth_required') {
    return <Link href="/login?redirect=%2Fmatch" className="flex min-h-12 items-center justify-center rounded-lg bg-boot-primary px-4 text-sm font-black text-white">로그인하고 친구 초대</Link>
  }
  if (setupState === 'error') {
    return (
      <button type="button" onClick={() => void loadGroup()} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-boot-hairline bg-white px-4 text-sm font-black text-boot-primary">
        <RefreshCw size={17} /> 친구 상태 다시 확인
      </button>
    )
  }

  if (!state?.group) {
    return (
      <section className="rounded-lg border border-boot-hairline bg-white p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-boot-soft text-boot-primary"><UsersRound size={20} /></span>
          <div>
            <h3 className="text-base font-black">같이 갈 친구 자리를 정해요</h3>
            <p className="mt-1 text-xs font-bold leading-5 text-boot-muted">같은 성별 친구를 1명 또는 2명 초대할 수 있어요. 실제 수락 후에만 신청됩니다.</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="친구 참여 인원">
          {[2, 3].map((size) => (
            <button key={size} type="button" aria-pressed={targetSize === size} onClick={() => setTargetSize(size as 2 | 3)} className={`min-h-11 rounded-lg border px-3 text-sm font-black ${targetSize === size ? 'border-boot-primary bg-boot-soft text-boot-primary' : 'border-boot-hairline bg-white text-boot-muted'}`}>
              나 포함 {size}명
            </button>
          ))}
        </div>
        <button type="button" disabled={busy} onClick={() => void createGroup()} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-boot-primary px-4 text-sm font-black text-white disabled:opacity-50">
          {busy ? <Loader2 size={18} className="animate-spin" /> : <UserRoundPlus size={18} />} 친구 초대 시작
        </button>
        {notice ? <p className="mt-3 text-xs font-bold leading-5 text-boot-coral" role="status">{notice}</p> : null}
      </section>
    )
  }

  const acceptedCount = state.members.length
  const pendingCount = state.invites.filter((invite) => invite.status === 'pending').length
  const locked = !['forming', 'ready'].includes(state.group.status)

  return (
    <section className="rounded-lg border border-boot-hairline bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-boot-primary">친구 참여팀</p>
          <h3 className="mt-1 text-base font-black">수락 {acceptedCount}/{state.group.size}명</h3>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${readyGroupId ? 'bg-[#DDF8EF] text-[#147A70]' : 'bg-boot-soft text-boot-muted'}`}>
          {readyGroupId ? <Check size={20} strokeWidth={3} /> : <UsersRound size={20} />}
        </span>
      </div>

      {readyGroupId ? (
        <p className="mt-3 rounded-lg bg-[#EAF7F5] px-3 py-3 text-sm font-black text-[#115F57]">수락한 친구와 한 팀으로 접수할 준비가 됐어요.</p>
      ) : locked ? (
        <p className="mt-3 text-xs font-bold leading-5 text-boot-coral">이 그룹은 이미 기존 매칭에 들어가 있어 새 활동에 사용할 수 없어요.</p>
      ) : (
        <p className="mt-3 text-xs font-bold leading-5 text-boot-muted">친구 수락을 기다리는 중이에요. 이 화면은 자동으로 새로 확인합니다.{pendingCount > 0 ? ` · 수락 대기 ${pendingCount}명` : ''}</p>
      )}

      {!readyGroupId && !locked ? (
        <div className="mt-4 space-y-2">
          {availableFriends.length === 0 ? (
            <div className="rounded-lg border border-dashed border-boot-hairline px-3 py-4 text-center">
              <p className="text-xs font-bold text-boot-muted">초대할 친구가 아직 없어요.</p>
              <Link href="/friends" className="mt-2 inline-flex min-h-11 items-center text-sm font-black text-boot-primary">친구 먼저 추가하기</Link>
            </div>
          ) : availableFriends.map((friend) => (
            <div key={friend.user_id} className="flex min-h-14 items-center gap-3 border-b border-boot-hairline py-2 last:border-b-0">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-boot-soft text-sm font-black text-boot-primary">{friend.display_name.slice(0, 1)}</span>
              <p className="min-w-0 flex-1 truncate text-sm font-black">{friend.display_name}</p>
              <button type="button" disabled={busy || friend.group_status !== 'available'} onClick={() => void inviteFriend(friend)} className="min-h-11 shrink-0 rounded-lg border border-boot-primary px-3 text-xs font-black text-boot-primary disabled:border-boot-hairline disabled:text-boot-muted">
                {friend.group_status === 'invited' ? '수락 대기' : '초대'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {lastInviteUrl ? (
        <button type="button" onClick={() => void copyInviteAgain()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-boot-hairline text-xs font-black text-boot-primary"><Copy size={15} /> 초대 링크 다시 복사</button>
      ) : null}
      {notice ? <p className="mt-3 text-xs font-bold leading-5 text-boot-coral" role="status">{notice}</p> : null}
      <button type="button" onClick={() => void loadGroup()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-xs font-black text-boot-muted"><RefreshCw size={15} /> 지금 수락 상태 확인</button>
    </section>
  )
}

function Status({ icon, text }: { icon: ReactNode; text: string }) {
  return <div className="flex min-h-20 items-center gap-3 rounded-lg border border-boot-hairline bg-white px-4 text-sm font-bold text-boot-muted">{icon}{text}</div>
}
