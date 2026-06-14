import Link from 'next/link'

import { getFriendMatchLabel } from './status'
import type { FriendSummary } from './types'

type FriendListPanelProps = {
  friends: FriendSummary[]
  saving: boolean
  openSlots: number
  memberMatchReadyByUserId: Map<string, boolean>
  onInviteFriend: (friend: FriendSummary) => void
}

export function FriendListPanel({
  friends,
  saving,
  openSlots,
  memberMatchReadyByUserId,
  onInviteFriend,
}: FriendListPanelProps) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-sm font-black">친구 목록</h2>
        <span className="text-xs text-boot-muted">{friends.length}명</span>
      </div>

      {friends.length === 0 ? (
        <div className="rounded-2xl border border-boot-hairline bg-white/80 px-4 py-5">
          <p className="text-sm leading-relaxed text-boot-muted">
            아직 등록된 친구가 없습니다. 친구를 먼저 추가해야 그룹을 꾸릴 수 있어요.
          </p>
          <Link
            href="/friends"
            className="mt-3 inline-block rounded-xl border border-boot-primary/25 bg-boot-soft px-4 py-2 text-xs font-bold text-boot-primary"
          >
            친구 추가하러 가기
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {friends.map((friend) => {
            const isInvited = friend.group_status === 'invited'
            const isInGroup = friend.group_status === 'in_group'
            const isDisabled = saving || openSlots === 0 || isInGroup || isInvited
            const statusLabel = getFriendMatchLabel(friend, memberMatchReadyByUserId)
            const canInvite = !saving && !isInvited && !isInGroup && openSlots > 0
            const actionLabel = isInGroup ? '그룹 참여중' : isInvited ? '초대 중' : '초대'
            const statusClass = isInGroup
              ? memberMatchReadyByUserId.get(friend.user_id)
                ? 'text-emerald-700 bg-emerald-500/10 border-emerald-300/25'
                : 'text-amber-700 bg-amber-500/10 border-amber-300/25'
              : isInvited
                ? 'text-amber-700 bg-amber-500/10 border-amber-300/25'
                : 'text-boot-primary bg-boot-soft border-boot-hairline'

            return (
              <div key={friend.user_id} className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-boot-soft text-sm font-black">
                  {friend.display_name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{friend.display_name}</p>
                  <p className="truncate text-xs text-boot-muted">{friend.phone ?? friend.user_id}</p>
                  <p className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] ${statusClass}`}>
                    {statusLabel}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (isInGroup) return
                    onInviteFriend(friend)
                  }}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-45 ${
                    isInGroup
                      ? statusClass
                      : canInvite
                        ? 'border-boot-hairline bg-boot-soft text-boot-primary hover:bg-violet-400/15'
                        : 'border-boot-hairline/40 text-boot-muted'
                  }`}
                >
                  {actionLabel}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
