import { LockKeyhole } from 'lucide-react'

type LockIconProps = {
  children: string
  className?: string
}

export function LockIcon({ children, className = '' }: LockIconProps) {
  return (
    <div className={['flex items-center justify-center gap-1.5 text-[11px] text-boot-muted', className].filter(Boolean).join(' ')}>
      <LockKeyhole size={13} />
      <span>{children}</span>
    </div>
  )
}
