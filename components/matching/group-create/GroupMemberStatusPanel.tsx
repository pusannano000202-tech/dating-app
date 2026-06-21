import { Check, ShieldCheck, UserPlus, Users } from 'lucide-react'

import { getMemberStatusLabel } from './status'
import type { GroupMemberRecord } from './types'

type GroupMemberStatusPanelProps = {
  members: GroupMemberRecord[]
  currentUserId: string | null
  capacity: number
  groupStats: Array<{ label: string; value: string }>
  memberMatchReadyByUserId: Map<string, boolean>
  queueStatusText: string
}

export function GroupMemberStatusPanel({
  members,
  currentUserId,
  capacity,
  groupStats,
  memberMatchReadyByUserId,
  queueStatusText,
}: GroupMemberStatusPanelProps) {
  const openSlots = Math.max(0, capacity - members.length)

  return (
    <section
      className="glass-card mb-5 rounded-3xl p-5"
      aria-label={groupStats.map((stat) => `${stat.label} ${stat.value}`).join(', ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-boot-muted">우리 그룹</p>
          <h2 className="mt-1 text-xl font-black">
            {members.length}/{capacity}명
          </h2>
          <p className="mt-1 text-xs text-boot-muted">{queueStatusText}</p>
        </div>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-boot-hairline bg-boot-soft">
          <Users size={22} className="text-boot-primary" />
        </div>
      </div>

      <p className="mb-2 mt-5 text-xs font-bold text-boot-muted">그룹 멤버</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {members.map((member) => {
          const isSelf = currentUserId != null && member.user_id === currentUserId
          const name = isSelf ? '나' : member.display_name ?? `친구 ${member.user_id.slice(0, 4)}`
          const statusLabel = getMemberStatusLabel(member.user_id, memberMatchReadyByUserId)

          return (
            <div
              key={member.user_id}
              className="min-h-[86px] rounded-2xl border border-boot-hairline bg-white/90 px-2 py-3 text-center"
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-boot-soft">
                {member.role === 'leader' ? <ShieldCheck size={16} /> : <Check size={16} />}
              </div>
              <p className="truncate text-sm font-bold">{name}</p>
              <p className="mt-0.5 text-[10px] text-boot-muted">
                {member.role === 'leader' ? '리더' : '멤버'} · {statusLabel}
              </p>
            </div>
          )
        })}
        {Array.from({ length: openSlots }).map((_, index) => (
          <div
            key={`open-${index}`}
            className="flex min-h-[86px] flex-col items-center justify-center rounded-2xl border border-dashed border-boot-hairline bg-white/70 px-2 py-3 text-center"
          >
            <UserPlus size={17} className="text-boot-muted" />
            <p className="mt-2 text-[11px] text-boot-muted">친구 자리</p>
          </div>
        ))}
      </div>
    </section>
  )
}
