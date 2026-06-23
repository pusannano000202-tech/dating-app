import { UserRound } from 'lucide-react'

type AvatarProps = {
  label?: string | null
  size?: 'sm' | 'md' | 'lg'
  tone?: 'primary' | 'soft' | 'neutral'
  className?: string
}

const sizes = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-14 w-14 text-base',
}

const tones = {
  primary: 'bg-boot-primary text-white',
  soft: 'bg-boot-soft text-boot-primary',
  neutral: 'bg-white text-boot-muted border border-boot-hairline',
}

export function Avatar({ label, size = 'md', tone = 'soft', className = '' }: AvatarProps) {
  const initial = label?.trim()?.charAt(0)

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center justify-center rounded-2xl font-black shadow-sm',
        sizes[size],
        tones[tone],
        className,
      ].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {initial || <UserRound size={size === 'sm' ? 16 : 19} />}
    </span>
  )
}
