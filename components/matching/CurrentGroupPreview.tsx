import { Plus, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Chip } from '@/components/ui/Chip'

export type CurrentGroupMember = {
  user_id: string
  display_name: string | null
  role?: 'leader' | 'member' | string | null
  match_setup_ready?: boolean | null
}

type CurrentGroupPreviewProps = {
  members: CurrentGroupMember[]
  capacity?: number | null
  currentUserId?: string | null
  hasGroup?: boolean
  className?: string
}

export default function CurrentGroupPreview({
  members,
  capacity = 3,
  currentUserId = null,
  hasGroup = true,
  className = '',
}: CurrentGroupPreviewProps) {
  const safeCapacity = Math.max(2, Math.min(3, Number(capacity) || 3))
  const emptyCount = Math.max(0, safeCapacity - members.length)

  return (
    <section className={['rounded-3xl border border-boot-primary/15 bg-white/85 p-4 shadow-sm', className].filter(Boolean).join(' ')}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-boot-ink">현재 함께하는 친구</p>
          <p className="mt-0.5 text-xs text-boot-muted">
            {hasGroup && members.length > 0
              ? `${Math.min(members.length, safeCapacity)}/${safeCapacity}명 함께 준비 중`
              : '아직 그룹이 없어요'}
          </p>
        </div>
        <UsersRound size={18} className="text-boot-primary" />
      </div>

      <div className="space-y-2">
        {members.slice(0, safeCapacity).map((member) => {
          const isMe = member.user_id === currentUserId
          const label = isMe ? '나' : member.display_name || '친구'
          const roleLabel = member.role === 'leader' ? '리더' : member.match_setup_ready ? '준비됨' : '준비 필요'
          const roleTone = member.role === 'leader' ? 'primary' : member.match_setup_ready ? 'success' : 'warning'

          return (
            <div key={member.user_id} className="flex items-center gap-3 rounded-2xl border border-boot-hairline bg-white px-3 py-2.5">
              <Avatar label={label} size="sm" tone={member.role === 'leader' ? 'primary' : 'soft'} />
              <span className="min-w-0 flex-1 truncate text-sm font-black text-boot-ink">{label}</span>
              <Chip tone={roleTone}>{roleLabel}</Chip>
            </div>
          )
        })}

        {Array.from({ length: emptyCount }, (_, index) => (
          <div key={`empty-${index}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-boot-primary/20 bg-boot-soft/55 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white text-boot-primary shadow-sm">
              <Plus size={16} />
            </span>
            <span className="text-sm font-black text-boot-primary">친구 자리 {index + 1}</span>
          </div>
        ))}
      </div>

      <p className="mt-3 text-xs leading-5 text-boot-muted">
        친구가 가입하고 초대를 수락하면 이 그룹으로 성향, 시간, 비중을 맞춰 매칭 큐에 들어가요.
      </p>
    </section>
  )
}
