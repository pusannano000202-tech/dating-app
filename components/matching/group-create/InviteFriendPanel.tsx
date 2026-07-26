import { Copy, MessageCircle, Share2, UserPlus } from 'lucide-react'

import type { GroupInviteRecord } from './types'

export type InviteShareTarget = 'kakao' | 'native' | 'copy'

type InviteFriendPanelProps = {
  copied: boolean
  saving: boolean
  sharePending: InviteShareTarget | null
  pendingInvites: GroupInviteRecord[]
  onShareInviteLink: (target: InviteShareTarget) => void
}

export function InviteFriendPanel({
  copied,
  saving,
  sharePending,
  pendingInvites,
  onShareInviteLink,
}: InviteFriendPanelProps) {
  return (
    <section className="glass mb-5 rounded-3xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black">친구 초대하기</h2>
          <p className="mt-0.5 text-xs leading-5 text-boot-muted">
            초대 링크를 카카오톡으로 보내거나, 휴대폰 공유창과 링크 복사를 같이 사용할 수 있어요.
            친구가 로그인/회원가입 후 초대를 수락해야 그룹에 들어옵니다.
          </p>
        </div>
        <UserPlus size={18} className="text-boot-primary" />
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onShareInviteLink('kakao')}
          disabled={saving}
          className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl border border-[#e5cc00] bg-[#FEE500] px-2 text-xs font-black text-[#191919] shadow-sm disabled:opacity-40"
        >
          <MessageCircle size={17} />
          {sharePending === 'kakao' ? '여는 중' : '카카오톡'}
        </button>
        <button
          type="button"
          onClick={() => onShareInviteLink('native')}
          disabled={saving}
          className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl border border-boot-primary/20 bg-boot-soft px-2 text-xs font-black text-boot-primary disabled:opacity-40"
        >
          <Share2 size={17} />
          {sharePending === 'native' ? '여는 중' : '공유'}
        </button>
        <button
          type="button"
          onClick={() => onShareInviteLink('copy')}
          disabled={saving}
          className="flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-2xl border border-boot-hairline bg-white px-2 text-xs font-black text-boot-ink disabled:opacity-40"
        >
          <Copy size={17} />
          {copied ? '복사됨' : sharePending === 'copy' ? '복사 중' : '복사'}
        </button>
      </div>

      <p className="mt-2 rounded-2xl bg-white/75 px-3 py-2 text-[11px] leading-4 text-boot-muted">
        카카오톡 공유가 막히면 자동으로 기본 공유창이나 링크 복사로 이어져요.
        초대 링크는 같은 그룹으로 들어오는 전용 입장 링크입니다.
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
