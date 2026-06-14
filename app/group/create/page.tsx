'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, LockKeyhole } from 'lucide-react'
import { DEPOSIT_AMOUNT } from '@/lib/constants'
import { isDevAuthBypassEnabled } from '@/lib/dev-auth'
import QueueRadarCard from '@/components/matching/QueueRadarCard'
import {
  DEV_DEPOSIT_SUMMARY,
  DEV_GROUP_STATE,
  DEV_QUEUE_VISUAL,
  EMPTY_STATE,
  QUEUE_VISUAL_DEFAULT,
} from '@/components/matching/group-create/dev-state'
import { FriendListPanel } from '@/components/matching/group-create/FriendListPanel'
import { FreeBetaQueuePanel } from '@/components/matching/group-create/FreeBetaQueuePanel'
import { GroupDangerZone } from '@/components/matching/group-create/GroupDangerZone'
import { GroupHeader } from '@/components/matching/group-create/GroupHeader'
import { GroupMemberStatusPanel } from '@/components/matching/group-create/GroupMemberStatusPanel'
import { InviteFriendPanel } from '@/components/matching/group-create/InviteFriendPanel'
import { getQueueStatusText } from '@/components/matching/group-create/status'
import type {
  DepositSummary,
  FriendSummary,
  GroupInviteRecord,
  GroupMemberRecord,
  GroupState,
  MyDeposit,
  QueueVisualState,
} from '@/components/matching/group-create/types'

export default function GroupCreatePage() {
  const isDevPreview = isDevAuthBypassEnabled()
  const [state, setState] = useState<GroupState>(EMPTY_STATE)
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myDeposit, setMyDeposit] = useState<MyDeposit | null>(null)
  const [depositSummary, setDepositSummary] = useState<DepositSummary | null>(null)
  const [showTransferPanel, setShowTransferPanel] = useState(false)
  const [queueVisualState, setQueueVisualState] = useState<QueueVisualState>(DEV_QUEUE_VISUAL)

  const group = state.group
  const members = state.members
  const currentUserId = state.current_user_id ?? null
  const pendingInvites = state.invites.filter((invite) => invite.status === 'pending')
  const capacity = group?.size ?? 3
  const openSlots = Math.max(0, capacity - members.length)
  const isLeader = Boolean(group && currentUserId && group.leader_user_id === currentUserId)
  const inQueue = group?.status === 'ready' || group?.status === 'in_pool'
  const groupId = group?.id
  const memberMatchReadyByUserId = useMemo(
    () => new Map(members.map((member) => [member.user_id, isDevPreview || member.match_setup_ready])),
    [isDevPreview, members]
  )
  const readyMemberCount = members.filter((member) => memberMatchReadyByUserId.get(member.user_id)).length
  const needsSetupCount = Math.max(0, members.length - readyMemberCount)
  const canEnterQueue = Boolean(
    group &&
      isLeader &&
      members.length >= 2 &&
      group.status === 'forming' &&
      needsSetupCount === 0
  )
  const canCancelQueue = Boolean(group && isLeader && inQueue)
  const groupStatusLabel = `${Math.min(members.length, group?.size ?? capacity)}/${group?.size ?? capacity} 현재 멤버`

  const groupStats = useMemo(() => [
    { label: groupStatusLabel, value: `${members.length}` },
    { label: '매칭 설정 준비 완료', value: `${readyMemberCount}명` },
    { label: '매칭 설정 입력 필요', value: `${needsSetupCount}명` },
  ], [groupStatusLabel, members.length, readyMemberCount, needsSetupCount])

  useEffect(() => {
    if (!inQueue || !groupId) {
      if (!inQueue) {
        setQueueVisualState(QUEUE_VISUAL_DEFAULT)
      }
      return
    }

    if (isDevPreview) {
      setQueueVisualState({
        ...DEV_QUEUE_VISUAL,
        myGroupSize: members.length,
        myGroupInQueue: true,
      })
      return
    }

    const loadQueueStats = async () => {
      const res = await fetch('/api/match-pool/stats')
      if (!res.ok) return

      const data = await res.json().catch(() => null)
      if (!data || typeof data !== 'object') return

      const male = Number((data as { male?: number }).male)
      const female = Number((data as { female?: number }).female)
      if (!Number.isFinite(male) || !Number.isFinite(female)) return

      setQueueVisualState({
        male: Math.max(0, Math.floor(male)),
        female: Math.max(0, Math.floor(female)),
        myGroupSize: members.length,
        myGroupInQueue: true,
      })
    }

    void loadQueueStats()
  }, [isDevPreview, inQueue, groupId, members.length])

  useEffect(() => {
    ensureGroup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function ensureGroup() {
    setLoading(true)
    setError(null)

    if (isDevPreview) {
      setState(DEV_GROUP_STATE)
      setMyDeposit({ id: 'dev-deposit-1', status: 'paid', amount: DEPOSIT_AMOUNT })
      setDepositSummary(DEV_DEPOSIT_SUMMARY)
      setLoading(false)
      return
    }

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
        setError('그룹을 만들 수 없어요. 기본 프로필을 먼저 완료해 주세요.')
        return
      }

      const data = await res.json() as GroupState
      setState(data)
      if (data.group?.id) {
        await refreshDeposit(data.group.id)
      }
    } catch {
      setError('그룹 정보를 불러오지 못했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function refreshGroup() {
    if (isDevPreview) return

    const res = await fetch('/api/groups')
    if (!res.ok) return
    const data = await res.json() as GroupState
    setState(data)
    if (data.group?.id) {
      await refreshDeposit(data.group.id)
    }
  }

  async function refreshDeposit(groupId: string) {
    if (isDevPreview) return

    try {
      const [own, summary] = await Promise.all([
        fetch(`/api/deposits?group_id=${encodeURIComponent(groupId)}`),
        fetch(`/api/deposits/summary?group_id=${encodeURIComponent(groupId)}`),
      ])
      if (own.ok) {
        const data = await own.json() as { my_deposit: MyDeposit | null }
        setMyDeposit(data.my_deposit)
      }
      if (summary.ok) {
        const data = await summary.json() as DepositSummary
        setDepositSummary(data)
      }
    } catch {
      // ignore
    }
  }

  async function payDeposit() {
    if (!group || saving) return
    if (isDevPreview) {
      setMyDeposit({ id: 'dev-deposit-1', status: 'paid', amount: DEPOSIT_AMOUNT })
      setDepositSummary((current) => current ? { ...current, paid_count: current.total_active, all_paid: true } : DEV_DEPOSIT_SUMMARY)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateDepositError(data.error))
        return
      }
      await refreshDeposit(group.id)
    } catch {
      setError('무료 베타 참여 확인에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  function translateDepositError(code?: string) {
    switch (code) {
      case 'deposit_already_exists': return '이미 무료 베타 참여가 확인됐어요.'
      case 'not_group_member':       return '그룹 멤버만 참여 확인을 할 수 있어요.'
      case 'invalid_amount':         return '참여 확인 값이 올바르지 않아요.'
      default:                        return '무료 베타 참여 확인에 실패했어요. 잠시 후 다시 시도해 주세요.'
    }
  }

  async function inviteByPhone() {
    const clean = phone.trim()
    if (!clean || !group || saving) return

    if (isDevPreview) {
      setState((current) => ({
        ...current,
        invites: [
          ...current.invites,
          {
            id: `dev-invite-${Date.now()}`,
            group_id: group.id,
            invited_phone: clean,
            invited_user_id: null,
            invite_kind: 'phone',
            token: 'dev-preview',
            status: 'pending',
            expires_at: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
            created_at: new Date().toISOString(),
          },
        ],
      }))
      setPhone('')
      return
    }

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

    if (isDevPreview) {
      setState((current) => ({
        ...current,
        invites: current.invites,
        friends: current.friends.map((item) =>
          item.user_id === friend.user_id ? { ...item, group_status: 'in_group' } : item
        ),
        members: current.members.some((item) => item.user_id === friend.user_id)
          ? current.members
          : [
              ...current.members,
              {
                group_id: group.id,
                user_id: friend.user_id,
                display_name: friend.display_name,
                role: 'member',
                joined_at: new Date().toISOString(),
                left_at: null,
                match_setup_ready: true,
              },
            ],
      }))
      return
    }

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

    if (isDevPreview) {
      await navigator.clipboard.writeText(`${window.location.origin}/group/invite/dev-preview`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
      return
    }

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

    if (isDevPreview) {
      setState((current) => ({
        ...current,
        group: current.group ? { ...current.group, status: 'in_pool' } : current.group,
      }))
      return
    }

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

    if (isDevPreview) {
      setState((current) => ({
        ...current,
        group: current.group ? { ...current.group, status: 'forming' } : current.group,
      }))
      return
    }

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
      case 'not_enough_members': return '그룹은 최소 2명 이상이어야 큐에 들어갈 수 있어요.'
      case 'already_in_queue':   return '이미 매칭 큐에 들어가 있어요.'
      case 'not_group_leader':   return '리더만 큐 진입/취소를 할 수 있어요.'
      case 'group_not_open':     return '이미 매칭이 진행 중이거나 마감된 그룹이에요.'
      case 'not_in_queue':       return '이 그룹은 큐에 들어가 있지 않아요.'
      case 'deposit_not_paid':   return '모든 멤버의 무료 베타 참여가 확인되어야 큐에 들어갈 수 있어요.'
      case 'member_match_setup_incomplete':
        return '멤버의 성향 선호/가능 시간/매칭 비중 준비가 모두 완료되어야 큐에 들어갈 수 있어요.'
      case 'member_profile_lookup_failed':
        return '멤버 준비 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
      default:                    return '큐 처리에 실패했어요. 잠시 후 다시 시도해 주세요.'
    }
  }

  async function leaveGroup() {
    if (!group || saving || isLeader) return
    if (!window.confirm('그룹에서 나갈까요?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/groups/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateGroupError(data.error))
        return
      }
      setState(EMPTY_STATE)
      setMyDeposit(null)
      setDepositSummary(null)
      await ensureGroup()
    } catch {
      setError('그룹을 나가지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function disbandGroup() {
    if (!group || saving || !isLeader) return
    if (!window.confirm('그룹을 해체할까요? 모든 멤버가 빠지게 돼요.')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/groups/disband', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateGroupError(data.error))
        return
      }
      setState(EMPTY_STATE)
      setMyDeposit(null)
      setDepositSummary(null)
      await ensureGroup()
    } catch {
      setError('그룹 해체에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  async function transferLeadership(newLeaderUserId: string) {
    if (!group || saving || !isLeader) return
    if (!window.confirm('이 멤버에게 리더를 위임할까요? 위임 이후 본인은 일반 멤버가 돼요.')) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/groups/transfer-leadership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_id: group.id, new_leader_user_id: newLeaderUserId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        setError(translateGroupError(data.error))
        return
      }
      setShowTransferPanel(false)
      await ensureGroup()
    } catch {
      setError('리더 위임에 실패했어요.')
    } finally {
      setSaving(false)
    }
  }

  function translateGroupError(code?: string) {
    switch (code) {
      case 'not_group_leader':   return '리더만 그룹을 해체할 수 있어요.'
      case 'leader_cannot_leave': return '리더는 바로 나갈 수 없어요. 해체하거나 리더 위임을 먼저 해야 해요.'
      case 'not_active_member':  return '이미 이 그룹의 활성 멤버가 아니에요.'
      case 'group_locked':       return '이미 매칭이 진행 중이거나 마감된 그룹이에요.'
      case 'new_leader_required': return '새 리더를 선택해야 해요.'
      case 'new_leader_is_caller': return '본인을 새 리더로 지정할 수 없어요.'
      case 'new_leader_not_member': return '선택한 멤버가 이 그룹의 활성 멤버가 아니에요.'
      default:                    return '처리에 실패했어요. 잠시 후 다시 시도해 주세요.'
    }
  }

  const myDepositPaid = myDeposit?.status === 'paid' || myDeposit?.status === 'held'

  return (
    <main className="min-h-screen px-5 pb-10">
      <div className="relative mx-auto w-full max-w-[calc(100vw-2.5rem)] pt-7 sm:max-w-md">
        <GroupHeader />

        {loading ? (
          <section className="glass rounded-3xl p-5 flex items-center gap-3 text-sm text-boot-muted">
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

            {inQueue ? (
              <QueueRadarCard
                stats={queueVisualState}
                saving={saving}
                canCancel={canCancelQueue}
                onCancel={cancelQueue}
                homeHref="/"
                resultHref="/match"
              />
            ) : (
              <>
            <GroupMemberStatusPanel
              members={members}
              currentUserId={currentUserId}
              capacity={capacity}
              groupStats={groupStats}
              memberMatchReadyByUserId={memberMatchReadyByUserId}
              queueStatusText={getQueueStatusText({ group, membersLength: members.length, needsSetupCount })}
            />

            <InviteFriendPanel
              phone={phone}
              copied={copied}
              saving={saving || !group}
              pendingInvites={pendingInvites}
              onPhoneChange={setPhone}
              onInviteByPhone={inviteByPhone}
              onCopyInviteLink={copyInviteLink}
            />

            <FriendListPanel
              friends={state.friends}
              saving={saving}
              openSlots={openSlots}
              memberMatchReadyByUserId={memberMatchReadyByUserId}
              onInviteFriend={inviteFriend}
            />

            <FreeBetaQueuePanel
              saving={saving}
              canEnterQueue={canEnterQueue}
              isLeader={isLeader}
              membersLength={members.length}
              needsSetupCount={needsSetupCount}
              myDepositPaid={myDepositPaid}
              depositSummary={depositSummary}
              groupStats={groupStats}
              onConfirmParticipation={payDeposit}
              onEnterQueue={enterQueue}
            />
              </>
            )}
          </>
        )}

        {group && !inQueue && (
          <GroupDangerZone
            isLeader={isLeader}
            saving={saving}
            showTransferPanel={showTransferPanel}
            members={members}
            currentUserId={currentUserId}
            onToggleTransferPanel={() => setShowTransferPanel((prev) => !prev)}
            onTransferLeadership={transferLeadership}
            onLeaveGroup={leaveGroup}
            onDisbandGroup={disbandGroup}
          />
        )}

        <Link
          href="/profile/edit"
          className="mt-4 w-full py-3 rounded-2xl text-sm text-boot-muted text-center block hover:text-boot-body transition-colors"
        >
          프로필 다시 확인하기
        </Link>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-boot-muted">
          <LockKeyhole size={13} />
          서로 매칭하기 전까지 사진과 이름은 공개하지 않아요
        </div>
      </div>
    </main>
  )
}


