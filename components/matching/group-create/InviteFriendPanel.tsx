import { Copy, Link as LinkIcon, UserPlus } from 'lucide-react'

import type { GroupInviteRecord } from './types'

type InviteFriendPanelProps = {
  copied: boolean
  saving: boolean
  pendingInvites: GroupInviteRecord[]
  onCopyInviteLink: () => void
}

export function InviteFriendPanel({
  copied,
  saving,
  pendingInvites,
  onCopyInviteLink,
}: InviteFriendPanelProps) {
  return (
    <section className="glass mb-5 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black">친구 초대하기</h2>
          <p className="mt-0.5 text-xs leading-5 text-boot-muted">
            링크를 받은 친구가 로그인/회원가입 후 초대를 수락해야 그룹에 들어옵니다.
            누가 나가면 이 링크로 다시 친구를 채울 수 있어요.
          </p>
        </div>
        <UserPlus size={18} className="text-boot-primary" />
      </div>

      <button
        type="button"
        onClick={onCopyInviteLink}
        disabled={saving}
        className="mb-3 flex w-full items-center justify-between rounded-2xl border border-boot-primary/20 bg-boot-soft px-4 py-3 text-sm disabled:opacity-40"
      >
        <span className="flex items-center gap-2 font-black text-boot-primary">
          <LinkIcon size={16} />
          그룹 초대 링크 복사
        </span>
        <span className="flex items-center gap-1 text-xs font-bold text-boot-primary">
          {copied ? '복사됨' : '복사'}
          <Copy size={14} />
        </span>
      </button>

      <p className="mt-2 rounded-2xl bg-white/75 px-3 py-2 text-[11px] leading-4 text-boot-muted">
        친구가 이미 회원이면 친구 목록에서 바로 초대하고, 아직 회원이 아니면 링크를 먼저 보내세요.
      </p>

      {pendingInvites.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-2">
              <span className="min-w-0 truncate text-xs text-boot-muted">
                {invite.invite_kind === 'link'
                  ? '공개 초대 링크'
                  : invite.invited_user_id
                    ? `친구 ${invite.invited_user_id.slice(0, 8)}`
                    : '초대 대상 확인 중'}
              </span>
              <span className="text-[10px] font-bold text-amber-700">수락 대기</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
