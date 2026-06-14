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
    <section className="glass mb-5 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black">친구 초대하기</h2>
          <p className="mt-0.5 text-xs text-boot-muted">
            전화번호나 초대 링크로 그룹 초대를 보냅니다.
          </p>
        </div>
        <UserPlus size={18} className="text-boot-primary" />
      </div>

      <div className="flex gap-2">
        <input
          value={phone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="010-0000-0000"
          className="glass min-w-0 flex-1 rounded-2xl border border-boot-hairline px-4 py-3 text-sm text-boot-ink placeholder-boot-muted focus:border-boot-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={onInviteByPhone}
          disabled={saving || !phone.trim()}
          className="btn-gradient flex h-12 w-12 items-center justify-center rounded-2xl disabled:opacity-40"
          aria-label="전화번호로 초대하기"
        >
          <Send size={17} />
        </button>
      </div>

      <button
        type="button"
        onClick={onCopyInviteLink}
        disabled={saving}
        className="mt-3 flex w-full items-center justify-between rounded-2xl border border-boot-hairline bg-white/90 px-4 py-3 text-sm disabled:opacity-40"
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
            <div key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-3 py-2">
              <span className="min-w-0 truncate text-xs text-boot-muted">
                {invite.invite_kind === 'link'
                  ? '공개 초대 링크'
                  : invite.invited_user_id
                    ? `친구 ${invite.invited_user_id.slice(0, 8)}`
                    : invite.invited_phone ?? '대상 없음'}
              </span>
              <span className="text-[10px] font-bold text-amber-700">초대 중</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
