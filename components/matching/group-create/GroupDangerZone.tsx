import { AlertTriangle, ChevronRight, Crown, LogOut, Trash2 } from 'lucide-react'

import { getGroupExitActionState } from './status'
import type { GroupMemberRecord, GroupStatus } from './types'

type GroupDangerZoneProps = {
  isLeader: boolean
  saving: boolean
  showTransferPanel: boolean
  members: GroupMemberRecord[]
  currentUserId: string | null
  groupStatus: GroupStatus
  capacity: number
  onToggleTransferPanel: () => void
  onTransferLeadership: (userId: string) => void
  onLeaveGroup: () => void
  onDisbandGroup: () => void
}

export function GroupDangerZone({
  isLeader,
  saving,
  showTransferPanel,
  members,
  currentUserId,
  groupStatus,
  capacity,
  onToggleTransferPanel,
  onTransferLeadership,
  onLeaveGroup,
  onDisbandGroup,
}: GroupDangerZoneProps) {
  const transferableMembers = members.filter((member) => member.user_id !== currentUserId && !member.left_at)
  const exitState = getGroupExitActionState({
    isLeader,
    groupStatus,
    activeMemberCount: members.length,
    capacity,
    transferableMemberCount: transferableMembers.length,
  })
  const canLeave = exitState.kind === 'member_can_leave'
  const canTransfer = exitState.kind === 'leader_needs_transfer'
  const canDisband = exitState.kind === 'leader_needs_transfer' || exitState.kind === 'leader_can_disband'
  const locked = exitState.kind === 'locked'

  return (
    <section className="mt-5 rounded-3xl border border-boot-hairline bg-white/85 p-4 shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-boot-soft text-boot-primary">
          {locked ? <AlertTriangle size={18} /> : isLeader ? <Crown size={18} /> : <LogOut size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-boot-primary">
            Group control
          </p>
          <h2 className="mt-1 text-sm font-black text-boot-ink">{exitState.title}</h2>
          <p className="mt-1 text-xs leading-5 text-boot-muted">{exitState.description}</p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {canLeave && (
          <button
            type="button"
            onClick={onLeaveGroup}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-300/35 bg-red-50 px-4 py-3 text-xs font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
          >
            <LogOut size={14} />
            {exitState.primaryLabel}
          </button>
        )}

        {canTransfer && (
          <button
            type="button"
            onClick={onToggleTransferPanel}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-300/45 bg-amber-50 px-4 py-3 text-xs font-black text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
          >
            <Crown size={14} />
            {exitState.primaryLabel}
          </button>
        )}

        {canDisband && (
          <button
            type="button"
            onClick={onDisbandGroup}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-300/35 bg-white px-4 py-3 text-xs font-black text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40"
          >
            <Trash2 size={14} />
            그룹 해체
          </button>
        )}

        {locked && (
          <button
            type="button"
            disabled
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-boot-hairline bg-boot-soft px-4 py-3 text-xs font-black text-boot-muted"
          >
            {exitState.primaryLabel}
          </button>
        )}
      </div>

      <p className="mt-2 text-[11px] leading-4 text-boot-muted">{exitState.helperText}</p>
      {isLeader && !locked && (
        <p className="mt-1 text-[11px] leading-4 text-boot-muted">
          특정 친구만 빼야 하면 위의 멤버 카드에서 <span className="font-black text-red-500">내보내기</span>를 누르면 돼요.
        </p>
      )}

      {showTransferPanel && canTransfer && (
        <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
          <p className="text-xs font-black text-amber-800">새 리더를 선택해주세요</p>
          <p className="mt-1 text-[11px] leading-4 text-amber-700">
            위임 후에는 선택한 친구가 초대와 매칭 큐 진입을 관리합니다.
          </p>
          <div className="mt-3 flex flex-col gap-1.5">
            {transferableMembers.map((member) => (
              <button
                key={member.user_id}
                type="button"
                onClick={() => onTransferLeadership(member.user_id)}
                disabled={saving}
                className="flex items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm transition-colors hover:bg-amber-50 disabled:opacity-40"
              >
                <span className="text-boot-ink">{member.display_name ?? '친구'}</span>
                <ChevronRight size={14} className="text-boot-muted" />
              </button>
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
