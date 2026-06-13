import { ChevronRight, Crown, LogOut, Trash2 } from 'lucide-react'

import type { GroupMemberRecord } from './types'

type GroupDangerZoneProps = {
  isLeader: boolean
  saving: boolean
  showTransferPanel: boolean
  members: GroupMemberRecord[]
  currentUserId: string | null
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
  onToggleTransferPanel,
  onTransferLeadership,
  onLeaveGroup,
  onDisbandGroup,
}: GroupDangerZoneProps) {
  const transferableMembers = members.filter((member) => member.user_id !== currentUserId && !member.left_at)

  return (
    <>
      <div className="mt-4 flex gap-2">
        {isLeader ? (
          <>
            {transferableMembers.length > 0 && (
              <button
                type="button"
                onClick={onToggleTransferPanel}
                disabled={saving}
                className="flex-1 py-3 rounded-2xl text-xs text-amber-700/80 border border-amber-300/15 hover:border-amber-300/30 hover:bg-amber-500/5 flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Crown size={13} />
                리더 위임
              </button>
            )}
            <button
              type="button"
              onClick={onDisbandGroup}
              disabled={saving}
              className="flex-1 py-3 rounded-2xl text-xs text-red-300/80 border border-red-400/15 hover:border-red-400/30 hover:bg-red-500/5 flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Trash2 size={13} />
              그룹 해체
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onLeaveGroup}
            disabled={saving}
            className="flex-1 py-3 rounded-2xl text-xs text-boot-muted border border-boot-hairline hover:border-boot-hairline flex items-center justify-center gap-1.5 disabled:opacity-40"
          >
            <LogOut size={13} />
            그룹 나가기
          </button>
        )}
      </div>

      {showTransferPanel && isLeader && (
        <section className="glass-card mt-3 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-700 mb-2">새 리더를 선택해주세요</p>
          <p className="text-[11px] text-boot-muted mb-3">
            위임 이후 본인은 일반 멤버로 전환돼요. 다음부터는 그룹 나가기도 가능해요.
          </p>
          <div className="flex flex-col gap-1.5">
            {transferableMembers.map((member) => (
              <button
                key={member.user_id}
                type="button"
                onClick={() => onTransferLeadership(member.user_id)}
                disabled={saving}
                className="flex items-center justify-between gap-2 rounded-xl border border-boot-hairline px-3 py-2.5 text-sm hover:border-amber-300/30 hover:bg-amber-500/5 disabled:opacity-40"
              >
                <span className="text-boot-ink">{member.display_name ?? '사용자'}</span>
                <ChevronRight size={14} className="text-boot-muted" />
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
