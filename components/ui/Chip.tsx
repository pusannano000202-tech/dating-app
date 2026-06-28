import type { HTMLAttributes, ReactNode } from 'react'

type ChipTone = 'primary' | 'neutral' | 'success' | 'warning' | 'danger'

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode
  tone?: ChipTone
}

const tones: Record<ChipTone, string> = {
  primary: 'bg-boot-soft text-boot-primary border-boot-primary/15',
  neutral: 'bg-white text-boot-muted border-boot-hairline',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-600 border-red-200',
}

export function Chip({ children, tone = 'neutral', className = '', ...props }: ChipProps) {
  return (
    <span
      className={[
        'inline-flex h-7 items-center rounded-full border px-2.5 text-[11px] font-black',
        tones[tone],
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </span>
  )
}
