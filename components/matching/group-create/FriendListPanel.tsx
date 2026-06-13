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
      <div className="flex items-center justify-between px-1 mb-2">
        <h2 className="text-sm font-black">친구 목록</h2>
        <span className="text-xs text-boot-muted">{friends.length}명</span>
      </div>

      {friends.length === 0 ? (
        <div className="rounded-2xl border border-boot-hairline bg-white/80 px-4 py-5">
          <p className="text-sm text-boot-muted leading-relaxed">
            아직 등록된 친구가 없어요. 친구를 먼저 추가해야 그룹을 꾸릴 수 있어요.
          </p>
          <Link
            href="/friends"
            className="mt-3 inline-block px-4 py-2 rounded-xl text-xs font-bold border border-boot-primary/25 bg-boot-soft text-boot-primary"
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
            const actionLabel = isInGroup ? '준비 상태 보기' : isInvited ? '초대중' : '초대'
            const shouldShowMatchReady = isInGroup
            const statusClass = isInGroup
              ? memberMatchReadyByUserId.get(friend.user_id)
                ? 'text-emerald-700 bg-emerald-500/10 border-emerald-300/25'
                : 'text-amber-700 bg-amber-500/10 border-amber-300/25'
              : isInvited
                ? 'text-amber-700 bg-amber-500/10 border-amber-300/25'
                : 'text-boot-primary bg-boot-soft border-boot-hairline'

            return (
              <div key={friend.user_id} className="glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-boot-soft flex items-center justify-center text-sm font-black">
                  {friend.display_name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{friend.display_name}</p>
                  <p className="text-xs text-boot-muted truncate">{friend.phone ?? friend.user_id}</p>
                  <p className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] ${statusClass}`}>
                    {statusLabel}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => {
                    if (shouldShowMatchReady) return
                    onInviteFriend(friend)
                  }}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors disabled:opacity-45 ${
                    shouldShowMatchReady
                      ? statusClass
                      : canInvite
                        ? 'border-boot-hairline text-boot-primary bg-boot-soft hover:bg-violet-400/15'
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
