import { Plus } from 'lucide-react'

type DarkTeamProgressCardProps = {
  groupName?: string
  progressLabel?: string
  progressValue?: number
  members?: string[]
  status?: string
  className?: string
}

export default function DarkTeamProgressCard({
  groupName = '내 팀',
  progressLabel = '팀 성향 분석 3/4 완료',
  progressValue = 75,
  members = ['나'],
  status = '매칭 탐색 중',
  className = '',
}: DarkTeamProgressCardProps) {
  const clampedProgress = Math.max(0, Math.min(100, progressValue))

  return (
    <section className={['booting-deep-card rounded-[30px] p-5', className].filter(Boolean).join(' ')}>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-black text-white">{groupName}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#5A3325] px-3 py-2 text-xs font-black text-[#FFB08C]">
          <span className="h-2.5 w-2.5 rounded-full bg-boot-coral" />
          {status}
        </span>
      </div>

      <div className="mb-5 flex items-center gap-2">
        {members.slice(0, 3).map((member, index) => (
          <span
            key={`${member}-${index}`}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-boot-primary to-boot-coral text-sm font-black text-white shadow-[0_10px_20px_rgba(255,79,95,0.25)]"
          >
            {member.trim().slice(0, 1) || '나'}
          </span>
        ))}
        {members.length < 3 && (
          <span className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-white/35 text-white/70">
            <Plus size={16} />
          </span>
        )}
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-boot-primary via-boot-coral to-boot-amber"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
      <p className="mt-3 text-sm font-black text-white/60">{progressLabel}</p>
    </section>
  )
}
