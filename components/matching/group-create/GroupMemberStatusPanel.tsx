import { useRef, useState } from 'react'
import { Check, MoreHorizontal, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react'

import { getGroupCompositionSummary, getMemberStatusLabel } from './status'
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
  const [openMemberId, setOpenMemberId] = useState<string | null>(null)
  const longPressTimer = useRef<number | null>(null)
  const openSlots = Math.max(0, capacity - members.length)
  const composition = getGroupCompositionSummary(members)

  function clearLongPressTimer() {
    if (longPressTimer.current == null) return
    window.clearTimeout(longPressTimer.current)
    longPressTimer.current = null
  }

  function startLongPress(canRemove: boolean, memberUserId: string) {
    if (!canRemove || saving) return
    clearLongPressTimer()
    longPressTimer.current = window.setTimeout(() => {
      setOpenMemberId(memberUserId)
      longPressTimer.current = null
    }, 520)
  }

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

      <div className="mt-4 rounded-2xl border border-boot-hairline bg-white/75 px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-black text-boot-primary">성별 구성</p>
            <p className="mt-0.5 text-sm font-black text-boot-ink">{composition.label}</p>
          </div>
          <span className="rounded-full bg-boot-soft px-3 py-1 text-[11px] font-bold text-boot-primary">
            {composition.detail}
          </span>
        </div>
        {composition.unknown > 0 && (
          <p className="mt-2 text-[11px] leading-4 text-boot-muted">
            아직 기본정보가 완성되지 않은 친구는 성별 확인 중으로 표시돼요.
          </p>
        )}
      </div>

      <p className="mb-2 mt-5 text-xs font-bold text-boot-muted">그룹 멤버</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {members.map((member) => {
          const isSelf = currentUserId != null && member.user_id === currentUserId
          const name = isSelf ? '나' : member.display_name ?? `친구 ${member.user_id.slice(0, 4)}`
          const statusLabel = getMemberStatusLabel(member.user_id, memberMatchReadyByUserId)
          const ready = memberMatchReadyByUserId.get(member.user_id) === true
          const genderLabel = member.gender === 'male'
            ? '남자'
            : member.gender === 'female'
              ? '여자'
              : '성별 확인 중'
          const canRemove = canManageMembers && !isSelf && member.role !== 'leader'
          const actionOpen = openMemberId === member.user_id

          return (
            <div
              key={member.user_id}
              className="flex min-h-[168px] flex-col rounded-2xl border border-boot-hairline bg-white/90 px-3 py-3 text-center"
              onPointerDown={() => startLongPress(canRemove, member.user_id)}
              onPointerUp={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
            >
              <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-boot-soft text-boot-primary">
                {member.role === 'leader' ? <ShieldCheck size={16} /> : <Check size={16} />}
              </div>
              <p className="truncate text-sm font-black">{name}</p>
              <p className="mt-0.5 text-[10px] text-boot-muted">
                {member.role === 'leader' ? '리더' : '멤버'} · {genderLabel}
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
                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    aria-expanded={actionOpen}
                    aria-label={`${name} 친구 관리`}
                    disabled={saving}
                    onClick={() => setOpenMemberId(actionOpen ? null : member.user_id)}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-boot-hairline bg-boot-soft px-3 py-2 text-[11px] font-black text-boot-primary transition-colors hover:bg-boot-soft/70 disabled:opacity-40"
                  >
                    <MoreHorizontal size={13} />
                    친구 관리
                  </button>

                  {actionOpen && (
                    <div className="mt-2 rounded-xl border border-red-200 bg-red-50 p-2 text-left">
                      <p className="mb-2 text-[10px] leading-4 text-red-600">
                        친구 계정을 지우는 게 아니라 이 그룹 자리만 비워요. 대기 중이면 큐는 자동 취소됩니다.
                      </p>
                      <button
                        type="button"
                        aria-label={`${name}를 그룹에서 내보내기`}
                        disabled={saving}
                        onClick={() => onRemoveMember(member)}
                        className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[11px] font-black text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
                      >
                        <UserMinus size={12} />
                        그룹에서 내보내기
                      </button>
                    </div>
                  )}
                  {!actionOpen && (
                    <p className="mt-1 text-[10px] leading-4 text-boot-muted">
                      카드 길게 누르기로도 관리 메뉴를 열 수 있어요.
                    </p>
                  )}
                </div>
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
