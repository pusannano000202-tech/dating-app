import { LockKeyhole } from 'lucide-react'

type LockedOpponentCardProps = {
  title?: string
  chemi?: number
  chips?: string[]
  description?: string
  revealed?: boolean
  className?: string
}

export default function LockedOpponentCard({
  title = '간호 트리오',
  chemi = 92,
  chips = ['차분한', '카페파', '수요일'],
  description = '프로필은 매칭 확정 후에 공개돼요',
  revealed = false,
  className = '',
}: LockedOpponentCardProps) {
  return (
    <section className={['booting-soft-card rounded-[30px] p-6', className].filter(Boolean).join(' ')}>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black text-boot-muted">추천 상대팀</p>
          <h2 className="mt-3 text-2xl font-black leading-tight text-boot-ink">{title}</h2>
        </div>
        <p className="text-xl font-black text-boot-primary">케미 {chemi}%</p>
      </div>

      <div className="mb-4 flex items-center">
        {[0, 1, 2].map((item) => (
          <span
            key={item}
            className="-mr-2 flex h-12 w-12 items-center justify-center rounded-full border-2 border-boot-surface bg-boot-soft text-lg font-black text-boot-muted"
          >
            {revealed ? item + 1 : '?'}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-boot-hairline bg-boot-soft px-3 py-2 text-xs font-black text-boot-body"
          >
            # {chip}
          </span>
        ))}
      </div>

      <p className="mt-5 flex items-center gap-1.5 text-xs font-bold text-boot-muted">
        <LockKeyhole size={14} />
        {description}
      </p>
    </section>
  )
}
