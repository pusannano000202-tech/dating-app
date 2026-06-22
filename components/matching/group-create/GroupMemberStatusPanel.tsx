import { Check, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react'

import { getMemberStatusLabel } from './status'
import type { GroupMemberRecord } from './types'

type GroupMemberStatusPanelProps = {
  members: GroupMemberRecord[]
  currentUserId: string | null
  capacity: number
  groupStats: Array<{ label: string; value: string }>
  memberMatchReadyByUserId: Map<string, boolean>
  queueStatusText: string
  canManageMembers: boolean
  saving: boolean
  onRemoveMember: (member: GroupMemberRecord) => void
}

export function GroupMemberStatusPanel({
  members,
  currentUserId,
  capacity,
  groupStats,
  memberMatchReadyByUserId,
  queueStatusText,
  canManageMembers,
  saving,
  onRemoveMember,
}: GroupMemberStatusPanelProps) {
  const openSlots = Math.max(0, capacity - members.length)

  return (
    <section
      className="glass-card mb-5 rounded-3xl p-5"
      aria-label={groupStats.map((stat) => `${stat.label} ${stat.value}`).join(', ')}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-boot-primary">현재 함께하는 친구</p>
          <h2 className="mt-1 text-xl font-black">
            {members.length}/{capacity}명
          </h2>
          <p className="mt-1 text-xs leading-5 text-boot-muted">{queueStatusText}</p>
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
          const ready = memberMatchReadyByUserId.get(member.user_id) === true

          const canRemove = canManageMembers && !isSelf && member.role !== 'leader'

          return (
            <div
              key={member.user_id}
              className="flex min-h-[148px] flex-col rounded-2xl border border-boot-hairline bg-white/90 px-3 py-3 text-center"
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-boot-soft text-boot-primary">
                {member.role === 'leader' ? <ShieldCheck size={16} /> : <Check size={16} />}
              </div>
              <p className="truncate text-sm font-black">{name}</p>
              <p className="mt-0.5 text-[10px] text-boot-muted">
                {member.role === 'leader' ? '리더' : '멤버'}
              </p>
              <p
                className={[
                  'mx-auto mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold',
                  ready
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-amber-200 bg-amber-50 text-amber-700',
                ].join(' ')}
              >
                {statusLabel}
              </p>
              {canRemove && (
                <button
                  type="button"
                  aria-label={`${name}님 그룹에서 내보내기`}
                  disabled={saving}
                  onClick={() => onRemoveMember(member)}
                  className="mt-auto inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
                >
                  <UserMinus size={12} />
                  그룹에서 내보내기
                </button>
              )}
              {canRemove && (
                <p className="mt-1 text-[10px] leading-4 text-red-500/80">
                  내보내면 큐 대기는 취소돼요
                </p>
              )}
            </div>
          )
        })}
        {Array.from({ length: openSlots }).map((_, index) => (
          <div
            key={`open-${index}`}
            className="flex min-h-[96px] flex-col items-center justify-center rounded-2xl border border-dashed border-boot-hairline bg-white/70 px-2 py-3 text-center"
          >
            <UserPlus size={17} className="text-boot-muted" />
            <p className="mt-2 text-[11px] font-bold text-boot-muted">친구 자리 {index + 1}</p>
            <p className="mt-1 text-[10px] leading-4 text-boot-muted">
              친구를 초대하면 이 자리에 함께 표시돼요.
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
