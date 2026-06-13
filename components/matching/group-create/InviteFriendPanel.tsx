import { Copy, Link as LinkIcon, Send, UserPlus } from 'lucide-react'

import type { GroupInviteRecord } from './types'

type InviteFriendPanelProps = {
  phone: string
  copied: boolean
  saving: boolean
  pendingInvites: GroupInviteRecord[]
  onPhoneChange: (value: string) => void
  onInviteByPhone: () => void
  onCopyInviteLink: () => void
}

export function InviteFriendPanel({
  phone,
  copied,
  saving,
  pendingInvites,
  onPhoneChange,
  onInviteByPhone,
  onCopyInviteLink,
}: InviteFriendPanelProps) {
  return (
    <section className="glass rounded-3xl p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-black">초대하기</h2>
          <p className="text-xs text-boot-muted mt-0.5">전화번호 또는 링크로 그룹 초대를 보내요</p>
        </div>
        <UserPlus size={18} className="text-boot-primary" />
      </div>

      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="010-0000-0000"
          className="flex-1 min-w-0 glass rounded-2xl px-4 py-3 text-sm text-boot-ink placeholder-boot-muted border border-boot-hairline focus:outline-none focus:border-boot-primary"
        />
        <button
          type="button"
          onClick={onInviteByPhone}
          disabled={saving || !phone.trim()}
          className="h-12 w-12 rounded-2xl btn-gradient flex items-center justify-center disabled:opacity-40"
          aria-label="전화번호 초대하기"
        >
          <Send size={17} />
        </button>
      </div>

      <button
        type="button"
        onClick={onCopyInviteLink}
        disabled={saving}
        className="mt-3 w-full rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 flex items-center justify-between text-sm disabled:opacity-40"
      >
        <span className="flex items-center gap-2 text-boot-body">
          <LinkIcon size={16} className="text-boot-primary" />
          초대 링크 복사
        </span>
        <span className="flex items-center gap-1 text-xs text-boot-muted">
          {copied ? '복사됨' : '복사'}
          <Copy size={14} />
        </span>
      </button>

      {pendingInvites.length > 0 && (
        <div className="mt-3 space-y-2">
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="rounded-2xl bg-white/80 px-3 py-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-xs text-boot-muted">
                {invite.invite_kind === 'link'
                  ? '공개 초대링크'
                  : invite.invited_user_id
                    ? `친구 ${invite.invited_user_id.slice(0, 8)}`
                    : invite.invited_phone ?? '대상 없음'}
              </span>
              <span className="text-[10px] font-bold text-amber-700">초대중</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
